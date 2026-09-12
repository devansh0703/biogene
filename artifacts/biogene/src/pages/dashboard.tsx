import { Link, useLocation } from "wouter";
import {
  useGetStatsOverview, useGetLimsStats, useGetDrugDashboardStats, useGetGenomicsStats,
  getGetSearchSchemaQueryOptions,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CountBarChart, CountPieChart, TimelineChart, ChartCard, type Count } from "@/components/charts";
import { Activity, Dna, Database, Microchip, Library, FlaskConical, Stethoscope, LineChart, Search } from "lucide-react";

const MODULE_LINKS: Record<string, string> = {
  genomicsJobs: "/genomics",
  variants: "/genomics",
  crisprJobs: "/crispr",
  guideRnas: "/crispr",
  samples: "/lims",
  experiments: "/lims",
  nlpEntities: "/nlp",
  nlpRelations: "/nlp",
  transcriptomicsJobs: "/transcriptomics",
};

export default function Dashboard() {
  const { data: overview, isLoading: overviewLoading } = useGetStatsOverview();
  const { data: limsStats, isLoading: limsLoading } = useGetLimsStats();
  const { data: drugStats, isLoading: drugLoading } = useGetDrugDashboardStats();
  const { data: genomicsStats, isLoading: genomicsLoading } = useGetGenomicsStats();
  const { data: searchSchema } = useQuery(getGetSearchSchemaQueryOptions());

  const [, navigate] = useLocation();
  const datasets = Object.entries(overview?.datasets ?? {});
  const moduleStats = (overview?.moduleStats ?? {}) as Record<string, Record<string, unknown>>;
  const ms = (mod: string): Record<string, unknown> => moduleStats[mod] ?? {};
  const moduleCards = [
    { title: "Lab Management", href: "/lims", icon: FlaskConical, loading: limsLoading, rows: [["Active Samples", limsStats?.activeSamples ?? 0], ["Running Exps", limsStats?.runningExperiments ?? 0], ["Total Samples", limsStats?.totalSamples ?? 0]] },
    { title: "Drug Discovery", href: "/drugs", icon: Stethoscope, loading: drugLoading, rows: [["Approved Drugs", drugStats?.approvedDrugs ?? 0], ["Unique Targets", drugStats?.uniqueTargets ?? 0], ["Phase-4 Indications", drugStats?.phase4Indications ?? 0]] },
    { title: "Variant Analysis", href: "/genomics", icon: Dna, loading: genomicsLoading, rows: [["Total Variants", genomicsStats?.totalVariants ?? 0], ["Jobs Run", genomicsStats?.recentJobs ?? 0], ["Top Gene", genomicsStats?.topGenes?.[0]?.gene ?? "—"]] },
    { title: "CRISPR Design", href: "/crispr", icon: Database, loading: false, rows: [["Jobs", ms("crispr").jobs ?? 0], ["Guides", ms("crispr").guides ?? 0], ["Status", "ONLINE"]] },
    { title: "Protein Structure", href: "/protein", icon: Microchip, loading: false, rows: [["Source", "RCSB PDB"], ["Viewer", "NGL 3D"], ["Status", "ONLINE"]] },
    { title: "Biomedical NLP", href: "/nlp", icon: Library, loading: false, rows: [["Entities", ms("nlp").entities ?? 0], ["Relations", ms("nlp").relations ?? 0], ["Status", "ONLINE"]] },
    { title: "Genome Browser", href: "/genome", icon: LineChart, loading: false, rows: [["Engine", "Ensembl REST"], ["Search", "NCBI Gene"], ["Status", "ONLINE"]] },
    { title: "RNA-Seq", href: "/transcriptomics", icon: Activity, loading: false, rows: [["Jobs", ms("transcriptomics").jobs ?? 0], ["Source", "GTEx v8"], ["Status", "ONLINE"]] },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight">System Dashboard</h1>
          <p className="text-muted-foreground font-mono mt-2">BioGene Unified Bioinformatics Platform</p>
        </div>
        <Link
          href="/search"
          className="flex items-center gap-2 border border-border px-4 py-2 text-xs uppercase font-mono hover:bg-white/10 transition-colors"
          data-testid="dashboard-global-search"
        >
          <Search className="h-4 w-4" /> Global Search
        </Link>
      </div>

      {/* Cross-dataset totals */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {overviewLoading || !overview
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-none" />)
          : datasets.slice(0, 5).map(([name, count]) => (
              <Link key={name} href={MODULE_LINKS[name] ?? "/"}>
                <Card className="hover:bg-accent/5 cursor-pointer transition-colors border-border rounded-none">
                  <CardHeader className="pb-1"><CardTitle className="text-[10px] uppercase text-muted-foreground">{name.replace(/([A-Z])/g, " $1")}</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold font-mono">{count.toLocaleString()}</p></CardContent>
                </Card>
              </Link>
            ))}
      </div>
      {overview && datasets.length > 5 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {datasets.slice(5).map(([name, count]) => (
            <Link key={name} href={MODULE_LINKS[name] ?? "/"}>
              <Card className="hover:bg-accent/5 cursor-pointer transition-colors border-border rounded-none">
                <CardHeader className="pb-1"><CardTitle className="text-[10px] uppercase text-muted-foreground">{name.replace(/([A-Z])/g, " $1")}</CardTitle></CardHeader>
                <CardContent><p className="text-xl font-bold font-mono">{count.toLocaleString()}</p></CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Overview charts */}
      {overview && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Variant Significance" subtitle="click to open filtered view">
            <CountPieChart
              data={(overview.charts.variantSignificance ?? []) as Count[]}
              onSelect={(key) => navigate(`/genomics?significance=${encodeURIComponent(key)}`)}
            />
          </ChartCard>
          <ChartCard title="NLP Entity Types" subtitle="all indexed entities">
            <CountPieChart data={(overview.charts.entityTypeBreakdown ?? []) as Count[]} />
          </ChartCard>
          <ChartCard title="Sample Types" subtitle="click to open in LIMS">
            <CountBarChart
              data={(overview.charts.sampleTypes ?? []) as Count[]}
              layout="horizontal"
              onSelect={(key) => navigate(`/lims?type=${encodeURIComponent(key)}`)}
            />
          </ChartCard>
          <ChartCard title="Variant Uploads — last 14 days" subtitle="daily activity">
            <TimelineChart data={overview.charts.variantActivity ?? []} xKey="date" />
          </ChartCard>
        </div>
      )}

      {/* Module cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {moduleCards.map((m) => (
          <Link key={m.title} href={m.href}>
            <Card className="hover:bg-accent/5 cursor-pointer transition-colors border-border rounded-none h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold uppercase flex items-center gap-2">
                  <m.icon className="h-4 w-4" /> {m.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {m.loading ? <Skeleton className="h-16 w-full rounded-none" /> : (
                  <div className="font-mono text-sm space-y-1">
                    {m.rows.map(([label, value]) => (
                      <div key={String(label)} className="flex justify-between">
                        <span className="text-muted-foreground">{String(label)}</span>
                        <span>{typeof value === "number" ? value.toLocaleString() : String(value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Search index schema */}
      {searchSchema && (
        <ChartCard title="Search Index" subtitle={`${searchSchema.collections.reduce((a, c) => a + c.count, 0).toLocaleString()} indexed records — click a dataset to search it`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {searchSchema.collections.map((c) => (
              <Link
                key={c.collection}
                href={`/search?collections=${c.collection}`}
                className="border border-border p-2 hover:bg-white/5 transition-colors block"
              >
                <div className="flex justify-between text-xs font-mono">
                  <span className="font-bold uppercase">{c.collection}</span>
                  <span className="text-muted-foreground">{c.count.toLocaleString()}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 truncate">{c.searchableFields.join(" · ")}</p>
              </Link>
            ))}
          </div>
        </ChartCard>
      )}

      {/* Experiment status snapshot */}
      {limsStats && (
        <ChartCard title="Experiment Status" subtitle="click to open in LIMS">
          <CountBarChart
            data={(limsStats.experimentsByStatus ?? []).map((s) => ({ key: s.status, count: s.count })) as Count[]}
            onSelect={(key) => navigate(`/lims?status=${encodeURIComponent(key)}`)}
          />
        </ChartCard>
      )}
    </div>
  );
}
