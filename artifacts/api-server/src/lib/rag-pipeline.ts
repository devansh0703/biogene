// Firecrawl scraper (via the official npm SDK) with a Jina Reader fallback,
// HTML→markdown chunking, and the full ingest pipeline:
//   topic → BM25 discovery → source URLs → scrape → chunk → NVIDIA embed
//   → Weaviate collection (one per topic)

import { ragEnv } from "./env";
import { embedPassages } from "./nvidia";
import {
  ensureRagCollection,
  deleteTopicObjects,
  insertChunks,
} from "./weaviate";
import { discoverTopic, buildSourceLinks, type TopicHit, type SourceLink } from "./topic-discovery";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Job registry (in-memory; the server is a single process)
// ---------------------------------------------------------------------------

export type RagJobStatus = "queued" | "discovering" | "scraping" | "embedding" | "indexing" | "ready" | "failed";

export interface RagJob {
  id: string;
  topic: string;
  status: RagJobStatus;
  stage: string;
  sources: SourceLink[];
  hits: TopicHit[];
  genes: string[];
  pagesScraped: number;
  chunksIndexed: number;
  error?: string;
  startedAt: string;
  updatedAt: string;
}

const jobs = new Map<string, RagJob>();

export function getRagJob(id: string): RagJob | undefined {
  return jobs.get(id);
}

function touch(job: RagJob, status: RagJobStatus, stage: string): void {
  job.status = status;
  job.stage = stage;
  job.updatedAt = new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Scraping
// ---------------------------------------------------------------------------

export interface ScrapedPage {
  url: string;
  title: string;
  markdown: string;
  source: string;
  publishedAt?: string;
}

interface FirecrawlDoc {
  markdown?: string;
  title?: string;
  metadata?: { title?: string; publishedTime?: string; sourceURL?: string; statusCode?: number };
}

/** Dynamic import so builds never hard-depend on the optional package. */
async function getFirecrawlClient(): Promise<unknown | null> {
  const env = ragEnv();
  if (!env.firecrawlApiKey) return null;
  try {
    const mod = (await import("firecrawl")) as unknown as {
      Firecrawl: new (opts: { apiKey: string }) => { scrape: (url: string, opts?: Record<string, unknown>) => Promise<FirecrawlDoc> };
    };
    return new mod.Firecrawl({ apiKey: env.firecrawlApiKey });
  } catch (err) {
    logger.warn({ err }, "firecrawl package unavailable, falling back to Jina Reader");
    return null;
  }
}

async function scrapeViaFirecrawl(client: unknown, url: string): Promise<ScrapedPage | null> {
  try {
    const doc = await (client as { scrape: (u: string, o?: Record<string, unknown>) => Promise<FirecrawlDoc> }).scrape(url, {
      formats: ["markdown"],
      onlyMainContent: true,
      timeout: 45_000,
    });
    const markdown = doc.markdown?.trim();
    if (!markdown || markdown.length < 80) return null;
    return {
      url,
      title: doc.metadata?.title ?? doc.title ?? url,
      markdown,
      source: "Firecrawl",
      publishedAt: doc.metadata?.publishedTime,
    };
  } catch (err) {
    logger.warn({ err, url }, "firecrawl scrape failed");
    return null;
  }
}

/** Jina Reader: free markdown extraction used when Firecrawl is not configured. */
async function scrapeViaJina(url: string): Promise<ScrapedPage | null> {
  const env = ragEnv();
  if (!env.jinaApiKey) return null;
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Authorization: `Bearer ${env.jinaApiKey}`,
        Accept: "text/plain",
        "X-Return-Format": "markdown",
      },
    });
    if (!res.ok) return null;
    const markdown = (await res.text()).trim();
    if (markdown.length < 80) return null;
    const titleMatch = markdown.match(/^Title:\s*(.+)$/m);
    return {
      url,
      title: titleMatch?.[1]?.trim() ?? url,
      markdown: markdown.replace(/^Title:.*$\n?|^URL Source:.*$\n?|^Markdown Content:\n?/gm, ""),
      source: "Jina Reader",
    };
  } catch (err) {
    logger.warn({ err, url }, "jina reader scrape failed");
    return null;
  }
}

export async function scrapeSources(sources: SourceLink[], onProgress?: (done: number, total: number, url: string) => void): Promise<ScrapedPage[]> {
  const client = await getFirecrawlClient();
  const pages: ScrapedPage[] = [];
  let done = 0;
  for (const src of sources) {
    const page = client ? (await scrapeViaFirecrawl(client, src.url)) ?? (await scrapeViaJina(src.url)) : await scrapeViaJina(src.url);
    if (page) {
      page.source = src.source; // the dataset the URL belongs to (PubMed, ChEMBL, …)
      pages.push(page);
    }
    done++;
    onProgress?.(done, sources.length, src.url);
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

export interface Chunk {
  url: string;
  title: string;
  source: string;
  chunkIndex: number;
  content: string;
  publishedAt?: string;
}

/** Split markdown into ~1200-char chunks on paragraph/heading boundaries. */
export function chunkPage(page: ScrapedPage): Chunk[] {
  const blocks = page.markdown
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  const chunks: Chunk[] = [];
  let current = "";
  const TARGET = 1200;
  const MAX = 1800;

  const flush = () => {
    const content = current.trim();
    if (content.length >= 60) {
      chunks.push({
        url: page.url,
        title: page.title,
        source: page.source,
        chunkIndex: chunks.length,
        content,
        publishedAt: page.publishedAt,
      });
    }
    current = "";
  };

  for (const block of blocks) {
    if (block.length > MAX) {
      // Hard-split giant blocks on sentence boundaries.
      flush();
      const sentences = block.split(/(?<=[.!?])\s+/);
      let buf = "";
      for (const s of sentences) {
        if ((buf + " " + s).length > TARGET) {
          if (buf.trim()) {
            chunks.push({
              url: page.url,
              title: page.title,
              source: page.source,
              chunkIndex: chunks.length,
              content: buf.trim(),
              publishedAt: page.publishedAt,
            });
          }
          buf = s;
        } else {
          buf = buf ? `${buf} ${s}` : s;
        }
      }
      if (buf.trim()) current = buf;
      continue;
    }
    if ((current + "\n\n" + block).length > TARGET) flush();
    current = current ? `${current}\n\n${block}` : block;
  }
  flush();
  return chunks.slice(0, 40); // safety cap per page
}

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

export function startRagJob(topic: string): RagJob {
  const id = `rag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const job: RagJob = {
    id,
    topic,
    status: "queued",
    stage: "queued",
    sources: [],
    hits: [],
    genes: [],
    pagesScraped: 0,
    chunksIndexed: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  jobs.set(id, job);
  // Fire and forget — the UI polls GET /api/rag/topics/:jobId.
  void runRagJob(job).catch((err) => {
    logger.error({ err, id }, "rag job crashed");
    job.error = err instanceof Error ? err.message : String(err);
    touch(job, "failed", job.error);
  });
  return job;
}

async function runRagJob(job: RagJob): Promise<void> {
  // 1. BM25 discovery over local datasets.
  touch(job, "discovering", "Running BM25 discovery over local datasets");
  const { hits, genes, title } = discoverTopic(job.topic);
  job.hits = hits;
  job.genes = genes;
  job.topic = title;
  job.sources = buildSourceLinks(job.topic, hits, genes);
  touch(job, "scraping", `Scraping ${job.sources.length} source pages`);

  // 2. Scrape (Firecrawl SDK, Jina Reader fallback).
  const pages = await scrapeSources(job.sources, (done, total, url) => {
    job.pagesScraped = done;
    touch(job, "scraping", `Scraping (${done}/${total}): ${url.slice(0, 80)}`);
  });
  if (pages.length === 0) {
    throw new Error("No pages could be scraped — check FIRECRAWL_API_KEY / JINA_API_KEY");
  }
  job.pagesScraped = pages.length;

  // 3. Chunk + embed.
  const chunks = pages.flatMap(chunkPage);
  if (chunks.length === 0) throw new Error("Scraped pages contained no usable text");
  touch(job, "embedding", `Embedding ${chunks.length} chunks with nvidia/nemotron-3-embed-1b`);
  const vectors: number[][] = [];
  const EMBED_BATCH = 64;
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const slice = chunks.slice(i, i + EMBED_BATCH);
    const vecs = await embedPassages(slice.map((c) => c.content));
    vectors.push(...vecs);
    touch(job, "embedding", `Embedded ${Math.min(i + EMBED_BATCH, chunks.length)}/${chunks.length}`);
  }

  // 4. Upload to Weaviate (single collection, topic-keyed; replaces prior build).
  touch(job, "indexing", "Uploading to Weaviate");
  await ensureRagCollection();
  await deleteTopicObjects(job.topic);
  const inserted = await insertChunks(
    chunks.map((c, i) => ({
      properties: {
        topic: job.topic,
        url: c.url,
        title: c.title,
        source: c.source,
        chunkIndex: c.chunkIndex,
        content: c.content,
        publishedAt: c.publishedAt,
        fetchedAt: new Date().toISOString(),
      },
      vector: vectors[i],
    })),
  );
  job.chunksIndexed = inserted;
  touch(job, "ready", `Ready — ${inserted} chunks from ${pages.length} pages across ${new Set(pages.map((p) => p.source)).size} sources`);
}
