// Minimal Weaviate Cloud REST client (v1 API). Uses ONE fixed collection
// ("BioGeneRag") with a `topic` property — free-tier sandboxes cap the number
// of collections, so every topic lives in the same collection and is isolated
// with where-filters. Vectors come from NVIDIA embeddings (vectorizer: none).

import { randomUUID } from "crypto";
import { ragEnv } from "./env";
import { logger } from "./logger";

export const RAG_COLLECTION = "BioGeneRag";

export interface WeaviateChunkProperties {
  topic: string;
  url: string;
  title: string;
  source: string;
  chunkIndex: number;
  content: string;
  publishedAt?: string;
  fetchedAt: string;
}

export interface VectorHit {
  content: string;
  url: string;
  title: string;
  source: string;
  chunkIndex: number;
  certainty: number;
}

async function wvFetch<T>(path: string, init: RequestInit & { expectOk?: boolean } = {}): Promise<{ status: number; json: T | null; text: string }> {
  const env = ragEnv();
  if (!env.weaviateUrl || !env.weaviateApiKey) throw new Error("Weaviate is not configured (WEAVIATE_URL / WEAVIATE_API_KEY)");
  const res = await fetch(`${env.weaviateUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.weaviateApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text().catch(() => "");
  let json: T | null = null;
  try {
    json = text ? (JSON.parse(text) as T) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

/** Create the fixed RAG collection if missing (with every property we query). */
export async function ensureRagCollection(): Promise<void> {
  const { status, text } = await wvFetch<{ classes?: Array<{ class: string }> }>("/v1/schema", { method: "GET" });
  if (status !== 200) throw new Error(`Weaviate schema check failed (${status}): ${text.slice(0, 200)}`);
  const schema = text ? JSON.parse(text) as { classes?: Array<{ class: string }> } : { classes: [] };
  if (schema.classes?.some((c) => c.class === RAG_COLLECTION)) return;

  const create = await wvFetch("/v1/schema", {
    method: "POST",
    body: JSON.stringify({
      class: RAG_COLLECTION,
      description: "BioGene RAG chunks: one collection, isolated per topic via the topic property",
      vectorizer: "none",
      properties: [
        { name: "topic", dataType: ["string"], tokenization: "field" },
        { name: "url", dataType: ["string"], tokenization: "field" },
        { name: "title", dataType: ["string"], tokenization: "word" },
        { name: "source", dataType: ["string"], tokenization: "field" },
        { name: "chunkIndex", dataType: ["int"] },
        { name: "content", dataType: ["text"], tokenization: "word" },
        { name: "publishedAt", dataType: ["text"], tokenization: "field" },
        { name: "fetchedAt", dataType: ["text"], tokenization: "field" },
      ],
    }),
  });
  if (create.status !== 200 && create.status !== 422) {
    // A failed create MUST be fatal — otherwise inserts hit auto-schema and
    // silently produce a class missing properties (this bit us with hnsw/hfresh).
    throw new Error(`Weaviate collection create failed (${create.status}): ${create.text.slice(0, 300)}`);
  }
}

/** Delete all chunks of one topic (rebuild support). */
export async function deleteTopicObjects(topic: string): Promise<void> {
  await wvFetch("/v1/batch/objects", {
    method: "DELETE",
    body: JSON.stringify({
      match: { class: RAG_COLLECTION, where: { path: ["topic"], operator: "Equal", valueText: topic } },
      output: "minimal",
    }),
  });
}

export async function insertChunks(
  chunks: Array<{ properties: WeaviateChunkProperties; vector: number[] }>,
): Promise<number> {
  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const objects = slice.map((c) => ({
      class: RAG_COLLECTION,
      id: randomUUID(),
      properties: c.properties,
      vector: c.vector,
    }));
    const { status, text } = await wvFetch<Array<{ result?: { status?: string; errors?: unknown } }>>("/v1/batch/objects", {
      method: "POST",
      body: JSON.stringify({ objects }),
    });
    if (status !== 200) {
      logger.warn({ status, body: text.slice(0, 300) }, "weaviate batch insert failed");
      throw new Error(`Weaviate insert failed (${status}): ${text.slice(0, 300)}`);
    }
    const failed = (text ? JSON.parse(text) as Array<{ result?: { status?: string } }> : []).filter((r) => r.result?.status !== "SUCCESS");
    if (failed.length > 0) logger.warn({ failed: failed.length }, "some weaviate objects failed to insert");
    inserted += slice.length - failed.length;
  }
  return inserted;
}

/** Near-vector semantic search inside one topic. */
export async function searchTopic(topic: string, vector: number[], limit: number): Promise<VectorHit[]> {
  const gql = `{
    Get {
      ${RAG_COLLECTION}(
        nearVector: { vector: [${vector.map((n) => n.toFixed(6)).join(",")}], distance: 0.85 }
        where: { path: ["topic"], operator: Equal, valueText: ${JSON.stringify(topic)} }
        limit: ${limit}
      ) {
        content url title source chunkIndex publishedAt
        _additional { certainty }
      }
    }
  }`;
  const { status, json, text } = await wvFetch<{ data?: { Get?: Record<string, Array<Record<string, unknown>>> } } | { errors?: Array<{ message: string }> }>(
    "/v1/graphql",
    { method: "POST", body: JSON.stringify({ query: gql }) },
  );
  if (status !== 200) throw new Error(`Weaviate search failed (${status}): ${text.slice(0, 300)}`);
  const payload = json as { data?: { Get?: Record<string, Array<Record<string, unknown>>> }; errors?: Array<{ message: string }> } | null;
  if (payload?.errors?.length) throw new Error(`Weaviate GraphQL error: ${payload.errors[0].message}`);
  const rows = payload?.data?.Get?.[RAG_COLLECTION] ?? [];
  return rows.map((r) => ({
    content: String(r.content ?? ""),
    url: String(r.url ?? ""),
    title: String(r.title ?? ""),
    source: String(r.source ?? ""),
    chunkIndex: Number(r.chunkIndex ?? 0),
    certainty: Number((r._additional as { certainty?: number })?.certainty ?? 0),
  }));
}

export interface TopicSummary {
  topic: string;
  collection: string;
  chunks: number;
  sources: Array<{ source: string; url: string; title: string }>;
  fetchedAt?: string;
}

/** Group chunks by topic: counts, plus distinct scraped source pages. */
export async function listTopics(): Promise<TopicSummary[]> {
  const aggQ = `{ Aggregate { ${RAG_COLLECTION}(groupBy: ["topic"]) { groupedBy { value } meta { count } } } }`;
  const agg = await wvFetch<{ data?: { Aggregate?: Record<string, Array<{ groupedBy?: { value?: string }; meta?: { count?: number } }>> } }>(
    "/v1/graphql",
    { method: "POST", body: JSON.stringify({ query: aggQ }) },
  );
  if (agg.status !== 200 || !agg.json) return [];
  const groups = agg.json.data?.Aggregate?.[RAG_COLLECTION] ?? [];

  const out: TopicSummary[] = [];
  for (const g of groups) {
    const topic = String(g.groupedBy?.value ?? "");
    if (!topic) continue;
    const chunks = Number(g.meta?.count ?? 0);
    const srcQ = `{ Get { ${RAG_COLLECTION}(limit: 100, where: { path: ["topic"], operator: Equal, valueText: ${JSON.stringify(topic)} }) { url title source fetchedAt } } }`;
    const src = await wvFetch<{ data?: { Get?: Record<string, Array<Record<string, unknown>>> } }>(
      "/v1/graphql",
      { method: "POST", body: JSON.stringify({ query: srcQ }) },
    );
    const rows = src.json?.data?.Get?.[RAG_COLLECTION] ?? [];
    const seen = new Set<string>();
    const sources: TopicSummary["sources"] = [];
    let fetchedAt: string | undefined;
    for (const r of rows) {
      const url = String(r.url ?? "");
      if (url && !seen.has(url)) {
        seen.add(url);
        sources.push({ source: String(r.source ?? "web"), url, title: String(r.title ?? url) });
      }
      fetchedAt = fetchedAt ?? (r.fetchedAt ? String(r.fetchedAt) : undefined);
    }
    out.push({ topic, collection: RAG_COLLECTION, chunks, sources, fetchedAt });
  }
  return out.sort((a, b) => a.topic.localeCompare(b.topic));
}
