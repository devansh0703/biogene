import { Router } from "express";
import { ragCapabilities } from "../lib/env";
import {
  listTopics,
  searchTopic,
  deleteTopicObjects,
  type TopicSummary,
  type VectorHit,
} from "../lib/weaviate";
import { startRagJob, getRagJob, type RagJob } from "../lib/rag-pipeline";
import { embedQuery, rerank, chatStream, CHAT_MODEL, type ChatMessage } from "../lib/nvidia";
import { resolvePdbForTopic } from "../lib/structure-lookup";

const router = Router();

function jobToJson(job: RagJob) {
  return {
    id: job.id,
    topic: job.topic,
    status: job.status,
    stage: job.stage,
    sources: job.sources,
    hits: job.hits,
    genes: job.genes,
    pagesScraped: job.pagesScraped,
    chunksIndexed: job.chunksIndexed,
    error: job.error,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
  };
}

/** Capability probe so the UI can show what is configured. */
router.get("/rag/capabilities", (_req, res) => {
  const caps = ragCapabilities();
  res.json({ ...caps, chatModel: CHAT_MODEL, scrapingMode: caps.firecrawl ? "firecrawl" : caps.jinaFallback ? "jina-reader" : "none" });
});

/** All indexed topics (one Weaviate collection per topic). */
router.get("/rag/topics", async (_req, res) => {
  try {
    const topics: TopicSummary[] = await listTopics();
    res.json({ topics });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Weaviate unavailable" });
  }
});

/** Kick off a new topic build (scrape → embed → index). */
router.post("/rag/topics", (req, res) => {
  const topic = String(req.body?.topic ?? "").trim();
  if (!topic) {
    res.status(400).json({ error: "topic is required" });
    return;
  }
  if (topic.length > 120) {
    res.status(400).json({ error: "topic too long" });
    return;
  }
  const caps = ragCapabilities();
  if (!caps.weaviate) {
    res.status(503).json({ error: "Weaviate is not configured (WEAVIATE_URL / WEAVIATE_API_KEY)" });
    return;
  }
  if (!caps.firecrawl && !caps.jinaFallback) {
    res.status(503).json({ error: "No scraper configured (FIRECRAWL_API_KEY or JINA_API_KEY)" });
    return;
  }
  res.status(202).json(jobToJson(startRagJob(topic)));
});

/** Poll a build job. */
router.get("/rag/jobs/:id", (req, res) => {
  const job = getRagJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "job not found" });
    return;
  }
  res.json(jobToJson(job));
});

/** Delete a topic (removes all of its chunks from Weaviate). */
router.delete("/rag/topics/:name", async (req, res) => {
  try {
    await deleteTopicObjects(req.params.name);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Weaviate delete failed" });
  }
});

/**
 * Ask a question against a topic: Weaviate near-vector search over the NVIDIA
 * query embedding → Jina rerank → nemotron chat answer (SSE token stream).
 * The final SSE event includes the citations so the UI can pin them.
 */
router.post("/rag/chat", async (req, res) => {
  const topic = String(req.body?.topic ?? "").trim();
  const question = String(req.body?.question ?? "").trim();
  const history: Array<{ role: "user" | "assistant"; content: string }> = Array.isArray(req.body?.history)
    ? req.body.history.filter((m: { role?: string; content?: string }) => m?.role && m?.content).slice(-8)
    : [];

  if (!topic || !question) {
    res.status(400).json({ error: "topic and question are required" });
    return;
  }

  const caps = ragCapabilities();
  if (!caps.weaviate || !caps.embedding) {
    res.status(503).json({ error: "RAG not configured (need WEAVIATE_URL/KEY and NVIDIA_API_KEY)" });
    return;
  }

  try {
    // 1. Retrieve — semantic search with the NVIDIA query embedding.
    const qVec = await embedQuery(question);
    let hits: VectorHit[] = [];
    try {
      hits = await searchTopic(topic, qVec, 24);
    } catch {
      res.status(404).json({ error: `No indexed knowledge for topic "${topic}" — build it first` });
      return;
    }
    if (hits.length === 0) {
      res.status(404).json({ error: `No indexed knowledge for topic "${topic}" — build it first` });
      return;
    }

    // 2. Rerank (Jina) and keep the top 8 passages as context.
    let ranked = hits;
    const rr = await rerank(question, hits.map((h) => `${h.title}\n${h.content}`));
    if (rr) ranked = [...rr].sort((a, b) => b.relevanceScore - a.relevanceScore).map((r) => hits[r.index]);
    const context = ranked.slice(0, 8);

    // 3. Optional 3D structure suggestion (PDB id for the topic, if any).
    const structure = await resolvePdbForTopic(topic);

    // 4. Grounded generation, streamed token-by-token.
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send("context", {
      citations: context.map((c, i) => ({
        n: i + 1,
        url: c.url,
        title: c.title,
        source: c.source,
        snippet: c.content.slice(0, 220),
        score: Number(rr?.[i]?.relevanceScore?.toFixed(3) ?? c.certainty.toFixed(3)),
      })),
      structure,
    });

    const system: ChatMessage = {
      role: "system",
      content:
        `You are BioGene's research assistant answering questions about "${topic}". ` +
        "Answer ONLY from the numbered context passages below. Cite passages inline as [1], [2] matching the numbers. " +
        "If the passages do not contain the answer, say so plainly. Be concise and scientific. Use markdown.",
    };
    const user: ChatMessage = {
      role: "user",
      content:
        context.map((c, i) => `[${i + 1}] (${c.source} — ${c.url})\n${c.content}`).join("\n\n---\n\n") +
        `\n\nQuestion: ${question}`,
    };

    let answer = "";
    await chatStream([system, ...history.slice(-6) as ChatMessage[], user], (delta) => {
      answer += delta;
      send("token", { t: delta });
    }, { maxTokens: 1400 });

    send("done", { answer, question });
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : "RAG chat failed" });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`);
      res.end();
    }
  }
});

export default router;
