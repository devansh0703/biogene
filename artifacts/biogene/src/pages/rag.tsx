import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import {
  getGetRagCapabilitiesQueryOptions, getListRagTopicsQueryOptions, getGetRagJobQueryOptions,
  useCreateRagTopic, useDeleteRagTopic,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StructureCard } from "@/components/chat-structure";
import { useQueryParams, useSetQueryParams } from "@/lib/api-url";
import type { RagJob, RagSourceLink, RagTopicsResponseTopicsItem } from "@workspace/api-client-react";

// ---------------------------------------------------------------------------
// SSE chat client
// ---------------------------------------------------------------------------

interface Citation {
  n: number;
  url: string;
  title: string;
  source: string;
  snippet: string;
  score: number;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  pdbId?: string;
  pdbTitle?: string;
  streaming?: boolean;
}

function useRagChat(topic: string, onCitations?: (c: Citation[], structure: { pdbId: string; title: string } | null) => void) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(
    async (question: string) => {
      if (!topic || !question.trim() || busy) return;
      const history = messages
        .filter((m) => !m.streaming)
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [
        ...prev,
        { role: "user", content: question },
        { role: "assistant", content: "", streaming: true },
      ]);
      setBusy(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      let citations: Citation[] | undefined;
      let structure: { pdbId: string; title: string } | null = null;

      try {
        const res = await fetch("/api/rag/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({ topic, question, history }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let answer = "";
        let firstContext = true;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const lines = frame.split("\n");
            const event = lines.find((l) => l.startsWith("event:"))?.slice(6).trim();
            const dataLine = lines.find((l) => l.startsWith("data:"))?.slice(5).trim();
            if (!event || !dataLine) continue;
            const data = JSON.parse(dataLine) as Record<string, unknown>;
            if (event === "context" && firstContext) {
              firstContext = false;
              citations = data.citations as Citation[];
              const st = data.structure as { pdbId: string; title: string } | null;
              if (st?.pdbId) structure = st;
              onCitations?.(citations, structure);
            } else if (event === "token") {
              answer += String(data.t ?? "");
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: answer, streaming: true, citations };
                return next;
              });
            } else if (event === "done") {
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  role: "assistant",
                  content: String(data.answer ?? answer),
                  citations,
                  pdbId: structure?.pdbId,
                  pdbTitle: structure?.title,
                };
                return next;
              });
            } else if (event === "error") {
              throw new Error(String(data.error ?? "stream error"));
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg !== "The user aborted a request." && !ctrl.signal.aborted) {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              role: "assistant",
              content: `⚠️ ${msg}`,
              citations,
              streaming: false,
            };
            return next;
          });
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [topic, busy, messages, onCitations],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const clear = useCallback(() => setMessages([]), []);
  return { messages, ask, stop, clear, busy };
}

// ---------------------------------------------------------------------------
// Build-progress card
// ---------------------------------------------------------------------------

const STATUS_STEPS = ["discovering", "scraping", "embedding", "indexing", "ready"] as const;

function BuildProgress({ job }: { job: RagJob }) {
  const stepIdx = STATUS_STEPS.indexOf(job.status as (typeof STATUS_STEPS)[number]);
  return (
    <Card className="rounded-none border-primary/40 bg-primary/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-bold uppercase tracking-wide">Building “{job.topic}”</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_STEPS.map((s, i) => (
            <Badge
              key={s}
              variant="outline"
              className={
                i < stepIdx
                  ? "border-primary text-primary"
                  : i === stepIdx
                    ? "border-primary bg-primary text-primary-foreground animate-pulse"
                    : "opacity-40"
              }
            >
              {s}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground font-mono">{job.stage}</p>
        {job.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-auto">
            {job.sources.map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-mono text-muted-foreground hover:text-primary underline-offset-2 hover:underline"
              >
                {s.source}
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RagChat() {
  const params = useQueryParams();
  const setParams = useSetQueryParams();
  const topic = params.t ?? "";

  const capsQuery = useQuery(getGetRagCapabilitiesQueryOptions());
  const topicsQuery = useQuery(getListRagTopicsQueryOptions());
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [sidebarCitations, setSidebarCitations] = useState<Citation[] | null>(null);
  const [sidebarStructure, setSidebarStructure] = useState<{ pdbId: string; title: string } | null>(null);

  const jobQuery = useQuery({
    ...getGetRagJobQueryOptions(jobId ?? ""),
    enabled: Boolean(jobId),
    refetchInterval: (q) => {
      const st = q.state.data?.status;
      return st === "ready" || st === "failed" ? false : 1500;
    },
  });

  const createTopic = useCreateRagTopic({
    mutation: {
      onSuccess: (job) => {
        setJobId(job.id);
      },
    },
  });
  const deleteTopic = useDeleteRagTopic({
    mutation: { onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/rag/topics"] }) },
  });

  const onCitations = useCallback(
    (c: Citation[], structure: { pdbId: string; title: string } | null) => {
      setSidebarCitations(c);
      setSidebarStructure(structure);
    },
    [],
  );
  const chat = useRagChat(topic, onCitations);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages.length, chat.messages[chat.messages.length - 1]?.content]);

  // When the build job finishes: refresh topic list and enter the chat.
  useEffect(() => {
    const st = jobQuery.data?.status;
    if (st === "ready") {
      void queryClient.invalidateQueries({ queryKey: ["/api/rag/topics"] });
      setParams({ t: jobQuery.data?.topic ?? null });
      setJobId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobQuery.data?.status]);

  const topics = topicsQuery.data?.topics ?? [];
  const activeTopic: RagTopicsResponseTopicsItem | undefined = topics.find((t) => t.topic === topic);

  const submitTopic = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setDraft("");
    setSidebarCitations(null);
    setSidebarStructure(null);
    createTopic.mutate({ data: { topic: t } });
  };

  const submitQuestion = () => {
    const q = draft.trim();
    if (!q || !topic) return;
    setDraft("");
    void chat.ask(q);
  };

  // Deep link ?q=... on a fresh topic: auto-build then auto-ask.
  const pendingQuestion = params.q;
  useEffect(() => {
    if (pendingQuestion && topic && !chat.busy && chat.messages.length === 0) {
      setParams({ q: null });
      void chat.ask(pendingQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuestion, topic]);

  const caps = capsQuery.data;

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* Left rail: topics + build status */}
      <aside className="w-72 flex-shrink-0 space-y-4 overflow-auto">
        <Card className="rounded-none border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm uppercase tracking-wide">New Research Topic</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              placeholder="e.g. haemoglobin, BRCA1, imatinib…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitTopic(draft)}
              data-testid="rag-topic-input"
            />
            <Button
              className="w-full rounded-none uppercase text-xs font-bold"
              onClick={() => submitTopic(draft)}
              disabled={!draft.trim() || createTopic.isPending}
              data-testid="rag-build-btn"
            >
              {createTopic.isPending ? "Starting…" : "Build knowledge base"}
            </Button>
            {caps && (
              <p className="text-[10px] text-muted-foreground font-mono uppercase">
                scrape: {caps.scrapingMode} · vec: weaviate · llm: {caps.chatModel?.split("/").pop()}
              </p>
            )}
            {caps && !caps.weaviate && (
              <p className="text-[10px] text-red-400 font-mono">WEAVIATE_URL / WEAVIATE_API_KEY missing</p>
            )}
            {caps && !caps.firecrawl && caps.jinaFallback && (
              <p className="text-[10px] text-amber-400 font-mono">FIRECRAWL_API_KEY missing — using Jina Reader fallback</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-none border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm uppercase tracking-wide">Indexed Topics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {topicsQuery.isLoading && <Skeleton className="h-16 w-full" />}
            {!topicsQuery.isLoading && topics.length === 0 && (
              <p className="text-xs text-muted-foreground font-mono">
                None yet. Type a topic above — BioGene finds sources via BM25, scrapes them, embeds with NVIDIA, and stores everything in Weaviate.
              </p>
            )}
            {topics.map((t) => (
              <div
                key={t.collection}
                className={`group flex items-center justify-between gap-2 px-2 py-1.5 border text-xs font-mono cursor-pointer ${
                  t.topic === topic ? "border-primary bg-primary/10" : "border-transparent hover:bg-secondary"
                }`}
                onClick={() => {
                  setParams({ t: t.topic });
                  setSidebarCitations(null);
                  setSidebarStructure(null);
                  chat.clear();
                }}
              >
                <span className="truncate">{t.topic}</span>
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  <Badge variant="outline" className="text-[10px]">{t.chunks}</Badge>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTopic.mutate({ name: t.topic });
                      if (topic === t.topic) setParams({ t: null });
                    }}
                    title="Delete topic"
                  >
                    ✕
                  </button>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {jobId && jobQuery.data && <BuildProgress job={jobQuery.data} />}
      </aside>

      {/* Center: chat */}
      <section className="flex-1 flex flex-col min-w-0 border border-border bg-card">
        <header className="border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-bold uppercase tracking-wide truncate">
              {topic ? `Research Chat — ${topic}` : "Research Chat"}
            </h2>
            <p className="text-[11px] text-muted-foreground font-mono uppercase truncate">
              {activeTopic
                ? `${activeTopic.chunks} chunks · ${activeTopic.sources.length} sources · weaviate + nvidia nemotron`
                : "BM25 discovery → firecrawl scrape → nvidia embed → weaviate → rerank → nemotron"}
            </p>
          </div>
          {chat.messages.length > 0 && (
            <Button variant="outline" size="sm" className="rounded-none uppercase text-[11px]" onClick={chat.clear}>
              Clear
            </Button>
          )}
        </header>

        <div className="flex-1 overflow-auto p-4 space-y-4 min-h-0" data-testid="rag-chat-scroll">
          {!topic && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-muted-foreground">
              <p className="text-2xl font-bold uppercase text-foreground">Ask BioGene anything</p>
              <p className="text-xs font-mono max-w-md uppercase leading-relaxed">
                Enter a topic on the left. We BM25-match it against every local dataset, scrape matching PubMed / ChEMBL /
                RCSB / UniProt pages, embed them with nvidia/nemotron-3-embed, store vectors in Weaviate, and chat with
                nemotron-3.5-lightning — grounded, cited, with 3D structures.
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {["haemoglobin", "BRCA1", "CRISPR-Cas9", "imatinib"].map((s) => (
                  <Button key={s} variant="outline" size="sm" className="rounded-none font-mono" onClick={() => submitTopic(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {topic && chat.messages.length === 0 && !jobId && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-muted-foreground">
              <p className="text-sm font-mono uppercase">Knowledge base ready — {activeTopic?.chunks ?? "…"} chunks indexed</p>
              <p className="text-xs font-mono uppercase">Ask anything about “{topic}”. Answers cite their sources [1] [2]…</p>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {(activeTopic?.sources ?? []).slice(0, 4).map((s) => (
                  <Badge key={s.url} variant="outline" className="font-mono text-[10px]">{s.source}</Badge>
                ))}
              </div>
            </div>
          )}

          {chat.messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] px-4 py-3 text-sm ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/40 border border-border"
                }`}
              >
                {m.role === "assistant" ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown
                      components={{
                        a: (props) => <a {...props} target="_blank" rel="noreferrer" className="text-primary underline" />,
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                    {m.streaming && <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1 align-middle" />}
                  </div>
                ) : (
                  <span className="font-mono">{m.content}</span>
                )}

                {/* per-answer citations */}
                {m.role === "assistant" && m.citations && m.citations.length > 0 && !m.streaming && (
                  <div className="mt-3 pt-2 border-t border-border/60 space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Sources for this answer</p>
                    {m.citations.map((c) => (
                      <a
                        key={c.n}
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground hover:text-primary"
                      >
                        <span className="text-primary">[{c.n}]</span>
                        <span className="flex-shrink-0">{c.source}</span>
                        <span className="truncate">{c.title}</span>
                        <span className="ml-auto flex-shrink-0 opacity-60">{c.score}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="border-t border-border p-3 flex gap-2 flex-shrink-0">
          <Input
            placeholder={topic ? `Ask about ${topic}…` : "Build a topic first, then ask here"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submitQuestion()}
            disabled={!topic}
            data-testid="rag-chat-input"
          />
          {chat.busy ? (
            <Button variant="destructive" className="rounded-none uppercase text-xs" onClick={chat.stop}>
              Stop
            </Button>
          ) : (
            <Button className="rounded-none uppercase text-xs font-bold" onClick={submitQuestion} disabled={!topic || !draft.trim()}>
              Send
            </Button>
          )}
        </div>
      </section>

      {/* Right rail: sources (pinned) + structure */}
      <aside className="w-80 flex-shrink-0 space-y-4 overflow-auto" data-testid="rag-sources">
        {sidebarStructure?.pdbId && (
          <StructureCard pdbId={sidebarStructure.pdbId} title={sidebarStructure.title} />
        )}

        <Card className="rounded-none border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm uppercase tracking-wide">
              {topic ? `Sources — ${topic}` : "Sources"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Citations from the latest answer stay pinned here */}
            {sidebarCitations && sidebarCitations.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Last answer context (reranked)</p>
                {sidebarCitations.map((c) => (
                  <a
                    key={c.n}
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block border border-border/60 hover:border-primary/60 p-2 group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase text-primary">[{c.n}] {c.source}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{c.score}</span>
                    </div>
                    <p className="text-[11px] font-mono truncate group-hover:text-primary">{c.title}</p>
                    <p className="text-[10px] text-muted-foreground line-clamp-2">{c.snippet}</p>
                  </a>
                ))}
              </div>
            )}

            {/* Full source list of the topic — always visible */}
            {(activeTopic?.sources ?? jobQuery.data?.sources ?? []).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">All scraped pages</p>
                {(activeTopic?.sources ?? jobQuery.data?.sources ?? []).map((s: RagSourceLink) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block border border-border/60 hover:border-primary/60 p-2 group"
                  >
                    <span className="text-[10px] font-mono uppercase text-muted-foreground group-hover:text-primary">{s.source}</span>
                    <p className="text-[11px] font-mono truncate">{s.title}</p>
                  </a>
                ))}
              </div>
            )}

            {!topic && (
              <p className="text-xs text-muted-foreground font-mono">
                Every source we retrieve stays pinned here while you chat.
              </p>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
