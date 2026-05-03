import { useState } from "react";
import {
  useSearchGeneExpression, useListTissues, useListTranscriptomicsJobs, useCreateTranscriptomicsJob,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const JOB_STATUSES = ["pending", "running", "completed", "failed"];

export default function Transcriptomics() {
  const [geneQuery, setGeneQuery] = useState("");
  const [geneSearchTerm, setGeneSearchTerm] = useState("");
  const [tissueFilter, setTissueFilter] = useState("");
  const [showJobForm, setShowJobForm] = useState(false);
  const [jobForm, setJobForm] = useState({ name: "", sampleType: "RNA", referenceGenome: "GRCh38", pairedEnd: false });

  const { data: expressionData, isLoading: expressionLoading } = useSearchGeneExpression(
    { gene: geneSearchTerm, tissue: tissueFilter || undefined },
    { query: { enabled: !!geneSearchTerm } }
  );
  const { data: tissuesData } = useListTissues();
  const { data: jobsData, isLoading: jobsLoading, refetch: refetchJobs } = useListTranscriptomicsJobs();
  const createJobMutation = useCreateTranscriptomicsJob();

  const sortedExpression = [...(expressionData?.expressions ?? [])].sort((a, b) => (b.tpm ?? 0) - (a.tpm ?? 0));
  const maxTpm = expressionData?.maxTpm ?? 1;

  const handleCreateJob = () => {
    createJobMutation.mutate(
      { data: { name: jobForm.name, sampleType: jobForm.sampleType, referenceGenome: jobForm.referenceGenome, pairedEnd: jobForm.pairedEnd } },
      { onSuccess: () => { refetchJobs(); setShowJobForm(false); setJobForm({ name: "", sampleType: "RNA", referenceGenome: "GRCh38", pairedEnd: false }); } }
    );
  };

  const topTissues = sortedExpression.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight">RNA-Seq & Transcriptomics</h1>
        <p className="text-muted-foreground font-mono mt-1 text-sm">
          GTEx v8 expression data + RNA-Seq job management
        </p>
      </div>

      <Card className="rounded-none border-border bg-card">
        <CardHeader><CardTitle className="text-sm uppercase">Gene Expression Search — GTEx v8</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="Gene symbol (e.g. BRCA1, TP53, ACTB, GAPDH)..."
              value={geneQuery}
              onChange={(e) => setGeneQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setGeneSearchTerm(geneQuery); }}
              className="rounded-none font-mono text-sm bg-black border-border flex-1 min-w-0"
              data-testid="gene-expression-input"
            />
            <select
              value={tissueFilter}
              onChange={(e) => setTissueFilter(e.target.value)}
              className="bg-black border border-border text-white text-xs font-mono p-2 min-w-0 max-w-[200px]"
              data-testid="tissue-filter"
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
              data-testid="expression-search-btn"
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
              <div className="flex items-center gap-4">
                <p className="text-sm font-bold uppercase font-mono">{geneSearchTerm}</p>
                <span className="text-xs text-muted-foreground">{sortedExpression.length} tissues | max {maxTpm.toFixed(1)} TPM</span>
                {topTissues.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {topTissues.map((t) => (
                      <Badge key={t.tissue} className="rounded-none bg-white text-black text-xs">
                        {t.tissue?.replace(/_/g, " ")} — {t.tpm?.toFixed(1)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={sortedExpression.slice(0, 30)}
                    layout="vertical"
                    margin={{ left: 160, right: 20, top: 0, bottom: 0 }}
                  >
                    <XAxis type="number" stroke="#666" tick={{ fill: "#666", fontSize: 10, fontFamily: "monospace" }} />
                    <YAxis
                      type="category"
                      dataKey="tissue"
                      width={155}
                      tick={{ fill: "#999", fontSize: 9, fontFamily: "monospace" }}
                      tickFormatter={(v) => String(v).replace(/_/g, " ").slice(0, 28)}
                    />
                    <Tooltip
                      contentStyle={{ background: "#0a0a0a", border: "1px solid #1a1a1a", fontFamily: "monospace", fontSize: 10 }}
                      formatter={(v: number) => [`${v.toFixed(2)} TPM`, "Expression"]}
                      labelFormatter={(label) => String(label).replace(/_/g, " ")}
                    />
                    <Bar dataKey="tpm" radius={0}>
                      {sortedExpression.slice(0, 30).map((entry, index) => {
                        const intensity = Math.floor((entry.tpm / maxTpm) * 255);
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="rounded-none border-border bg-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm uppercase flex items-center justify-between">
              <span>RNA-Seq Jobs ({jobsData?.jobs?.length ?? 0})</span>
              <Button onClick={() => setShowJobForm(!showJobForm)} className="rounded-none uppercase text-xs" data-testid="add-job-btn">
                {showJobForm ? "Cancel" : "+ New Job"}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {showJobForm && (
              <div className="border border-border p-4 space-y-3">
                <p className="text-xs uppercase text-muted-foreground font-mono">New RNA-Seq Job</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Job name *" value={jobForm.name} onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })} className="rounded-none font-mono text-sm bg-black border-border" data-testid="job-name-input" />
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
                <Button onClick={handleCreateJob} disabled={!jobForm.name || createJobMutation.isPending} className="rounded-none uppercase text-xs" data-testid="save-job-btn">
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
                      <th className="text-left py-2 pr-4">Genes</th>
                      <th className="text-left py-2 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(jobsData?.jobs ?? []).length === 0 && (
                      <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No RNA-Seq jobs. Create one to start.</td></tr>
                    )}
                    {(jobsData?.jobs ?? []).map((job) => (
                      <tr key={job.id} className="border-b border-border hover:bg-white/5">
                        <td className="py-2 pr-4 font-bold">{job.name}</td>
                        <td className="py-2 pr-4">{job.sampleType}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{job.referenceGenome}</td>
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
          <CardHeader><CardTitle className="text-sm uppercase">GTEx Tissues ({(tissuesData?.tissues ?? []).length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-80 overflow-auto">
              {(tissuesData?.tissues ?? []).map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setTissueFilter(t.id); if (geneSearchTerm) {} }}
                  className={`w-full text-left flex items-center justify-between py-1 px-1 text-xs font-mono hover:bg-white/5 transition-colors ${tissueFilter === t.id ? "text-white" : "text-muted-foreground"}`}
                  data-testid="tissue-item"
                >
                  <span className={`${tissueFilter === t.id ? "font-bold" : ""}`}>{t.name}</span>
                  <span>{t.sampleCount}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
