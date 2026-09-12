import { useState } from "react";
import {
  getSearchGeneExpressionQueryOptions, getListTissuesQueryOptions,
  getListTranscriptomicsJobsQueryOptions, useCreateTranscriptomicsJob,
  getGetGtexBodyMapQueryOptions,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useQueryParams } from "@/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChartCard, HistogramChart, TimelineChart } from "@/components/charts";
import BodyMap, { type BodyMapOrgan } from "@/components/body-map";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ExternalLink } from "lucide-react";

const DEFAULT_GENE = "BRCA1";

interface ExpressionRow {
  geneId: string;
  geneName: string;
  tissue: string;
  tissueName?: string;
  tpm: number;
  median?: number;
  gtexUrl?: string;
}

export default function Transcriptomics() {
  const urlParams = useQueryParams();
  const [geneQuery, setGeneQuery] = useState(urlParams["gene"] ?? DEFAULT_GENE);
  const [geneSearchTerm, setGeneSearchTerm] = useState(urlParams["gene"] ?? DEFAULT_GENE);
  const [tissueFilter, setTissueFilter] = useState(urlParams["tissue"] ?? "");
  const [showJobForm, setShowJobForm] = useState(false);
  const [jobForm, setJobForm] = useState({ name: "", sampleType: "RNA", referenceGenome: "GRCh38", pairedEnd: false });

  const { data: expressionData, isLoading: expressionLoading } = useQuery(
    getSearchGeneExpressionQueryOptions(
      { gene: geneSearchTerm, tissue: tissueFilter || undefined },
      { query: { enabled: !!geneSearchTerm, queryKey: ["gene-expression", geneSearchTerm, tissueFilter] } },
    ),
  );
  const { data: tissuesData } = useQuery(getListTissuesQueryOptions());
  const { data: jobsData, isLoading: jobsLoading, refetch: refetchJobs } = useQuery(
    getListTranscriptomicsJobsQueryOptions(),
  );
  // 3D body map: all 54 GTEx tissues positioned on a schematic human body.
  const { data: bodyMapData, isLoading: bodyMapLoading } = useQuery(
    getGetGtexBodyMapQueryOptions(
      { gene: geneSearchTerm },
      { query: { enabled: !!geneSearchTerm, queryKey: ["bodymap", geneSearchTerm] } },
    ),
  );
  const bodyOrgans = (bodyMapData?.organs ?? []) as unknown as BodyMapOrgan[];
  const createJobMutation = useCreateTranscriptomicsJob();

  const sortedExpression = [...(expressionData?.expressions ?? [])]
    .filter((e) => !tissueFilter || e.tissue === tissueFilter)
    .sort((a, b) => (b.tpm ?? 0) - (a.tpm ?? 0)) as unknown as ExpressionRow[];
  const allSorted = [...(expressionData?.expressions ?? [])].sort((a, b) => (b.tpm ?? 0) - (a.tpm ?? 0)) as unknown as ExpressionRow[];
  const maxTpm = expressionData?.maxTpm ?? 1;

  const handleCreateJob = () => {
    createJobMutation.mutate(
      { data: { name: jobForm.name, sampleType: jobForm.sampleType, referenceGenome: jobForm.referenceGenome, pairedEnd: jobForm.pairedEnd } },
      { onSuccess: () => { refetchJobs(); setShowJobForm(false); setJobForm({ name: "", sampleType: "RNA", referenceGenome: "GRCh38", pairedEnd: false }); } }
    );
  };

  const topTissues = allSorted.slice(0, 5);
  const geneName = expressionData?.gene ?? geneSearchTerm;
  const gtexUrl = expressionData?.gtexUrl ?? `https://www.gtexportal.org/home/gene/${encodeURIComponent(geneName)}`;
  const ensemblUrl = expressionData?.ensemblUrl;

  // Histogram of TPM distribution (log buckets)
  const tpmHistogram = (() => {
    const buckets = [
      { bucket: "0-0.1", min: 0, max: 0.1, count: 0 },
      { bucket: "0.1-1", min: 0.1, max: 1, count: 0 },
      { bucket: "1-5", min: 1, max: 5, count: 0 },
      { bucket: "5-10", min: 5, max: 10, count: 0 },
      { bucket: "10-50", min: 10, max: 50, count: 0 },
      { bucket: "50-100", min: 50, max: 100, count: 0 },
      { bucket: "100+", min: 100, max: Infinity, count: 0 },
    ];
    for (const e of allSorted) {
      const b = buckets.find((b) => e.tpm >= b.min && e.tpm < b.max);
      if (b) b.count++;
    }
    return buckets;
  })();

  // Jobs timeline by month
  const jobsTimeline = (() => {
    const byMonth = new Map<string, number>();
    for (const job of jobsData?.jobs ?? []) {
      const month = String(job.createdAt).slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
    }
    return [...byMonth.entries()].sort().map(([date, count]) => ({ date, count }));
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight">RNA-Seq & Transcriptomics</h1>
        <p className="text-muted-foreground font-mono mt-1 text-sm">
          Live GTEx v8 expression + RNA-Seq job management
        </p>
      </div>

      <Card className="rounded-none border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm uppercase flex items-center justify-between flex-wrap gap-2">
            <span>Gene Expression — GTEx v8 (live)</span>
            {geneSearchTerm && (
              <div className="flex gap-3 text-xs font-mono">
                <a href={gtexUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-white flex items-center gap-0.5 uppercase">
                  GTEx Portal <ExternalLink className="h-2.5 w-2.5" />
                </a>
                {ensemblUrl && (
                  <a href={ensemblUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-white flex items-center gap-0.5 uppercase">
                    Ensembl <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="Gene symbol (e.g. BRCA1, TP53, ACTB, GAPDH)..."
              value={geneQuery}
              onChange={(e) => setGeneQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setGeneSearchTerm(geneQuery); }}
              className="rounded-none font-mono text-sm bg-black border-border flex-1 min-w-0"
            />
            <select
              value={tissueFilter}
              onChange={(e) => setTissueFilter(e.target.value)}
              className="bg-black border border-border text-white text-xs font-mono p-2 min-w-0 max-w-[200px]"
            >
              <option value="">All Tissues</option>
              {(tissuesData?.tissues ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <Button
              onClick={() => setGeneSearchTerm(geneQuery)}
              disabled={!geneQuery || expressionLoading}
              className="rounded-none uppercase text-xs"
            >
              {expressionLoading ? "Fetching..." : "Search GTEx"}
            </Button>
            {geneSearchTerm && (
              <Button variant="outline" onClick={() => { setGeneSearchTerm(""); setGeneQuery(""); }} className="rounded-none text-xs border-border">
                Clear
              </Button>
            )}
          </div>

          {expressionLoading && <Skeleton className="h-64 rounded-none" />}

          {!expressionLoading && sortedExpression.length > 0 && (
            <>
              <div className="flex items-center gap-4 flex-wrap">
                <p className="text-sm font-bold uppercase font-mono">{geneName}</p>
                {expressionData?.description && (
                  <span className="text-xs text-muted-foreground font-mono">{expressionData.description}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  {allSorted.length} tissues{tissueFilter ? ` | filtered: ${tissueFilter.replace(/_/g, " ")}` : ""} | max {maxTpm.toFixed(1)} TPM
                </span>
                {topTissues.slice(0, 3).map((t) => (
                  <Badge key={t.tissue} className="rounded-none bg-white text-black text-xs">
                    {t.tissueName ?? t.tissue?.replace(/_/g, " ")} — {t.tpm?.toFixed(1)}
                  </Badge>
                ))}
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={sortedExpression.slice(0, 30)}
                    layout="vertical"
                    margin={{ left: 150, right: 20, top: 0, bottom: 0 }}
                  >
                    <XAxis type="number" stroke="#666" tick={{ fill: "#666", fontSize: 10, fontFamily: "monospace" }} />
                    <YAxis
                      type="category"
                      dataKey="tissue"
                      width={145}
                      tick={{ fill: "#999", fontSize: 9, fontFamily: "monospace" }}
                      tickFormatter={(v) => String(v).replace(/_/g, " ").slice(0, 26)}
                    />
                    <Tooltip
                      contentStyle={{ background: "#0a0a0a", border: "1px solid #1a1a1a", fontFamily: "monospace", fontSize: 10 }}
                      formatter={(v: number) => [`${v.toFixed(2)} TPM`, "Expression"]}
                      labelFormatter={(label) => String(label).replace(/_/g, " ")}
                    />
                    <Bar dataKey="tpm" radius={0}>
                      {sortedExpression.slice(0, 30).map((entry, index) => {
                        const intensity = Math.max(30, Math.floor((entry.tpm / maxTpm) * 255));
                        return <Cell key={index} fill={`rgb(${intensity},${intensity},${intensity})`} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {!expressionLoading && geneSearchTerm && sortedExpression.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-xs font-mono text-muted-foreground uppercase">No expression data found for "{geneSearchTerm}"</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different gene symbol (e.g. GAPDH, TP53, ACTB)</p>
            </div>
          )}
        </CardContent>
      </Card>

      {bodyMapLoading && <Skeleton className="h-[460px] rounded-none" />}
      {!bodyMapLoading && bodyOrgans.length > 0 && (
        <Card className="rounded-none border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm uppercase flex items-center justify-between flex-wrap gap-2">
              <span>Expression Body Map — {bodyMapData?.gene ?? geneName} in 3D</span>
              <span className="text-[10px] font-mono text-muted-foreground normal-case">
                {bodyMapData?.organCount} GTEx tissues · max {Number(bodyMapData?.maxTpm ?? 0).toFixed(1)} TPM · drag to rotate
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <BodyMap
              organs={bodyOrgans}
              selectedTissue={tissueFilter || null}
              onSelect={(tissue) => setTissueFilter(tissueFilter === tissue ? "" : tissue)}
            />
          </CardContent>
        </Card>
      )}

      {allSorted.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="TPM Distribution" subtitle={`${geneName} across ${allSorted.length} tissues`}>
            <HistogramChart data={tpmHistogram} />
          </ChartCard>
          <ChartCard title="Expression Table" subtitle="click tissue column in chart above to filter">
            <div className="max-h-[200px] overflow-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase">
                    <th className="text-left py-1 pr-4">Tissue</th>
                    <th className="text-left py-1 pr-4">TPM</th>
                    <th className="text-left py-1 pr-4">Median</th>
                    <th className="text-left py-1">GTEx</th>
                  </tr>
                </thead>
                <tbody>
                  {allSorted.slice(0, 12).map((e) => (
                    <tr key={`${e.tissue}-${e.geneId}`} className="border-b border-border hover:bg-white/5">
                      <td className="py-1 pr-4">{e.tissueName ?? e.tissue?.replace(/_/g, " ")}</td>
                      <td className="py-1 pr-4">{e.tpm?.toFixed(2)}</td>
                      <td className="py-1 pr-4 text-muted-foreground">{e.median != null ? e.median.toFixed(2) : "-"}</td>
                      <td className="py-1">
                        {e.gtexUrl && (
                          <a href={e.gtexUrl} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-white flex items-center gap-0.5">
                            link <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="rounded-none border-border bg-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm uppercase flex items-center justify-between">
              <span>RNA-Seq Jobs ({jobsData?.jobs?.length ?? 0})</span>
              <Button onClick={() => setShowJobForm(!showJobForm)} className="rounded-none uppercase text-xs">
                {showJobForm ? "Cancel" : "+ New Job"}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {showJobForm && (
              <div className="border border-border p-4 space-y-3">
                <p className="text-xs uppercase text-muted-foreground font-mono">New RNA-Seq Job</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Job name *" value={jobForm.name} onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })} className="rounded-none font-mono text-sm bg-black border-border" />
                  <select value={jobForm.sampleType} onChange={(e) => setJobForm({ ...jobForm, sampleType: e.target.value })} className="bg-black border border-border text-white text-sm font-mono p-2">
                    {["RNA", "mRNA", "miRNA", "lncRNA", "Total RNA"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={jobForm.referenceGenome} onChange={(e) => setJobForm({ ...jobForm, referenceGenome: e.target.value })} className="bg-black border border-border text-white text-sm font-mono p-2">
                    {["GRCh38", "GRCh37", "mm10", "mm39", "rn6"].map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-xs font-mono cursor-pointer">
                    <input type="checkbox" checked={jobForm.pairedEnd} onChange={(e) => setJobForm({ ...jobForm, pairedEnd: e.target.checked })} className="accent-white" />
                    Paired-End
                  </label>
                </div>
                <Button onClick={handleCreateJob} disabled={!jobForm.name || createJobMutation.isPending} className="rounded-none uppercase text-xs">
                  {createJobMutation.isPending ? "Creating..." : "Create Job"}
                </Button>
              </div>
            )}

            {jobsLoading ? <Skeleton className="h-40 rounded-none" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground uppercase">
                      <th className="text-left py-2 pr-4">Name</th>
                      <th className="text-left py-2 pr-4">Type</th>
                      <th className="text-left py-2 pr-4">Genome</th>
                      <th className="text-left py-2 pr-4">Reads</th>
                      <th className="text-left py-2 pr-4">Genes</th>
                      <th className="text-left py-2 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(jobsData?.jobs ?? []).length === 0 && (
                      <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No RNA-Seq jobs. Create one to start.</td></tr>
                    )}
                    {(jobsData?.jobs ?? []).map((job) => (
                      <tr key={job.id} className="border-b border-border hover:bg-white/5">
                        <td className="py-2 pr-4 font-bold">{job.name}</td>
                        <td className="py-2 pr-4">{job.sampleType ?? "-"}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{job.referenceGenome ?? "-"}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{job.readsCount?.toLocaleString() ?? "-"}</td>
                        <td className="py-2 pr-4">{job.genesDetected ?? "-"}</td>
                        <td className="py-2 pr-4">
                          <Badge className={`rounded-none text-xs ${job.status === "completed" ? "bg-white text-black" : job.status === "running" ? "bg-white/60 text-black" : "bg-white/10 text-white"}`}>
                            {job.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-none border-border bg-card">
          <CardHeader><CardTitle className="text-sm uppercase">GTEx Tissues ({(tissuesData?.tissues ?? []).length}) — click to filter</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-80 overflow-auto">
              {(tissuesData?.tissues ?? []).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTissueFilter(tissueFilter === t.id ? "" : t.id)}
                  className={`w-full text-left flex items-center justify-between py-1 px-1 text-xs font-mono hover:bg-white/5 transition-colors ${tissueFilter === t.id ? "text-white" : "text-muted-foreground"}`}
                >
                  <span className={`${tissueFilter === t.id ? "font-bold" : ""}`}>{t.name}</span>
                  <span>{t.sampleCount ?? ""}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {jobsTimeline.length > 1 && (
        <ChartCard title="Jobs Created Over Time" subtitle="RNA-Seq analyses per month">
          <TimelineChart data={jobsTimeline} xKey="date" />
        </ChartCard>
      )}
    </div>
  );
}
