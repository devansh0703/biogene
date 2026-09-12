// NVIDIA NIM / Integrate API client: chat (OpenAI-compatible, SSE streaming),
// embeddings, and reranking. Also wraps the Jina reranker configured in .env.

import { ragEnv } from "./env";

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export const CHAT_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
export const CHAT_FALLBACK_MODELS = ["nvidia/nemotron-3-super-120b-a12b"];
export const EMBED_MODEL = "nvidia/nemotron-3-embed-1b";
export const EMBED_DIMS = 2048;

function nvidiaHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": BROWSER_UA, // NVIDIA blocks Node's default UA with 403
    Accept: "application/json",
  };
}

async function readSseLines(res: Response, onDelta: (text: string) => void): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Streaming not supported by runtime");
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>;
        };
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) onDelta(delta.content);
      } catch {
        // keep-alive or partial frame — skip
      }
    }
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Streamed chat completion against the NVIDIA chat model.
 * `thinking: false` suppresses the reasoning preamble so only the final
 * answer text is streamed to the client.
 */
export async function chatStream(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<void> {
  const env = ragEnv();
  if (!env.nvidiaApiKey) throw new Error("NVIDIA_API_KEY is not configured");

  const models = [CHAT_MODEL, ...CHAT_FALLBACK_MODELS];
  let lastError: Error | null = null;
  for (const model of models) {
    // One retry per model — NVIDIA NIM throws transient 429/5xx often.
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
        method: "POST",
        headers: nvidiaHeaders(env.nvidiaApiKey),
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? 0.3,
          top_p: 0.9,
          max_tokens: opts.maxTokens ?? 1024,
          stream: true,
          chat_template_kwargs: { thinking: false },
        }),
      });
      if (res.ok) {
        await readSseLines(res, onDelta);
        return;
      }
      const body = await res.text().catch(() => "");
      lastError = new Error(`NVIDIA chat failed (${model}, ${res.status}): ${body.slice(0, 300)}`);
      const transient = res.status === 429 || res.status >= 500;
      if (!transient) throw lastError;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastError ?? new Error("NVIDIA chat failed");
}

/** Embed a batch of passages/documents. Returns one vector per input. */
export async function embedPassages(texts: string[]): Promise<number[][]> {
  const env = ragEnv();
  if (!env.nvidiaApiKey) throw new Error("NVIDIA_API_KEY is not configured");
  return embedBatch(texts, "passage", env.nvidiaApiKey);
}

/** Embed a single query for vector search (different pooling mode than passages). */
export async function embedQuery(text: string): Promise<number[]> {
  const env = ragEnv();
  if (!env.nvidiaApiKey) throw new Error("NVIDIA_API_KEY is not configured");
  const [vec] = await embedBatch([text], "query", env.nvidiaApiKey);
  return vec;
}

async function embedBatch(texts: string[], inputType: "query" | "passage", apiKey: string): Promise<number[][]> {
  const out: number[][] = [];
  // NVIDIA embeddings accept up to 256 inputs; keep batches modest for latency.
  const CHUNK = 32;
  for (let i = 0; i < texts.length; i += CHUNK) {
    const batch = texts.slice(i, i + CHUNK).map((t) => t.slice(0, 6000) || " ");
    const res = await fetch(`${NVIDIA_BASE}/embeddings`, {
      method: "POST",
      headers: nvidiaHeaders(apiKey),
      body: JSON.stringify({ input: batch, model: EMBED_MODEL, input_type: inputType, truncate: "END" }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`NVIDIA embeddings failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    out.push(...sorted.map((d) => d.embedding));
  }
  return out;
}

export interface RerankResult {
  index: number;
  relevanceScore: number;
}

/**
 * Rerank candidate documents against a query. Uses the configured Jina
 * reranker (RERANK_MODEL / JINA_RERANK_URL in .env). Falls back to identity
 * ordering when no reranker is configured.
 */
export async function rerank(query: string, documents: string[]): Promise<RerankResult[] | null> {
  const env = ragEnv();
  const rerankUrl = env.jinaRerankUrl;
  if (!env.jinaApiKey || !rerankUrl) return null;
  try {
    const res = await fetch(rerankUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.jinaApiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: env.rerankModel,
        query,
        documents,
        top_n: documents.length,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: Array<{ index: number; relevance_score: number }> };
    return (json.results ?? []).map((r) => ({ index: r.index, relevanceScore: r.relevance_score }));
  } catch {
    return null;
  }
}
