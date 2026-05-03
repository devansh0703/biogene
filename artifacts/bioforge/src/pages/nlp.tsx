import { useState, useMemo, useRef, useEffect } from "react";
import {
  useExtractBiomedicalEntities, useSearchPubmedPapers, useGetKnowledgeGraph,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

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
      const r = 4 + Math.random() * 3;
      map[n.label.toLowerCase()] = [
        Math.cos(angle) * r,
        (Math.random() - 0.5) * 4,
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

export default function Nlp() {
  const [text, setText] = useState("");
  const [pmid, setPmid] = useState("");
  const [paperQuery, setPaperQuery] = useState("");
  const [paperSearchTerm, setPaperSearchTerm] = useState("");
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null);

  const extractMutation = useExtractBiomedicalEntities();
  const { data: papersData, isLoading: papersLoading } = useSearchPubmedPapers(
    { query: paperSearchTerm },
    { query: { enabled: !!paperSearchTerm } }
  );
  const { data: graphData, isLoading: graphLoading } = useGetKnowledgeGraph({});

  const handleExtract = () => {
    extractMutation.mutate(
      { data: { text: text || undefined, pmid: pmid || undefined } },
      { onSuccess: (data) => setExtractResult(data as ExtractResult) }
    );
  };

  const entityTypes = useMemo(() => {
    if (!extractResult) return [];
    const counts: Record<string, number> = {};
    for (const e of extractResult.entities) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [extractResult]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight">Biomedical NLP</h1>
        <p className="text-muted-foreground font-mono mt-1 text-sm">
          PubTator3 entity extraction + relation mining + 3D knowledge graph
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
                data-testid="pmid-input"
              />
              <Button
                onClick={handleExtract}
                disabled={(!text && !pmid) || extractMutation.isPending}
                className="rounded-none uppercase text-xs"
                data-testid="extract-btn"
              >
                {extractMutation.isPending ? "Extracting..." : "Extract"}
              </Button>
            </div>
            <textarea
              placeholder="Or paste biomedical text here (abstracts, clinical notes, research papers)..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              className="w-full rounded-none font-mono text-xs bg-black border border-border text-white p-2 resize-none focus:outline-none focus:ring-1 focus:ring-white"
              data-testid="nlp-text-input"
            />
          </CardContent>
        </Card>

        <Card className="rounded-none border-border bg-card">
          <CardHeader>
            <div className="flex gap-2 items-center justify-between">
              <CardTitle className="text-sm uppercase">PubMed Search</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Search PubMed (e.g. BRCA1 cancer therapy)..."
                value={paperQuery}
                onChange={(e) => setPaperQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") setPaperSearchTerm(paperQuery); }}
                className="rounded-none font-mono text-sm bg-black border-border flex-1"
                data-testid="paper-search-input"
              />
              <Button
                onClick={() => setPaperSearchTerm(paperQuery)}
                disabled={!paperQuery || papersLoading}
                className="rounded-none uppercase text-xs"
                data-testid="paper-search-btn"
              >
                {papersLoading ? "..." : "Search"}
              </Button>
            </div>
            <div className="space-y-2 max-h-56 overflow-auto">
              {(papersData?.papers ?? []).length === 0 && paperSearchTerm && !papersLoading && (
                <p className="text-xs text-muted-foreground font-mono">No papers found.</p>
              )}
              {(papersData?.papers ?? []).map((p) => p && (
                <div
                  key={p.pmid}
                  className="border-b border-border py-2 cursor-pointer hover:bg-white/5"
                  onClick={() => { setPmid(p.pmid); setText(""); }}
                  data-testid="paper-item"
                >
                  <p className="text-xs font-mono font-bold truncate">{p.title}</p>
                  <div className="flex gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{p.year}</span>
                    <span className="text-xs text-muted-foreground truncate">{p.authors?.[0]}</span>
                    <span className="text-xs font-mono text-muted-foreground">PMID:{p.pmid}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {extractResult && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="rounded-none border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm uppercase">
                Extracted Entities ({extractResult.entities.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-1">
                {entityTypes.map(([type, count]) => (
                  <Badge
                    key={type}
                    style={{ backgroundColor: ENTITY_COLORS[type] ?? "#fff", color: "#000" }}
                    className="rounded-none text-xs font-mono"
                  >
                    {type}: {count}
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
      )}

      <Card className="rounded-none border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm uppercase flex items-center justify-between">
            <span>Knowledge Graph — 3D View</span>
            {graphData && (
              <span className="text-xs text-muted-foreground font-mono">
                {graphData.nodes?.length ?? 0} nodes, {graphData.edges?.length ?? 0} edges
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {graphLoading ? (
            <Skeleton className="h-96 rounded-none" />
          ) : graphData && (graphData.nodes ?? []).length > 0 ? (
            <div className="h-96 bg-black">
              <Canvas camera={{ position: [0, 0, 12], fov: 60 }}>
                <KnowledgeGraph3D
                  nodes={(graphData.nodes ?? []).map((n) => ({ ...n, position: [0, 0, 0] })) as KnowledgeGraphNode[]}
                  edges={(graphData.edges ?? []) as KnowledgeGraphEdge[]}
                />
              </Canvas>
            </div>
          ) : (
            <div className="h-96 flex items-center justify-center bg-black/50">
              <div className="text-center space-y-2">
                <p className="text-xs font-mono text-muted-foreground uppercase">No graph data yet</p>
                <p className="text-xs text-muted-foreground">Extract entities from biomedical text to populate the knowledge graph</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
