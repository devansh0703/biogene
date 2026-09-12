import { useState, useMemo } from "react";
import {
  getSearchGenomicRegionQueryOptions, getGetGenomicRegionQueryOptions,
  getListGenomeTracksQueryOptions, getListGenomeSpeciesQueryOptions,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChartCard, CountBarChart, CountPieChart, TimelineChart, type Count } from "@/components/charts";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { ExternalLink } from "lucide-react";

const CONSEQUENCE_COLORS: Record<string, string> = {
  missense_variant: "#ffffff",
  synonymous_variant: "#888888",
  stop_gained: "#ffffff",
  frameshift_variant: "#cccccc",
  splice_region_variant: "#aaaaaa",
  intron_variant: "#444444",
  default: "#555555",
};

const BRCA1_REGION = { chromosome: "17", start: 41196311, end: 41277500 };

interface FeatureRow {
  id: string;
  name: string;
  type: string;
  chromosome: string;
  start: number;
  end: number;
  strand?: number;
  biotype?: string;
  description?: string;
  organism?: string;
  ncbiGeneUrl?: string;
  ensemblUrl?: string;
}
interface VariantRow {
  id: string;
  position: number;
  ref: string;
  alt: string;
  consequence?: string;
  mostSevere?: string;
  dbsnpUrl?: string;
}

function GenomeBrowser3D({
  genes,
  variants,
  regionStart,
  regionEnd,
}: {
  genes: FeatureRow[];
  variants: VariantRow[];
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
        const yPos = (gene.strand ?? 1) > 0 ? 0.5 : -0.5;
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
        const color = CONSEQUENCE_COLORS[v.consequence ?? ""] ?? CONSEQUENCE_COLORS.default;
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
  const [searchQuery, setSearchQuery] = useState("breast cancer gene BRCA1");
  const [searchTerm, setSearchTerm] = useState("BRCA1");
  const [species, setSpecies] = useState("human");
  const [regionInput, setRegionInput] = useState("17:41196311-41277500");
  const [activeRegion, setActiveRegion] = useState(BRCA1_REGION);

  const { data: speciesData } = useQuery(getListGenomeSpeciesQueryOptions());
  const { data: searchData, isLoading: searchLoading } = useQuery(
    getSearchGenomicRegionQueryOptions(
      { query: searchTerm, species },
      { query: { enabled: !!searchTerm, queryKey: ["genome-search", searchTerm, species] } },
    ),
  );
  const { data: regionData, isLoading: regionLoading } = useQuery(
    getGetGenomicRegionQueryOptions(
      { chromosome: activeRegion.chromosome, start: activeRegion.start, end: activeRegion.end, species },
      { query: { queryKey: ["genome-region", activeRegion.chromosome, activeRegion.start, activeRegion.end, species] } },
    ),
  );
  const { data: tracksData } = useQuery(getListGenomeTracksQueryOptions());

  const features = (searchData?.features ?? []) as unknown as FeatureRow[];
  const region = regionData as
    | {
        chromosome: string;
        start: number;
        end: number;
        genes?: FeatureRow[];
        variants?: VariantRow[];
        coverageData?: Array<{ position: number; coverage: number }>;
        gcContent?: number;
        sequenceLength?: number;
        consequenceCounts?: Array<{ consequence: string; count: number }>;
      }
    | undefined;
  const regionGenes = region?.genes ?? [];
  const regionVariants = region?.variants ?? [];

  // When picking a natural-language result, jump to it
  const handleFeatureSelect = (feature: FeatureRow) => {
    const padding = Math.max(1000, Math.round((feature.end - feature.start) * 0.1));
    setActiveRegion({
      chromosome: feature.chromosome,
      start: Math.max(1, feature.start - padding),
      end: feature.end + padding,
    });
    setRegionInput(`${feature.chromosome}:${feature.start}-${feature.end}`);
  };

  const handleRegionJump = () => {
    const match = regionInput.match(/^(?:chr)?([0-9XYM]+):(\d+)-(\d+)$/i);
    if (match) {
      setActiveRegion({ chromosome: match[1], start: parseInt(match[2]), end: parseInt(match[3]) });
    }
  };

  // GC content slider history: sample coverage along the region
  const coverageChart = useMemo(() => {
    const data = region?.coverageData ?? [];
    return data.slice(0, 200).map((d) => ({ position: d.position, count: d.coverage }));
  }, [region]);

  const consequenceChart: Count[] = useMemo(
    () =>
      (region?.consequenceCounts ?? []).map((c) => ({
        key: c.consequence.replace(/_variant$/, "").replace(/_/g, " "),
        count: c.count,
      })),
    [region],
  );

  const biotypeChart: Count[] = useMemo(() => {
    const byBiotype = new Map<string, number>();
    for (const g of regionGenes) {
      const k = g.biotype ?? "unknown";
      byBiotype.set(k, (byBiotype.get(k) ?? 0) + 1);
    }
    return [...byBiotype.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  }, [regionGenes]);

  const geneLengthChart: Count[] = useMemo(
    () =>
      regionGenes
        .slice(0, 12)
        .map((g) => ({ key: g.name || g.id, count: Math.round((g.end - g.start) / 1000) }))
        .sort((a, b) => b.count - a.count),
    [regionGenes],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight">Genome Browser</h1>
        <p className="text-muted-foreground font-mono mt-1 text-sm">
          Natural-language gene search (NCBI Gene + Ensembl) + 3D region view — all Ensembl species live
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder='Search anything: "BRCA1", "tumor protein p53", "insulin receptor"...'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setSearchTerm(searchQuery); }}
              className="rounded-none font-mono text-sm bg-black border-border flex-1 min-w-0"
            />
            <select
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              className="bg-black border border-border text-white text-xs font-mono p-2 max-w-[220px]"
            >
              <option value="human">Human (GRCh38)</option>
              {(speciesData?.species ?? []).map((s) => (
                <option key={s.name} value={s.name}>{s.displayName ?? s.name}</option>
              ))}
            </select>
            <Button onClick={() => setSearchTerm(searchQuery)} disabled={!searchQuery || searchLoading} className="rounded-none uppercase text-xs">
              {searchLoading ? "..." : "Search"}
            </Button>
          </div>

          {(features ?? []).length > 0 && (
            <div className="space-y-1 max-h-40 overflow-auto border border-border bg-card p-2">
              <p className="text-xs text-muted-foreground font-mono mb-1">
                {searchData?.total ?? 0} results{searchData?.species ? ` · ${searchData.species.replace(/_/, " ")}` : ""} — click to jump
              </p>
              {features.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleFeatureSelect(f)}
                  className="w-full text-left flex items-center justify-between px-2 py-1.5 hover:bg-white/10 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-xs">{f.name}</span>
                    {f.description && <span className="text-xs text-muted-foreground ml-2 truncate">{f.description.slice(0, 70)}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground font-mono">
                      {f.chromosome}:{f.start?.toLocaleString()}-{f.end?.toLocaleString()}
                    </span>
                    {f.ncbiGeneUrl && (
                      <a href={f.ncbiGeneUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-white">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
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
            />
            <Button onClick={handleRegionJump} className="rounded-none uppercase text-xs">Jump</Button>
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

      <Card className="rounded-none border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm uppercase flex items-center justify-between flex-wrap gap-2">
            <span>
              chr{region?.chromosome ?? activeRegion.chromosome}:{(region?.start ?? activeRegion.start).toLocaleString()}–{(region?.end ?? activeRegion.end).toLocaleString()}
              {species !== "human" && <span className="text-muted-foreground ml-2">({species})</span>}
            </span>
            <span className="text-xs text-muted-foreground font-mono flex items-center gap-3">
              {region?.gcContent != null && <span>GC {region.gcContent.toFixed(1)}%</span>}
              {region?.sequenceLength != null && <span>{region.sequenceLength.toLocaleString()} bp</span>}
              <span>{regionGenes.length} genes, {regionVariants.length} variants</span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {regionLoading ? (
            <Skeleton className="h-80 rounded-none" />
          ) : region ? (
            <div className="h-80 bg-black">
              <Canvas camera={{ position: [0, 4, 12], fov: 55 }}>
                <GenomeBrowser3D
                  genes={regionGenes}
                  variants={regionVariants}
                  regionStart={region.start ?? activeRegion.start}
                  regionEnd={region.end ?? activeRegion.end}
                />
              </Canvas>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {(consequenceChart.length > 0 || biotypeChart.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {consequenceChart.length > 0 && (
            <ChartCard title="Variant Consequences" subtitle="variant breakdown in region">
              <CountPieChart data={consequenceChart} />
            </ChartCard>
          )}
          {biotypeChart.length > 0 && (
            <ChartCard title="Gene Biotypes in Region">
              <CountBarChart data={biotypeChart} layout="horizontal" maxBars={8} />
            </ChartCard>
          )}
          {geneLengthChart.length > 0 && (
            <ChartCard title="Gene Length (kb)" subtitle="top genes in region">
              <CountBarChart data={geneLengthChart} layout="horizontal" maxBars={10} />
            </ChartCard>
          )}
        </div>
      )}

      {coverageChart.length > 0 && (
        <ChartCard title="Sequence Coverage Across Region" subtitle="position → coverage depth">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={coverageChart} margin={{ top: 4, right: 12, left: -18, bottom: 0 }}>
              <XAxis dataKey="position" stroke="#444" tick={{ fill: "#666", fontSize: 9, fontFamily: "monospace" }} />
              <YAxis stroke="#444" tick={{ fill: "#666", fontSize: 10, fontFamily: "monospace" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid #2a2a2a", fontFamily: "monospace", fontSize: 11, color: "#fff" }} />
              <Area type="monotone" dataKey="count" stroke="#fff" fill="rgba(255,255,255,0.15)" strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {regionGenes.length > 0 && (
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
                    <th className="text-left py-2 pr-4">Links</th>
                  </tr>
                </thead>
                <tbody>
                  {regionGenes.map((g) => (
                    <tr key={g.id} className="border-b border-border hover:bg-white/5">
                      <td className="py-2 pr-4 font-bold">{g.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{g.id}</td>
                      <td className="py-2 pr-4">{g.start?.toLocaleString()}</td>
                      <td className="py-2 pr-4">{g.end?.toLocaleString()}</td>
                      <td className="py-2 pr-4">{(g.strand ?? 1) === 1 ? "+" : "-"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{g.biotype}</td>
                      <td className="py-2 pr-4">
                        <div className="flex gap-2">
                          {g.ensemblUrl && (
                            <a href={g.ensemblUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-white flex items-center gap-0.5">
                              Ensembl <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                          {g.ncbiGeneUrl && (
                            <a href={g.ncbiGeneUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-white flex items-center gap-0.5">
                              NCBI <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {regionVariants.length > 0 && (
        <Card className="rounded-none border-border bg-card">
          <CardHeader><CardTitle className="text-sm uppercase">Variants in Region ({regionVariants.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase">
                    <th className="text-left py-2 pr-4">Position</th>
                    <th className="text-left py-2 pr-4">Ref</th>
                    <th className="text-left py-2 pr-4">Alt</th>
                    <th className="text-left py-2 pr-4">Consequence</th>
                    <th className="text-left py-2 pr-4">Severity</th>
                    <th className="text-left py-2 pr-4">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {regionVariants.slice(0, 50).map((v) => (
                    <tr key={v.id} className="border-b border-border hover:bg-white/5">
                      <td className="py-2 pr-4">{v.position?.toLocaleString()}</td>
                      <td className="py-2 pr-4">{v.ref}</td>
                      <td className="py-2 pr-4">{v.alt}</td>
                      <td className="py-2 pr-4">{v.consequence ?? "-"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{v.mostSevere ?? "-"}</td>
                      <td className="py-2 pr-4">
                        {v.dbsnpUrl && (
                          <a href={v.dbsnpUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-white flex items-center gap-0.5">
                            dbSNP <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
