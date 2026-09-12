// Central environment access for RAG services. Never throws: features check
// availability so the rest of the app keeps working when a service is absent.

function read(name: string): string | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  const t = v.trim().replace(/^["']|["']$/g, "");
  return t.length > 0 ? t : undefined;
}

export interface RagEnv {
  weaviateUrl?: string;
  weaviateApiKey?: string;
  firecrawlApiKey?: string;
  nvidiaApiKey?: string;
  jinaApiKey?: string;
  jinaRerankUrl?: string;
  rerankProvider: string;
  rerankModel: string;
}

export function ragEnv(): RagEnv {
  let weaviateUrl = read("WEAVIATE_URL");
  if (weaviateUrl && !weaviateUrl.startsWith("http")) weaviateUrl = `https://${weaviateUrl}`;

  return {
    weaviateUrl,
    weaviateApiKey: read("WEAVIATE_API_KEY"),
    firecrawlApiKey: read("FIRECRAWL_API_KEY"),
    nvidiaApiKey: read("NVIDIA_API_KEY"),
    jinaApiKey: read("JINA_API_KEY"),
    jinaRerankUrl: read("JINA_RERANK_URL") ?? "https://api.jina.ai/v1/rerank",
    rerankProvider: (read("RERANK_PROVIDER") ?? "jina").toLowerCase(),
    rerankModel: read("RERANK_MODEL") ?? "jina-reranker-v3",
  };
}

export function ragCapabilities() {
  const env = ragEnv();
  return {
    weaviate: Boolean(env.weaviateUrl && env.weaviateApiKey),
    firecrawl: Boolean(env.firecrawlApiKey),
    jinaFallback: Boolean(env.jinaApiKey),
    llm: Boolean(env.nvidiaApiKey),
    rerank: Boolean(env.jinaApiKey),
    embedding: Boolean(env.nvidiaApiKey),
  };
}
