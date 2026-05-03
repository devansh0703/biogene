import { useState, useMemo, useRef } from "react";
import {
  useSearchGenomicRegion, useGetGenomicRegion, useListGenomeTracks,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";

const CONSEQUENCE_COLORS: Record<string, string> = {
  missense_variant: "#ffffff",
  synonymous_variant: "#888888",
  stop_gained: "#ffffff",
  frameshift_variant: "#cccccc",
  splice_region_variant: "#aaaaaa",
  intron_variant: "#444444",
  default: "#555555",
};

function GenomeBrowser3D({
  genes,
  variants,
  regionStart,
  regionEnd,
}: {
  genes: Array<{ id: string; name: string; start: number; end: number; strand: number; biotype: string }>;
  variants: Array<{ id: string; position: number; consequence: string }>;
  regionStart: number;
  regionEnd: number;
}) {
  const span = regionEnd - regionStart || 1;
  const normalize = (pos: number) => ((pos - regionStart) / span) * 20 - 10;

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />

      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[20, 0.1, 0.5]} />
        <meshStandardMaterial color="#333333" />
      </mesh>

      {genes.slice(0, 20).map((gene) => {
        const gStart = normalize(gene.start);
        const gEnd = normalize(gene.end);
        const gLen = Math.max(0.1, Math.abs(gEnd - gStart));
        const gMid = (gStart + gEnd) / 2;
        const yPos = gene.strand > 0 ? 0.5 : -0.5;
        return (
          <group key={gene.id}>
            <mesh position={[gMid, yPos, 0]}>
              <boxGeometry args={[gLen, 0.3, 0.3]} />
              <meshStandardMaterial color="#ffffff" opacity={0.8} transparent />
            </mesh>
            <Text
              position={[gMid, yPos + 0.5, 0]}
              fontSize={0.2}
              color="white"
              anchorX="center"
              anchorY="bottom"
            >
              {gene.name || gene.id}
            </Text>
          </group>
        );
      })}

      {variants.slice(0, 100).map((v) => {
        const xPos = normalize(v.position);
        const color = CONSEQUENCE_COLORS[v.consequence] ?? CONSEQUENCE_COLORS.default;
        return (
          <mesh key={v.id} position={[xPos, 1.0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 1.5, 6]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      })}

      <OrbitControls enablePan enableZoom enableRotate />
    </>
  );
}

export default function Genome() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [regionInput, setRegionInput] = useState("");
  const [activeRegion, setActiveRegion] = useState<{ chromosome: string; start: number; end: number } | null>(null);

  const { data: searchData, isLoading: searchLoading } = useSearchGenomicRegion(
    { query: searchTerm },
    { query: { enabled: !!searchTerm } }
  );
  const { data: regionData, isLoading: regionLoading } = useGetGenomicRegion(
    {
      chromosome: activeRegion?.chromosome ?? "",
      start: activeRegion?.start ?? 0,
      end: activeRegion?.end ?? 0,
    },
    { query: { enabled: !!activeRegion } }
  );
  const { data: tracksData } = useListGenomeTracks();

  const handleSearch = () => { if (searchQuery) setSearchTerm(searchQuery); };

  const handleRegionJump = () => {
    const match = regionInput.match(/^(?:chr)?([0-9XYM]+):(\d+)-(\d+)$/i);
    if (match) {
      setActiveRegion({ chromosome: match[1], start: parseInt(match[2]), end: parseInt(match[3]) });
    }
  };

  const handleFeatureSelect = (feature: { chromosome: string; start: number; end: number }) => {
    const padding = Math.round((feature.end - feature.start) * 0.1);
    setActiveRegion({
      chromosome: feature.chromosome,
      start: Math.max(1, feature.start - padding),
      end: feature.end + padding,
    });
    setRegionInput(`${feature.chromosome}:${feature.start}-${feature.end}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight">Genome Browser</h1>
        <p className="text-muted-foreground font-mono mt-1 text-sm">
          Ensembl REST API + 3D lollipop chromosome view
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search gene (e.g. BRCA1, TP53, EGFR)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              className="rounded-none font-mono text-sm bg-black border-border"
              data-testid="genome-search-input"
            />
            <Button onClick={handleSearch} disabled={!searchQuery || searchLoading} className="rounded-none uppercase text-xs" data-testid="genome-search-btn">
              {searchLoading ? "..." : "Search"}
            </Button>
          </div>

          {(searchData?.features ?? []).length > 0 && (
            <div className="space-y-1 max-h-40 overflow-auto border border-border bg-card p-2">
              {searchData!.features.map((f) => f && (
                <button
                  key={f.id}
                  onClick={() => handleFeatureSelect(f)}
                  className="w-full text-left flex items-center justify-between px-2 py-1.5 hover:bg-white/10 transition-colors"
                  data-testid="genome-feature-item"
                >
                  <div>
                    <span className="font-mono font-bold text-xs">{f.name}</span>
                    {f.biotype && <span className="text-xs text-muted-foreground ml-2">{f.biotype}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    {f.chromosome}:{f.start?.toLocaleString()}-{f.end?.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              placeholder="Jump to region (e.g. 17:41196311-41277500)..."
              value={regionInput}
              onChange={(e) => setRegionInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRegionJump(); }}
              className="rounded-none font-mono text-sm bg-black border-border"
              data-testid="region-input"
            />
            <Button onClick={handleRegionJump} className="rounded-none uppercase text-xs" data-testid="region-jump-btn">
              Jump
            </Button>
          </div>
        </div>

        <Card className="rounded-none border-border bg-card">
          <CardHeader><CardTitle className="text-sm uppercase">Available Tracks</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {(tracksData?.tracks ?? []).map((t) => (
                <div key={t.id} className="flex items-center justify-between py-1 border-b border-border">
                  <span className="text-xs font-mono">{t.name}</span>
                  <Badge className="rounded-none text-xs bg-white/20 text-white">{t.type}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {activeRegion && (
        <>
          <Card className="rounded-none border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm uppercase flex items-center justify-between">
                <span>
                  chr{activeRegion.chromosome}:{activeRegion.start.toLocaleString()}–{activeRegion.end.toLocaleString()}
                </span>
                {regionData && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {regionData.genes?.length ?? 0} genes, {regionData.variants?.length ?? 0} variants
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {regionLoading ? (
                <Skeleton className="h-80 rounded-none" />
              ) : regionData ? (
                <div className="h-80 bg-black">
                  <Canvas camera={{ position: [0, 4, 12], fov: 55 }}>
                    <GenomeBrowser3D
                      genes={regionData.genes ?? []}
                      variants={regionData.variants ?? []}
                      regionStart={regionData.start ?? activeRegion.start}
                      regionEnd={regionData.end ?? activeRegion.end}
                    />
                  </Canvas>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {regionData && (regionData.genes ?? []).length > 0 && (
            <Card className="rounded-none border-border bg-card">
              <CardHeader><CardTitle className="text-sm uppercase">Genes in Region</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground uppercase">
                        <th className="text-left py-2 pr-4">Name</th>
                        <th className="text-left py-2 pr-4">ID</th>
                        <th className="text-left py-2 pr-4">Start</th>
                        <th className="text-left py-2 pr-4">End</th>
                        <th className="text-left py-2 pr-4">Strand</th>
                        <th className="text-left py-2 pr-4">Biotype</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regionData.genes!.map((g) => (
                        <tr key={g.id} className="border-b border-border hover:bg-white/5">
                          <td className="py-2 pr-4 font-bold">{g.name}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{g.id}</td>
                          <td className="py-2 pr-4">{g.start?.toLocaleString()}</td>
                          <td className="py-2 pr-4">{g.end?.toLocaleString()}</td>
                          <td className="py-2 pr-4">{g.strand === 1 ? "+" : "-"}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{g.biotype}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!activeRegion && (
        <div className="border border-border bg-card p-12 text-center">
          <p className="text-sm font-mono text-muted-foreground uppercase">
            Search for a gene or enter a genomic region to begin
          </p>
          <p className="text-xs text-muted-foreground mt-2">Example: 17:41196311-41277500 (BRCA1)</p>
        </div>
      )}
    </div>
  );
}
