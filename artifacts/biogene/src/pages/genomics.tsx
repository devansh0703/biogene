import { useState, useEffect } from "react";
import {
  useUploadVcf, useListVariants, useGetGenomicsStats, useListGenomicsJobs, useAnnotateVariant,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const SAMPLE_VCF = `##fileformat=VCFv4.2
##reference=GRCh38
#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO
17\t41197701\trs80357906\tG\tA\t.\tPASS\tAF=0.001
17\t41209068\trs28897696\tC\tT\t.\tPASS\tAF=0.002
17\t41215920\trs80358101\tG\tT\t.\tPASS\tAF=0.0005
17\t41234451\trs1799950\tG\tA\t.\tPASS\tAF=0.01
17\t41244000\trs80357382\tA\tG\t.\tPASS\tAF=0.003
7\t117548628\trs75527207\tG\tT\t.\tPASS\tAF=0.001
7\t117540076\trs1800118\tA\tG\t.\tPASS\tAF=0.015
13\t32316422\trs80359550\tA\tC\t.\tPASS\tAF=0.001
13\t32363178\trs80359304\tT\tA\t.\tPASS\tAF=0.0008
1\t925952\trs1234\tG\tA\t.\tPASS\tAF=0.01`;

const SIG_COLORS: Record<string, string> = {
  "Pathogenic": "bg-white text-black",
  "Likely pathogenic": "bg-white/80 text-black",
  "Benign": "bg-white/20 text-white",
  "Likely benign": "bg-white/10 text-white",
  "Uncertain significance": "bg-white/30 text-black",
};

export default function Genomics() {
  const [filename, setFilename] = useState("brca1_cftr_brca2_sample.vcf");
  const [vcfContent, setVcfContent] = useState(SAMPLE_VCF);
  const [chromosomeFilter, setChromosomeFilter] = useState("");
  const [significanceFilter, setSignificanceFilter] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [autoLoaded, setAutoLoaded] = useState(false);

  const uploadMutation = useUploadVcf();
  const { data: variantsData, isLoading: varLoading, refetch: refetchVariants } = useListVariants({
    chromosome: chromosomeFilter || undefined,
    significance: significanceFilter || undefined,
    limit: 50,
  });
  const { data: stats, isLoading: statsLoading } = useGetGenomicsStats({});
  const { data: jobsData } = useListGenomicsJobs();
  const { data: annotationData, isLoading: annotLoading } = useAnnotateVariant(selectedVariantId ?? "", {
    query: { enabled: !!selectedVariantId },
  });

  useEffect(() => {
    if (autoLoaded) return;
    if (statsLoading) return;
    const totalVariants = (stats as { totalVariants?: number } | undefined)?.totalVariants ?? 0;
    if (totalVariants === 0) {
      setAutoLoaded(true);
      uploadMutation.mutate(
        { data: { filename: "brca1_cftr_brca2_sample.vcf", content: SAMPLE_VCF } },
        { onSuccess: () => refetchVariants() }
      );
    } else {
      setAutoLoaded(true);
    }
  }, [stats, statsLoading, autoLoaded]);

  const handleUpload = () => {
    if (!vcfContent || !filename) return;
    uploadMutation.mutate({ data: { filename, content: vcfContent } }, {
      onSuccess: () => { refetchVariants(); },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight">Variant Analysis</h1>
        <p className="text-muted-foreground font-mono mt-1 text-sm">VCF Upload + Ensembl VEP + ClinVar Annotation</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-none" />)
        ) : (
          <>
            <Card className="rounded-none border-border bg-card">
              <CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">Total Variants</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold font-mono">{(stats as { totalVariants?: number } | undefined)?.totalVariants ?? 0}</p></CardContent>
            </Card>
            <Card className="rounded-none border-border bg-card">
              <CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">Jobs Run</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold font-mono">{(stats as { recentJobs?: number } | undefined)?.recentJobs ?? 0}</p></CardContent>
            </Card>
            <Card className="rounded-none border-border bg-card">
              <CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">Chromosomes</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold font-mono">{(stats as { byChromosome?: unknown[] } | undefined)?.byChromosome?.length ?? 0}</p></CardContent>
            </Card>
            <Card className="rounded-none border-border bg-card">
              <CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">Consequences</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold font-mono">{(stats as { byConsequence?: unknown[] } | undefined)?.byConsequence?.length ?? 0}</p></CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="rounded-none border-border bg-card lg:col-span-1">
          <CardHeader><CardTitle className="text-sm uppercase">Upload VCF</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="filename.vcf"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="rounded-none font-mono text-sm bg-black border-border"
            />
            <textarea
              value={vcfContent}
              onChange={(e) => setVcfContent(e.target.value)}
              rows={8}
              className="w-full rounded-none font-mono text-xs bg-black border border-border text-white p-2 resize-none focus:outline-none focus:ring-1 focus:ring-white"
            />
            <Button
              onClick={handleUpload}
              disabled={!vcfContent || !filename || uploadMutation.isPending}
              className="w-full rounded-none uppercase text-xs"
            >
              {uploadMutation.isPending ? "Annotating..." : "Upload + Annotate"}
            </Button>
            {uploadMutation.isSuccess && (
              <p className="text-xs text-muted-foreground font-mono">
                Job completed: {(uploadMutation.data as { variantCount?: number })?.variantCount ?? 0} variants annotated
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-none border-border bg-card lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm uppercase">Recent Jobs</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-56 overflow-auto">
              {(jobsData?.jobs ?? []).length === 0 && uploadMutation.isPending && (
                <p className="text-xs text-muted-foreground font-mono">Loading sample variants from BRCA1, CFTR, BRCA2...</p>
              )}
              {(jobsData?.jobs ?? []).length === 0 && !uploadMutation.isPending && (
                <p className="text-xs text-muted-foreground font-mono">No jobs yet.</p>
              )}
              {(jobsData?.jobs ?? []).map((job) => (
                <div key={job.id} className="flex items-center justify-between border-b border-border py-1">
                  <span className="text-xs font-mono truncate max-w-[200px]">{job.filename}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono">{job.variantCount ?? 0} variants</span>
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

      <Card className="rounded-none border-border bg-card">
        <CardHeader>
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-sm uppercase">Variants</CardTitle>
            <Input
              placeholder="Filter chromosome..."
              value={chromosomeFilter}
              onChange={(e) => setChromosomeFilter(e.target.value)}
              className="rounded-none font-mono text-xs bg-black border-border w-40"
            />
            <Input
              placeholder="Filter significance..."
              value={significanceFilter}
              onChange={(e) => setSignificanceFilter(e.target.value)}
              className="rounded-none font-mono text-xs bg-black border-border w-48"
            />
          </div>
        </CardHeader>
        <CardContent>
          {varLoading || uploadMutation.isPending ? <Skeleton className="h-48 rounded-none" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase">
                    <th className="text-left py-2 pr-4">Chr</th>
                    <th className="text-left py-2 pr-4">Position</th>
                    <th className="text-left py-2 pr-4">Ref</th>
                    <th className="text-left py-2 pr-4">Alt</th>
                    <th className="text-left py-2 pr-4">Gene</th>
                    <th className="text-left py-2 pr-4">Consequence</th>
                    <th className="text-left py-2 pr-4">Significance</th>
                    <th className="text-left py-2 pr-4">rsID</th>
                  </tr>
                </thead>
                <tbody>
                  {(variantsData?.variants ?? []).length === 0 && (
                    <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No variants found. Upload a VCF file to begin.</td></tr>
                  )}
                  {(variantsData?.variants ?? []).map((v) => (
                    <tr
                      key={v.id}
                      className="border-b border-border hover:bg-white/5 cursor-pointer transition-colors"
                      onClick={() => setSelectedVariantId(v.id === selectedVariantId ? null : v.id)}
                    >
                      <td className="py-2 pr-4">{v.chromosome}</td>
                      <td className="py-2 pr-4">{v.position?.toLocaleString()}</td>
                      <td className="py-2 pr-4">{v.ref}</td>
                      <td className="py-2 pr-4">{v.alt}</td>
                      <td className="py-2 pr-4">{v.gene ?? "-"}</td>
                      <td className="py-2 pr-4 max-w-[160px] truncate">{v.consequence ?? "-"}</td>
                      <td className="py-2 pr-4">
                        {v.significance ? (
                          <span className={`px-1 py-0.5 text-xs ${SIG_COLORS[v.significance] ?? "bg-white/10 text-white"}`}>
                            {v.significance}
                          </span>
                        ) : "-"}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{v.rsId ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedVariantId && (
        <Card className="rounded-none border-border bg-card">
          <CardHeader><CardTitle className="text-sm uppercase">Annotation Detail — Ensembl VEP + ClinVar</CardTitle></CardHeader>
          <CardContent>
            {annotLoading ? <Skeleton className="h-24 rounded-none" /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
                <div>
                  <p className="text-muted-foreground uppercase mb-1">Ensembl VEP</p>
                  <pre className="bg-black border border-border p-2 overflow-auto max-h-48 text-xs">
                    {JSON.stringify((annotationData as { ensemblAnnotation?: unknown } | undefined)?.ensemblAnnotation, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase mb-1">ClinVar</p>
                  <pre className="bg-black border border-border p-2 overflow-auto max-h-48 text-xs">
                    {JSON.stringify((annotationData as { clinvarAnnotation?: unknown } | undefined)?.clinvarAnnotation, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {stats && (stats as { byChromosome?: Array<{ chromosome: string; count: number }> }).byChromosome && (stats as { byChromosome?: Array<{ chromosome: string; count: number }> }).byChromosome!.length > 0 && (
        <Card className="rounded-none border-border bg-card">
          <CardHeader><CardTitle className="text-sm uppercase">Distribution by Chromosome</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {(stats as { byChromosome?: Array<{ chromosome: string; count: number }> }).byChromosome!.slice(0, 10).map((c) => {
                const max = (stats as { byChromosome?: Array<{ chromosome: string; count: number }> }).byChromosome![0]?.count ?? 1;
                const pct = ((c.count ?? 0) / max) * 100;
                return (
                  <div key={c.chromosome} className="flex items-center gap-3">
                    <span className="text-xs font-mono w-8 text-right text-muted-foreground">{c.chromosome}</span>
                    <div className="flex-1 bg-white/5 h-4 relative">
                      <div className="h-4 bg-white transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-mono w-10 text-right">{c.count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
