import { useGetLimsStats, useGetDrugDashboardStats, useGetGenomicsStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Dna, Database, Microchip, Library, FlaskConical, Stethoscope, LineChart } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: limsStats, isLoading: limsLoading } = useGetLimsStats();
  const { data: drugStats, isLoading: drugLoading } = useGetDrugDashboardStats();
  const { data: genomicsStats, isLoading: genomicsLoading } = useGetGenomicsStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight">System Dashboard</h1>
        <p className="text-muted-foreground font-mono mt-2">BioForge Unified Bioinformatics Platform</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* LIMS Card */}
        <Link href="/lims">
          <Card className="hover:bg-accent/5 cursor-pointer transition-colors border-border rounded-none h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase flex items-center gap-2">
                <FlaskConical className="h-4 w-4" /> Lab Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              {limsLoading ? <Skeleton className="h-16 w-full rounded-none" /> : (
                <div className="font-mono text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Active Samples</span>
                    <span>{limsStats?.activeSamples ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Running Exps</span>
                    <span>{limsStats?.runningExperiments ?? 0}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Drug Discovery Card */}
        <Link href="/drugs">
          <Card className="hover:bg-accent/5 cursor-pointer transition-colors border-border rounded-none h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase flex items-center gap-2">
                <Stethoscope className="h-4 w-4" /> Drug Discovery
              </CardTitle>
            </CardHeader>
            <CardContent>
              {drugLoading ? <Skeleton className="h-16 w-full rounded-none" /> : (
                <div className="font-mono text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Approved Drugs</span>
                    <span>{drugStats?.approvedDrugs ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Unique Targets</span>
                    <span>{drugStats?.uniqueTargets ?? 0}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Genomics Card */}
        <Link href="/genomics">
          <Card className="hover:bg-accent/5 cursor-pointer transition-colors border-border rounded-none h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase flex items-center gap-2">
                <Dna className="h-4 w-4" /> Variant Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              {genomicsLoading ? <Skeleton className="h-16 w-full rounded-none" /> : (
                <div className="font-mono text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Variants</span>
                    <span>{genomicsStats?.totalVariants ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recent Jobs</span>
                    <span>{genomicsStats?.recentJobs ?? 0}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* CRISPR Card */}
        <Link href="/crispr">
          <Card className="hover:bg-accent/5 cursor-pointer transition-colors border-border rounded-none h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase flex items-center gap-2">
                <Database className="h-4 w-4" /> CRISPR Design
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="text-white font-bold">ONLINE</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        
        {/* Protein Card */}
        <Link href="/protein">
          <Card className="hover:bg-accent/5 cursor-pointer transition-colors border-border rounded-none h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase flex items-center gap-2">
                <Microchip className="h-4 w-4" /> Protein Structure
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="text-white font-bold">ONLINE</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* NLP Card */}
        <Link href="/nlp">
          <Card className="hover:bg-accent/5 cursor-pointer transition-colors border-border rounded-none h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase flex items-center gap-2">
                <Library className="h-4 w-4" /> Biomedical NLP
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="text-white font-bold">ONLINE</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Genome Browser Card */}
        <Link href="/genome">
          <Card className="hover:bg-accent/5 cursor-pointer transition-colors border-border rounded-none h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase flex items-center gap-2">
                <LineChart className="h-4 w-4" /> Genome Browser
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="text-white font-bold">ONLINE</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* RNA-Seq Card */}
        <Link href="/transcriptomics">
          <Card className="hover:bg-accent/5 cursor-pointer transition-colors border-border rounded-none h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase flex items-center gap-2">
                <Activity className="h-4 w-4" /> RNA-Seq
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="text-white font-bold">ONLINE</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

      </div>
    </div>
  );
}