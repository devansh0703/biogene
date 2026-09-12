import { useState, useEffect } from "react";
import {
  useUploadVcf, getListVariantsQueryOptions, getGetGenomicsStatsQueryOptions,
  getListGenomicsJobsQueryOptions, getAnnotateVariantQueryOptions,
  getGetVariantSequenceContextQueryOptions,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useQueryParams } from "@/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChartCard, CountBarChart, CountPieChart, HistogramChart, type Count } from "@/components/charts";
import DnaHelix from "@/components/dna-helix";
import { ExternalLink } from "lucide-react";

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

interface VariantRow {
  id: string;
  chromosome: string;
  position: number;
  ref: string;
  alt: string;
  rsId: string | null;
  gene: string | null;
  consequence: string | null;
  significance: string | null;
}

export default function Genomics() {
  const urlParams = useQueryParams();

  const [filename, setFilename] = useState("brca1_cftr_brca2_sample.vcf");
  const [vcfContent, setVcfContent] = useState(SAMPLE_VCF);
  const [chromosomeFilter, setChromosomeFilter] = useState(urlParams["chromosome"] ?? "");
  const [significanceFilter, setSignificanceFilter] = useState(urlParams["significance"] ?? "");
  const [geneFilter, setGeneFilter] = useState(urlParams["gene"] ?? "");
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [autoLoaded, setAutoLoaded] = useState(false);

  const uploadMutation = useUploadVcf();
  const { data: variantsData, isLoading: varLoading, refetch: refetchVariants } = useQuery(
    getListVariantsQueryOptions(
      {
        chromosome: chromosomeFilter || undefined,
        significance: significanceFilter || undefined,
        limit: 50,
      },
      { query: { queryKey: ["variants", chromosomeFilter, significanceFilter] } },
    ),
  );
  const { data: stats, isLoading: statsLoading } = useQuery(getGetGenomicsStatsQueryOptions());
  const { data: jobsData } = useQuery(getListGenomicsJobsQueryOptions());
  const { data: annotationData, isLoading: annotLoading } = useQuery(
    getAnnotateVariantQueryOptions(selectedVariantId ?? "", {
      query: { enabled: !!selectedVariantId, queryKey: ["variant-annotation", selectedVariantId] },
    }),
  );
  // Real reference bases around the variant (Ensembl GRCh38) for the 3D helix.
  const { data: seqContext } = useQuery(
    getGetVariantSequenceContextQueryOptions(selectedVariantId ?? "", undefined, {
      query: { enabled: !!selectedVariantId, queryKey: ["variant-seqctx", selectedVariantId] },
    }),
  );

  useEffect(() => {
    if (autoLoaded || statsLoading) return;
    const totalVariants = stats?.totalVariants ?? 0;
    setAutoLoaded(true);
    if (totalVariants === 0) {
      uploadMutation.mutate(
        { data: { filename: "brca1_cftr_brca2_sample.vcf", content: SAMPLE_VCF } },
        { onSuccess: () => refetchVariants() },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, statsLoading, autoLoaded]);

  const handleUpload = () => {
    if (!vcfContent || !filename) return;
    uploadMutation.mutate({ data: { filename, content: vcfContent } }, {
      onSuccess: () => { refetchVariants(); },
    });
  };

  const variants = (variantsData?.variants ?? []) as unknown as VariantRow[];
  const externalUrls = (annotationData as { externalUrls?: Record<string, string | null> } | undefined)?.externalUrls;

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
            {[
              ["Total Variants", stats?.totalVariants ?? 0],
              ["Jobs Run", stats?.recentJobs ?? 0],
              ["Chromosomes", stats?.byChromosome?.length ?? 0],
              ["Consequences", stats?.byConsequence?.length ?? 0],
            ].map(([label, value]) => (
              <Card key={String(label)} className="rounded-none border-border bg-card">
                <CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">{label}</CardTitle></CardHeader>
                <CardContent><p className="text-3xl font-bold font-mono">{Number(value).toLocaleString()}</p></CardContent>
              </Card>
            ))}
          </>
        )}
      </div>

      {/* Charts */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard title="Significance Distribution" subtitle="ClinVar">
            <CountPieChart
              data={(stats.bySignificance ?? []).map((s) => ({ key: s.significance, count: s.count })) as Count[]}
              selected={significanceFilter || undefined}
              onSelect={(k) => setSignificanceFilter(significanceFilter === k ? "" : k)}
            />
          </ChartCard>
          <ChartCard title="Top Genes" subtitle="click to filter variants">
            <CountBarChart
              data={(stats.topGenes ?? []).map((g) => ({ key: g.gene, count: g.count })) as Count[]}
              layout="horizontal"
              maxBars={10}
              selected={geneFilter || undefined}
              onSelect={(k) => setGeneFilter(geneFilter === k ? "" : k)}
            />
          </ChartCard>
          <ChartCard title="Quality Histogram" subtitle="variant quality score">
            <HistogramChart data={stats.qualityHistogram ?? []} />
          </ChartCard>
        </div>
      )}

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
                Job completed: {(uploadMutation.data as unknown as { variantCount?: number })?.variantCount ?? 0} variants parsed
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-none border-border bg-card lg:col-span-2">
          <CardHeader><CardTitle className="text-sm uppercase">Recent Jobs</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-56 overflow-auto">
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
              placeholder="Filter gene..."
              value={geneFilter}
              onChange={(e) => setGeneFilter(e.target.value)}
              className="rounded-none font-mono text-xs bg-black border-border w-40"
            />
            <Input
              placeholder="Filter significance..."
              value={significanceFilter}
              onChange={(e) => setSignificanceFilter(e.target.value)}
              className="rounded-none font-mono text-xs bg-black border-border w-48"
            />
            {(chromosomeFilter || significanceFilter || geneFilter) && (
              <Button variant="outline" size="sm" onClick={() => { setChromosomeFilter(""); setSignificanceFilter(""); setGeneFilter(""); }} className="rounded-none text-xs border-border">
                Clear
              </Button>
            )}
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
                    <th className="text-left py-2 pr-4">Links</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.length === 0 && (
                    <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No variants found. Upload a VCF file to begin.</td></tr>
                  )}
                  {variants.map((v) => (
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
                      <td className="py-2 pr-4">{v.significance ?? "-"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{v.rsId ?? "-"}</td>
                      <td className="py-2 pr-4">
                        {v.rsId && (
                          <a
                            href={`https://www.ncbi.nlm.nih.gov/snp/${v.rsId}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-white flex items-center gap-0.5"
                          >
                            dbSNP <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </td>
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
          <CardHeader>
            <CardTitle className="text-sm uppercase flex items-center justify-between flex-wrap gap-2">
              <span>Annotation Detail — Ensembl VEP + ClinVar</span>
              <div className="flex gap-3 text-xs font-mono">
                {externalUrls && Object.entries(externalUrls).filter(([, u]) => u).map(([k, u]) => (
                  <a key={k} href={u as string} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-white flex items-center gap-0.5 uppercase">
                    {k} <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ))}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {annotLoading ? <Skeleton className="h-24 rounded-none" /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
                <div>
                  <p className="text-muted-foreground uppercase mb-1">Ensembl VEP</p>
                  <pre className="bg-black border border-border p-2 overflow-auto max-h-48 text-xs">
                    {JSON.stringify(annotationData?.ensemblAnnotation, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase mb-1">ClinVar</p>
                  <pre className="bg-black border border-border p-2 overflow-auto max-h-48 text-xs">
                    {JSON.stringify(annotationData?.clinvarAnnotation, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedVariantId && seqContext && (
        <Card className="rounded-none border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm uppercase flex items-center justify-between flex-wrap gap-2">
              <span>Variant in 3D — Real Sequence Context</span>
              <span className="text-[10px] font-mono text-muted-foreground normal-case">
                {seqContext.source} · ±{seqContext.flank} bp
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-64 bg-black">
              <DnaHelix
                sequence={`${seqContext.leftFlank}${seqContext.refAllele}${seqContext.rightFlank}`}
                highlightIndex={seqContext.leftFlank.length}
                highlightLabel={`${seqContext.variant.chromosome}:${(seqContext.variant.position ?? 0).toLocaleString()} ${seqContext.refAllele}>${seqContext.variant.alt}`}
              />
            </div>
            <div className="flex flex-wrap gap-3 p-3 font-mono text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 inline-block" style={{ background: "#ff6b6b" }} />A</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 inline-block" style={{ background: "#4ecdc4" }} />T</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 inline-block" style={{ background: "#ffd93d" }} />G</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 inline-block" style={{ background: "#6bcb77" }} />C</span>
              <span className="ml-auto truncate">{seqContext.sequence.slice(0, 120)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {stats && stats.byChromosome && stats.byChromosome.length > 0 && (
        <ChartCard title="Distribution by Chromosome" subtitle="click a bar to filter">
          <CountBarChart
            data={(stats.byChromosome ?? []).slice(0, 24).map((c) => ({ key: c.chromosome, count: c.count })) as Count[]}
            selected={chromosomeFilter || undefined}
            onSelect={(k) => setChromosomeFilter(chromosomeFilter === k ? "" : k)}
            layout="horizontal"
            maxBars={24}
            height={320}
          />
        </ChartCard>
      )}
    </div>
  );
}
