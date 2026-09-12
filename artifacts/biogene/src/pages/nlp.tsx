import { useState, useMemo, useEffect, Component, type ReactNode } from "react";
import {
  useExtractBiomedicalEntities, getSearchPubmedPapersQueryOptions, getGetKnowledgeGraphQueryOptions,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChartCard, CountPieChart, TimelineChart, type Count } from "@/components/charts";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { ExternalLink } from "lucide-react";

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

class WebGLErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const ENTITY_COLORS: Record<string, string> = {
  gene: "#ffffff",
  disease: "#aaaaaa",
  drug: "#cccccc",
  organism: "#888888",
  mutation: "#555555",
  protein: "#999999",
};

interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: string;
  count: number;
  position: [number, number, number];
}

interface KnowledgeGraphEdge {
  source: string;
  target: string;
  relation: string;
  confidence: number;
}

function KnowledgeGraph3D({ nodes, edges }: { nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] }) {
  const positions = useMemo(() => {
    const map: Record<string, [number, number, number]> = {};
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      const r = 4 + (i % 3) * 1.5;
      map[n.label.toLowerCase()] = [
        Math.cos(angle) * r,
        ((i % 5) - 2) * 0.8,
        Math.sin(angle) * r,
      ];
    });
    return map;
  }, [nodes]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      {nodes.slice(0, 60).map((node) => {
        const pos = positions[node.label.toLowerCase()];
        if (!pos) return null;
        const color = ENTITY_COLORS[node.type] ?? "#ffffff";
        const size = Math.max(0.08, Math.min(0.3, (node.count ?? 1) * 0.04));
        return (
          <mesh key={node.id} position={pos}>
            <sphereGeometry args={[size, 12, 12]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      })}
      {edges.slice(0, 80).map((edge, i) => {
        const src = positions[edge.source.toLowerCase()];
        const tgt = positions[edge.target.toLowerCase()];
        if (!src || !tgt) return null;
        const start = new THREE.Vector3(...src);
        const end = new THREE.Vector3(...tgt);
        const mid = start.clone().lerp(end, 0.5);
        const dir = end.clone().sub(start);
        const len = dir.length();
        return (
          <mesh key={i} position={[mid.x, mid.y, mid.z]} quaternion={
            new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              dir.normalize()
            )
          }>
            <cylinderGeometry args={[0.01, 0.01, len, 4]} />
            <meshStandardMaterial color="#333333" opacity={0.5} transparent />
          </mesh>
        );
      })}
      <OrbitControls enablePan enableZoom enableRotate />
    </>
  );
}

interface ExtractedEntity {
  id: string;
  text: string;
  type: string;
  normalizedId?: string | null;
  confidence?: number;
  startOffset?: number | null;
  endOffset?: number | null;
}

interface ExtractedRelation {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
}

interface ExtractResult {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
  text: string;
  entityCounts?: Record<string, number>;
}

interface PaperRow {
  pmid: string;
  title: string;
  year?: string;
  authors?: string[];
  journal?: string;
  pubmedUrl?: string;
  doiUrl?: string;
}

const DEFAULT_PMID = "33845124";
const DEFAULT_PAPER_QUERY = "BRCA1 cancer therapy";

export default function Nlp() {
  const [text, setText] = useState("");
  const [pmid, setPmid] = useState(DEFAULT_PMID);
  const [paperQuery, setPaperQuery] = useState(DEFAULT_PAPER_QUERY);
  const [paperSearchTerm, setPaperSearchTerm] = useState(DEFAULT_PAPER_QUERY);
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);
  const [autoExtracted, setAutoExtracted] = useState(false);

  const extractMutation = useExtractBiomedicalEntities();
  const { data: papersData, isLoading: papersLoading } = useQuery(
    getSearchPubmedPapersQueryOptions(
      { query: paperSearchTerm },
      { query: { enabled: !!paperSearchTerm, queryKey: ["pubmed-papers", paperSearchTerm] } },
    ),
  );
  const { data: graphData, isLoading: graphLoading } = useQuery(getGetKnowledgeGraphQueryOptions({}));

  useEffect(() => {
    if (autoExtracted) return;
    setAutoExtracted(true);
    extractMutation.mutate(
      { data: { pmid: DEFAULT_PMID } },
      { onSuccess: (data) => setExtractResult(data as ExtractResult) }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExtract = () => {
    extractMutation.mutate(
      { data: { text: text || undefined, pmid: pmid || undefined } },
      { onSuccess: (data) => setExtractResult(data as ExtractResult) }
    );
  };

  const papers = (papersData?.papers ?? []) as unknown as PaperRow[];

  const entityTypes = useMemo(() => {
    if (!extractResult) return [] as Count[];
    const counts: Record<string, number> = {};
    for (const e of extractResult.entities) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    return Object.entries(counts).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  }, [extractResult]);

  const topEntities: Count[] = useMemo(() => {
    if (!extractResult) return [];
    const counts: Record<string, number> = {};
    for (const e of extractResult.entities) {
      counts[e.text] = (counts[e.text] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [extractResult]);

  const paperYears = useMemo(() => {
    const byYear = new Map<string, number>();
    for (const p of papers) {
      if (!p.year) continue;
      byYear.set(p.year, (byYear.get(p.year) ?? 0) + 1);
    }
    return [...byYear.entries()].sort().map(([date, count]) => ({ date, count }));
  }, [papers]);

  const pubmedUrlFor = (p: PaperRow) => p.pubmedUrl ?? `https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight">Biomedical NLP</h1>
        <p className="text-muted-foreground font-mono mt-1 text-sm">
          Live biomedical entity extraction + relation mining + 3D knowledge graph
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-none border-border bg-card">
          <CardHeader><CardTitle className="text-sm uppercase">Entity Extraction</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="PMID (e.g. 33845124)"
                value={pmid}
                onChange={(e) => setPmid(e.target.value)}
                className="rounded-none font-mono text-sm bg-black border-border"
              />
              <Button
                onClick={handleExtract}
                disabled={(!text && !pmid) || extractMutation.isPending}
                className="rounded-none uppercase text-xs"
              >
                {extractMutation.isPending ? "Extracting..." : "Extract"}
              </Button>
            </div>
            <textarea
              placeholder="Or paste biomedical text here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              className="w-full rounded-none font-mono text-xs bg-black border border-border text-white p-2 resize-none focus:outline-none focus:ring-1 focus:ring-white"
            />
          </CardContent>
        </Card>

        <Card className="rounded-none border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm uppercase">PubMed Search — click any paper to open it</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Search PubMed..."
                value={paperQuery}
                onChange={(e) => setPaperQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") setPaperSearchTerm(paperQuery); }}
                className="rounded-none font-mono text-sm bg-black border-border flex-1"
              />
              <Button
                onClick={() => setPaperSearchTerm(paperQuery)}
                disabled={!paperQuery || papersLoading}
                className="rounded-none uppercase text-xs"
              >
                {papersLoading ? "..." : "Search"}
              </Button>
            </div>
            <div className="space-y-2 max-h-56 overflow-auto">
              {papersLoading && <Skeleton className="h-32 rounded-none" />}
              {papers.length === 0 && paperSearchTerm && !papersLoading && (
                <p className="text-xs text-muted-foreground font-mono">No papers found.</p>
              )}
              {papers.map((p) => (
                <div
                  key={p.pmid}
                  className="border-b border-border py-2 hover:bg-white/5 cursor-pointer"
                  onClick={() => { setPmid(p.pmid); setText(""); }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-mono font-bold truncate">{p.title}</p>
                    <a
                      href={pubmedUrlFor(p)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted-foreground hover:text-white flex items-center gap-0.5 shrink-0 text-xs"
                    >
                      PubMed <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                  <div className="flex gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">{p.year}</span>
                    <span className="text-xs text-muted-foreground truncate">{p.authors?.[0]}</span>
                    {p.journal && <span className="text-xs text-muted-foreground truncate italic">{p.journal}</span>}
                    <a
                      href={pubmedUrlFor(p)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-mono text-muted-foreground hover:text-white underline"
                    >
                      PMID:{p.pmid}
                    </a>
                    {p.doiUrl && (
                      <a href={p.doiUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs font-mono text-muted-foreground hover:text-white underline">
                        DOI
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {paperYears.length > 1 && (
        <ChartCard title="Publication Timeline" subtitle={`papers per year — "${paperSearchTerm}"`}>
          <TimelineChart data={paperYears} xKey="date" />
        </ChartCard>
      )}

      {extractMutation.isPending && !extractResult && (
        <Skeleton className="h-48 rounded-none" />
      )}

      {extractResult && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Entity Type Breakdown" subtitle={`${extractResult.entities.length} entities extracted`}>
              <CountPieChart data={entityTypes} />
            </ChartCard>
            <ChartCard title="Top Mentioned Entities" subtitle="mentions per entity">
              <div className="space-y-1 max-h-[200px] overflow-auto">
                {topEntities.map((e) => (
                  <div key={e.key} className="flex items-center justify-between border-b border-border py-1 font-mono text-xs">
                    <span className="truncate">{e.key}</span>
                    <span className="text-muted-foreground">{e.count}×</span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="rounded-none border-border bg-card">
              <CardHeader>
                <CardTitle className="text-sm uppercase">
                  Extracted Entities ({extractResult.entities.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-1">
                  {entityTypes.map((t) => (
                    <Badge
                      key={t.key}
                      style={{ backgroundColor: ENTITY_COLORS[t.key] ?? "#fff", color: "#000" }}
                      className="rounded-none text-xs font-mono"
                    >
                      {t.key}: {t.count}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-auto">
                  {extractResult.entities.map((e) => (
                    <span
                      key={e.id}
                      className="border border-white/20 px-2 py-0.5 text-xs font-mono"
                      style={{ borderColor: ENTITY_COLORS[e.type] ?? "#fff" }}
                      title={`${e.type}${e.normalizedId ? ` | ${e.normalizedId}` : ""} | conf: ${((e.confidence ?? 0) * 100).toFixed(0)}%`}
                    >
                      {e.text}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-none border-border bg-card">
              <CardHeader>
                <CardTitle className="text-sm uppercase">
                  Relations ({extractResult.relations.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-64 overflow-auto font-mono text-xs">
                  {extractResult.relations.slice(0, 30).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 border-b border-border py-1 flex-wrap">
                      <span className="font-bold">{r.subject}</span>
                      <span className="text-muted-foreground">{r.predicate}</span>
                      <span className="font-bold">{r.object}</span>
                      <span className="text-muted-foreground ml-auto">{(r.confidence * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card className="rounded-none border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm uppercase flex items-center justify-between">
            <span>Knowledge Graph — 3D View</span>
            {graphData && (
              <span className="text-xs text-muted-foreground font-mono">
                {(graphData as { nodes?: unknown[] }).nodes?.length ?? 0} nodes, {(graphData as { edges?: unknown[] }).edges?.length ?? 0} edges
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {graphLoading ? (
            <Skeleton className="h-96 rounded-none" />
          ) : graphData && ((graphData as { nodes?: unknown[] }).nodes ?? []).length > 0 ? (
            supportsWebGL() ? (
              <WebGLErrorBoundary fallback={
                <div className="h-96 overflow-auto p-4 bg-black/50">
                  <p className="text-xs font-mono text-muted-foreground uppercase mb-3">Knowledge Graph — Node List</p>
                  <div className="grid grid-cols-2 gap-1">
                    {((graphData as { nodes?: unknown[] }).nodes ?? []).slice(0, 40).map((n) => {
                      const node = n as { id: string; label: string; type: string; count?: number };
                      return (
                        <div key={node.id} className="flex items-center justify-between border border-border p-1 font-mono text-xs">
                          <span className="text-white truncate">{node.label}</span>
                          <span className="text-muted-foreground ml-2 shrink-0">{node.type}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              }>
                <div className="h-96 bg-black">
                  <Canvas camera={{ position: [0, 0, 12], fov: 60 }}>
                    <KnowledgeGraph3D
                      nodes={((graphData as { nodes?: unknown[] }).nodes ?? []).map((n) => ({ ...(n as object), position: [0, 0, 0] })) as KnowledgeGraphNode[]}
                      edges={((graphData as { edges?: unknown[] }).edges ?? []) as KnowledgeGraphEdge[]}
                    />
                  </Canvas>
                </div>
              </WebGLErrorBoundary>
            ) : (
              <div className="h-96 overflow-auto p-4 bg-black/50">
                <p className="text-xs font-mono text-muted-foreground uppercase mb-3">Knowledge Graph — Node List</p>
                <div className="grid grid-cols-2 gap-1">
                  {((graphData as { nodes?: unknown[] }).nodes ?? []).slice(0, 40).map((n) => {
                    const node = n as { id: string; label: string; type: string; count?: number };
                    return (
                      <div key={node.id} className="flex items-center justify-between border border-border p-1 font-mono text-xs">
                        <span className="text-white truncate">{node.label}</span>
                        <span className="text-muted-foreground ml-2 shrink-0">{node.type}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : (
            <div className="h-96 flex items-center justify-center bg-black/50">
              <p className="text-xs font-mono text-muted-foreground uppercase">
                {graphLoading ? "Loading graph..." : "Extract entities to populate the knowledge graph"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
