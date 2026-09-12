import { useState, useEffect } from "react";
import {
  useDesignGuideRnas, getListCrisprJobsQueryOptions, getGetGeneSequenceQueryOptions,
  getListCrisprSpeciesQueryOptions,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChartCard, CountBarChart, type Count } from "@/components/charts";
import DnaHelix from "@/components/dna-helix";

interface GuideResult {
  id: string;
  rank: number;
  sequence: string;
  pamSequence: string;
  position: number;
  strand: string;
  score: number;
  gcContent: number;
  offTargetScore?: number | null;
  selfComplementarity?: number | null;
}

interface DesignResult {
  jobId: string;
  geneName: string | null;
  species?: string;
  totalCandidates: number;
  guides: GuideResult[];
  sequenceLength: number;
  pamType: string;
}

interface SpeciesItem {
  name: string;
  displayName: string;
  commonName: string | null;
}

const DEFAULT_GENE = "BRCA1";
const PAMS = [
  { value: "NGG", label: "NGG (SpCas9)" },
  { value: "NNGRRT", label: "NNGRRT (SaCas9)" },
  { value: "NNNRRT", label: "NNNRRT (SaCas9 KKH)" },
  { value: "TTTV", label: "TTTV (AsCpf1)" },
  { value: "TTN", label: "TTN (FnCpf1)" },
];

export default function Crispr() {
  const [mode, setMode] = useState<"gene" | "sequence">("gene");
  const [geneName, setGeneName] = useState(DEFAULT_GENE);
  const [sequence, setSequence] = useState("");
  const [pam, setPam] = useState("NGG");
  const [species, setSpecies] = useState("homo_sapiens");
  const [speciesFilter, setSpeciesFilter] = useState("");
  const [guideLength, setGuideLength] = useState(20);
  const [result, setResult] = useState<DesignResult | null>(null);
  const [loadingSeq, setLoadingSeq] = useState(false);
  const [autoDesigned, setAutoDesigned] = useState(false);

  const designMutation = useDesignGuideRnas();
  const { data: jobsData } = useQuery(getListCrisprJobsQueryOptions());
  const { data: speciesData } = useQuery(
    getListCrisprSpeciesQueryOptions({ query: { staleTime: 24 * 60 * 60 * 1000, queryKey: ["crispr-species"] } }),
  );

  const allSpecies = (speciesData?.species ?? []) as unknown as SpeciesItem[];
  const shownSpecies = allSpecies.filter(
    (s) =>
      !speciesFilter ||
      s.displayName.toLowerCase().includes(speciesFilter.toLowerCase()) ||
      (s.commonName ?? "").toLowerCase().includes(speciesFilter.toLowerCase()),
  );

  const handleFetchSequence = async () => {
    if (!geneName) return;
    setLoadingSeq(true);
    try {
      const res = await fetch(`/api/crispr/gene/${encodeURIComponent(geneName)}?species=${encodeURIComponent(species)}`);
      if (res.ok) {
        const data = (await res.json()) as { sequence?: string };
        if (data.sequence) setSequence(data.sequence.slice(0, 5000));
      }
    } finally {
      setLoadingSeq(false);
    }
  };

  const handleDesign = () => {
    const payload = mode === "gene"
      ? { geneName: geneName || undefined, pam, guideLength, species }
      : { sequence: sequence || undefined, pam, guideLength, species };
    designMutation.mutate(
      { data: payload },
      { onSuccess: (data) => setResult(data as unknown as DesignResult) },
    );
  };

  useEffect(() => {
    if (autoDesigned) return;
    setAutoDesigned(true);
    designMutation.mutate(
      { data: { geneName: DEFAULT_GENE, pam: "NGG", guideLength: 20, species: "homo_sapiens" } },
      { onSuccess: (data) => setResult(data as unknown as DesignResult) },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scoreColor = (score: number) => {
    if (score >= 0.8) return "bg-white text-black";
    if (score >= 0.6) return "bg-white/60 text-black";
    if (score >= 0.4) return "bg-white/30 text-white";
    return "bg-white/10 text-white";
  };

  const gcDistribution: Count[] = (result?.guides ?? []).map((g) => ({
    key: `${Math.round(g.gcContent * 100)}%`,
    count: 1,
  })).reduce<Count[]>((acc, cur) => {
    const found = acc.find((a) => a.key === cur.key);
    if (found) found.count++;
    else acc.push(cur);
    return acc;
  }, []).sort((a, b) => a.key.localeCompare(b.key));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight">CRISPR Design</h1>
        <p className="text-muted-foreground font-mono mt-1 text-sm">
          Cas9/Cpf1 guide RNA design across {allSpecies.length || "…"} Ensembl species — PAM detection, GC scoring, off-target prediction
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="rounded-none border-border bg-card">
          <CardHeader><CardTitle className="text-sm uppercase">Design Parameters</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex border border-border">
              <button
                onClick={() => setMode("gene")}
                className={`flex-1 py-2 text-xs uppercase font-mono transition-colors ${mode === "gene" ? "bg-white text-black" : "text-muted-foreground hover:text-white"}`}
              >
                Gene Name
              </button>
              <button
                onClick={() => setMode("sequence")}
                className={`flex-1 py-2 text-xs uppercase font-mono transition-colors ${mode === "sequence" ? "bg-white text-black" : "text-muted-foreground hover:text-white"}`}
              >
                DNA Sequence
              </button>
            </div>

            {mode === "gene" ? (
              <div className="space-y-2">
                <Input
                  placeholder="Gene name (e.g. BRCA1, TP53)"
                  value={geneName}
                  onChange={(e) => setGeneName(e.target.value)}
                  className="rounded-none font-mono text-sm bg-black border-border"
                />
                <div className="space-y-1">
                  <label className="text-[10px] uppercase text-muted-foreground">Species — {allSpecies.length} available from Ensembl</label>
                  <select
                    value={species}
                    onChange={(e) => setSpecies(e.target.value)}
                    className="w-full bg-black border border-border text-white text-xs font-mono p-2"
                    data-testid="crispr-species-select"
                  >
                    {!allSpecies.length && <option value="homo_sapiens">Homo sapiens (loading species…)</option>}
                    {shownSpecies.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.commonName ? `${s.displayName} (${s.commonName})` : s.displayName}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="Filter species…"
                    value={speciesFilter}
                    onChange={(e) => setSpeciesFilter(e.target.value)}
                    className="rounded-none font-mono text-xs bg-black border-border h-7"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFetchSequence}
                  disabled={!geneName || loadingSeq}
                  className="rounded-none text-xs border-border w-full"
                >
                  {loadingSeq ? "Fetching..." : "Fetch Sequence from Ensembl"}
                </Button>
              </div>
            ) : (
              <textarea
                placeholder="Paste DNA sequence (ACGT)..."
                value={sequence}
                onChange={(e) => setSequence(e.target.value)}
                rows={8}
                className="w-full rounded-none font-mono text-xs bg-black border border-border text-white p-2 resize-none focus:outline-none focus:ring-1 focus:ring-white"
              />
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground uppercase block mb-1">PAM</label>
                <select
                  value={pam}
                  onChange={(e) => setPam(e.target.value)}
                  className="w-full bg-black border border-border text-white text-xs font-mono p-2"
                >
                  {PAMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase block mb-1">Guide Length</label>
                <Input
                  type="number"
                  value={guideLength}
                  onChange={(e) => setGuideLength(parseInt(e.target.value) || 20)}
                  min={17}
                  max={24}
                  className="rounded-none font-mono text-sm bg-black border-border"
                />
              </div>
            </div>

            <Button
              onClick={handleDesign}
              disabled={(!geneName && !sequence) || designMutation.isPending}
              className="w-full rounded-none uppercase text-xs"
            >
              {designMutation.isPending ? "Designing Guides..." : "Design gRNAs"}
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-none border-border bg-card lg:col-span-2">
          <CardHeader><CardTitle className="text-sm uppercase">Recent Jobs</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-64 overflow-auto">
              {(jobsData?.jobs ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground font-mono">No CRISPR jobs yet.</p>
              )}
              {(jobsData?.jobs ?? []).map((job) => (
                <div key={job.id} className="flex items-center justify-between border-b border-border py-1.5 font-mono text-xs">
                  <span>{job.geneName ?? "Custom Sequence"}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{job.guidesCount ?? 0} guides</span>
                    <span className="text-muted-foreground">{job.pamType}</span>
                    <Badge className={`rounded-none text-xs ${job.status === "completed" ? "bg-white text-black" : "bg-white/20 text-white"}`}>
                      {job.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {designMutation.isPending && !result && (
        <Skeleton className="h-64 rounded-none" />
      )}

      {result && (
        <>
          {(() => {
            const top = result.guides[0];
            if (!top) return null;
            // Real 3D helix of the guide + its PAM — PAM rung highlighted.
            const pamOffset = top.strand === "reverse" ? -1 : top.sequence.length;
            const helixSeq = top.strand === "reverse"
              ? top.pamSequence + top.sequence
              : top.sequence + top.pamSequence;
            return (
              <Card className="rounded-none border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-sm uppercase flex items-center justify-between flex-wrap gap-2">
                    <span>Top Guide — 3D DNA Helix</span>
                    <span className="text-[10px] font-mono text-muted-foreground normal-case">
                      rank #{top.rank} · score {(top.score * 100).toFixed(0)} · PAM highlighted in red
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="h-64 bg-black">
                    <DnaHelix
                      sequence={helixSeq}
                      highlightIndex={pamOffset >= 0 && pamOffset < helixSeq.length ? Math.min(pamOffset, helixSeq.length - 1) : null}
                      highlightLabel={`PAM ${top.pamSequence}`}
                    />
                  </div>
                  <div className="flex flex-wrap gap-3 p-3 font-mono text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 inline-block" style={{ background: "#ff6b6b" }} />A</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 inline-block" style={{ background: "#4ecdc4" }} />T</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 inline-block" style={{ background: "#ffd93d" }} />G</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 inline-block" style={{ background: "#6bcb77" }} />C</span>
                    <span className="ml-auto">guide {top.sequence} · PAM {top.pamSequence} · {top.strand} strand · pos {top.position.toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ChartCard title="GC Content Distribution" subtitle={`top ${result.guides.length} guides`}>
              <CountBarChart data={gcDistribution} layout="horizontal" height={180} maxBars={12} />
            </ChartCard>
            <div className="lg:col-span-2" />
          </div>

          <Card className="rounded-none border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm uppercase flex items-center justify-between flex-wrap gap-2">
                <span>
                  {result.totalCandidates} Guide RNAs — {result.geneName ?? "Custom Sequence"} ({result.pamType})
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  {result.species ?? ""} · {result.sequenceLength.toLocaleString()} bp analyzed
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground uppercase">
                      <th className="text-left py-2 pr-3">Rank</th>
                      <th className="text-left py-2 pr-3">Sequence (5'→3')</th>
                      <th className="text-left py-2 pr-3">PAM</th>
                      <th className="text-left py-2 pr-3">Score</th>
                      <th className="text-left py-2 pr-3">GC%</th>
                      <th className="text-left py-2 pr-3">Off-Target</th>
                      <th className="text-left py-2 pr-3">Position</th>
                      <th className="text-left py-2 pr-3">Strand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.guides.map((g) => (
                      <tr key={g.id} className="border-b border-border hover:bg-white/5">
                        <td className="py-2 pr-3 text-muted-foreground">{g.rank}</td>
                        <td className="py-2 pr-3 tracking-wider">{g.sequence}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{g.pamSequence}</td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 text-xs ${scoreColor(g.score)}`}>
                              {(g.score * 100).toFixed(0)}
                            </span>
                            <div className="w-16 bg-white/10 h-1.5">
                              <div className="h-1.5 bg-white" style={{ width: `${g.score * 100}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-3">{(g.gcContent * 100).toFixed(0)}%</td>
                        <td className="py-2 pr-3">{g.offTargetScore != null ? (g.offTargetScore * 100).toFixed(0) : "-"}%</td>
                        <td className="py-2 pr-3 text-muted-foreground">{g.position.toLocaleString()}</td>
                        <td className="py-2 pr-3">{g.strand}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
