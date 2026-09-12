import { useState, useMemo } from "react";
import {
  useListSamples, useCreateSample, useUpdateSample, useDeleteSample,
  useListExperiments, useCreateExperiment, useUpdateExperiment,
  getGetLimsStatsQueryOptions,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChartCard, CountBarChart, CountPieChart, HistogramChart, TimelineChart, type Count } from "@/components/charts";
import { useQueryParams } from "@/lib/api-url";

const SAMPLE_TYPES = ["DNA", "RNA", "Protein", "Cell Line", "Tissue", "Blood", "Plasma", "Serum", "Other"];
const EXP_TYPES = ["PCR", "qPCR", "RNA-Seq", "ChIP-Seq", "Western Blot", "ELISA", "Flow Cytometry", "CRISPR", "NGS", "Other"];
const STATUS_COLORS: Record<string, string> = {
  active: "bg-white text-black",
  depleted: "bg-white/30 text-white",
  degraded: "bg-white/10 text-white",
  archived: "bg-white/10 text-white",
  planned: "bg-white/10 text-white",
  running: "bg-white text-black",
  completed: "bg-white/60 text-black",
  failed: "bg-white/10 text-white",
};

interface SampleRow {
  id: string;
  name: string;
  type: string;
  status: string;
  concentration?: number | null;
  unit?: string | null;
  volume?: number | null;
  organism?: string | null;
  tissue?: string | null;
  barcode?: string | null;
  createdAt: string;
}
interface ExperimentRow {
  id: string;
  name: string;
  type: string;
  status: string;
  protocol?: string | null;
  notes?: string | null;
  createdAt: string;
}

export default function Lims() {
  const urlParams = useQueryParams();
  const [activeTab, setActiveTab] = useState<"samples" | "experiments">("samples");
  const [q, setQ] = useState("");
  const [sampleType, setSampleType] = useState(urlParams["type"] ?? "");
  const [sampleStatus, setSampleStatus] = useState(urlParams["status"] ?? "");
  const [expStatus, setExpStatus] = useState("");
  const [showSampleForm, setShowSampleForm] = useState(false);
  const [showExpForm, setShowExpForm] = useState(false);
  const [sampleForm, setSampleForm] = useState({ name: "", type: "DNA", concentration: "", unit: "ng/uL", volume: "", organism: "", tissue: "" });
  const [expForm, setExpForm] = useState({ name: "", type: "PCR", protocol: "", notes: "" });

  const { data: samplesData, isLoading: samplesLoading, refetch: refetchSamples } = useListSamples({
    q: q || undefined,
    type: sampleType || undefined,
    status: sampleStatus || undefined,
    limit: 100,
  });
  const { data: expsData, isLoading: expsLoading, refetch: refetchExps } = useListExperiments({
    status: expStatus || undefined, limit: 100,
  });
  const { data: stats, isLoading: statsLoading } = useQuery(getGetLimsStatsQueryOptions());

  const createSampleMutation = useCreateSample();
  const updateSampleMutation = useUpdateSample();
  const deleteSampleMutation = useDeleteSample();
  const createExpMutation = useCreateExperiment();
  const updateExpMutation = useUpdateExperiment();

  const samples = (samplesData?.samples ?? []) as unknown as SampleRow[];
  const experiments = (expsData?.experiments ?? []) as unknown as ExperimentRow[];

  const handleCreateSample = () => {
    createSampleMutation.mutate({
      data: {
        name: sampleForm.name,
        type: sampleForm.type,
        concentration: sampleForm.concentration ? parseFloat(sampleForm.concentration) : undefined,
        unit: sampleForm.unit || undefined,
        volume: sampleForm.volume ? parseFloat(sampleForm.volume) : undefined,
        organism: sampleForm.organism || undefined,
        tissue: sampleForm.tissue || undefined,
      },
    }, {
      onSuccess: () => {
        refetchSamples();
        setSampleForm({ name: "", type: "DNA", concentration: "", unit: "ng/uL", volume: "", organism: "", tissue: "" });
        setShowSampleForm(false);
      },
    });
  };

  const handleUpdateSampleStatus = (id: string, status: string) => {
    updateSampleMutation.mutate({ sampleId: id, data: { status } }, { onSuccess: () => refetchSamples() });
  };

  const handleCreateExp = () => {
    createExpMutation.mutate({
      data: { name: expForm.name, type: expForm.type, protocol: expForm.protocol || undefined, notes: expForm.notes || undefined },
    }, {
      onSuccess: () => {
        refetchExps();
        setExpForm({ name: "", type: "PCR", protocol: "", notes: "" });
        setShowExpForm(false);
      },
    });
  };

  const handleDeleteSample = (id: string) => {
    deleteSampleMutation.mutate({ sampleId: id }, { onSuccess: () => refetchSamples() });
  };

  const handleUpdateExpStatus = (id: string, status: string) => {
    updateExpMutation.mutate({ experimentId: id, data: { status } }, { onSuccess: () => refetchExps() });
  };

  // Client-side charts derived from rows (fast, reflects current filters)
  const concHistogram = useMemo(() => {
    const buckets = [
      { bucket: "0-10", min: 0, max: 10, count: 0 },
      { bucket: "10-25", min: 10, max: 25, count: 0 },
      { bucket: "25-50", min: 25, max: 50, count: 0 },
      { bucket: "50-100", min: 50, max: 100, count: 0 },
      { bucket: "100-200", min: 100, max: 200, count: 0 },
      { bucket: "200+", min: 200, max: Infinity, count: 0 },
    ];
    for (const s of samples) {
      if (s.concentration == null) continue;
      const b = buckets.find((b) => s.concentration! >= b.min && s.concentration! < b.max);
      if (b) b.count++;
    }
    return buckets.filter((b) => b.count > 0 || samples.some((s) => s.concentration != null));
  }, [samples]);

  const volumeHistogram = useMemo(() => {
    const buckets = [
      { bucket: "0-50", min: 0, max: 50, count: 0 },
      { bucket: "50-100", min: 50, max: 100, count: 0 },
      { bucket: "100-250", min: 100, max: 250, count: 0 },
      { bucket: "250-500", min: 250, max: 500, count: 0 },
      { bucket: "500+", min: 500, max: Infinity, count: 0 },
    ];
    for (const s of samples) {
      if (s.volume == null) continue;
      const b = buckets.find((b) => s.volume! >= b.min && s.volume! < b.max);
      if (b) b.count++;
    }
    return buckets;
  }, [samples]);

  const organismChart: Count[] = useMemo(() => {
    const byOrg = new Map<string, number>();
    for (const s of samples) {
      const k = s.organism ?? "unspecified";
      byOrg.set(k, (byOrg.get(k) ?? 0) + 1);
    }
    return [...byOrg.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [samples]);

  const expTypeChart: Count[] = useMemo(() => {
    const byType = new Map<string, number>();
    for (const e of experiments) {
      byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
    }
    return [...byType.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  }, [experiments]);

  const expStatusChart: Count[] = useMemo(() => {
    const byStatus = new Map<string, number>();
    for (const e of experiments) {
      byStatus.set(e.status, (byStatus.get(e.status) ?? 0) + 1);
    }
    return [...byStatus.entries()].map(([key, count]) => ({ key, count }));
  }, [experiments]);

  const sampleStatusChart: Count[] = useMemo(() => {
    const byStatus = new Map<string, number>();
    for (const s of samples) {
      byStatus.set(s.status, (byStatus.get(s.status) ?? 0) + 1);
    }
    return [...byStatus.entries()].map(([key, count]) => ({ key, count }));
  }, [samples]);

  const expsTimeline = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const e of experiments) {
      const month = String(e.createdAt).slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
    }
    return [...byMonth.entries()].sort().map(([date, count]) => ({ date, count }));
  }, [experiments]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight">Lab Management</h1>
        <p className="text-muted-foreground font-mono mt-1 text-sm">Sample inventory and experiment tracking</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-none" />)
        ) : (
          <>
            {[
              ["Total Samples", stats?.totalSamples ?? 0],
              ["Active Samples", stats?.activeSamples ?? 0],
              ["Total Experiments", stats?.totalExperiments ?? 0],
              ["Running", stats?.runningExperiments ?? 0],
            ].map(([label, value]) => (
              <Card key={String(label)} className="rounded-none border-border bg-card">
                <CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">{label}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold font-mono">{value}</p></CardContent>
              </Card>
            ))}
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Samples by Status" subtitle="click to filter">
          <CountPieChart
            data={sampleStatusChart}
            selected={sampleStatus || undefined}
            onSelect={(k) => setSampleStatus(sampleStatus === k ? "" : k)}
          />
        </ChartCard>
        <ChartCard title="Experiments by Type" subtitle="click to filter tab view">
          <CountBarChart data={expTypeChart} layout="horizontal" />
        </ChartCard>
        <ChartCard title="Experiments by Status" subtitle="click to filter">
          <CountPieChart
            data={expStatusChart}
            selected={expStatus || undefined}
            onSelect={(k) => { setExpStatus(expStatus === k ? "" : k); setActiveTab("experiments"); }}
          />
        </ChartCard>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Concentration Histogram" subtitle="samples with measured conc.">
          <HistogramChart data={concHistogram} />
        </ChartCard>
        <ChartCard title="Volume Histogram" subtitle="uL">
          <HistogramChart data={volumeHistogram} />
        </ChartCard>
        <ChartCard title="Organisms" subtitle="sample counts">
          <CountBarChart data={organismChart} layout="horizontal" maxBars={6} />
        </ChartCard>
      </div>
      {expsTimeline.length > 1 && (
        <ChartCard title="Experiments Over Time" subtitle="per month">
          <TimelineChart data={expsTimeline} xKey="date" />
        </ChartCard>
      )}

      <div className="flex border-b border-border">
        {(["samples", "experiments"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-2 text-xs uppercase font-mono transition-colors ${activeTab === tab ? "border-b-2 border-white text-white" : "text-muted-foreground hover:text-white"}`}
            data-testid={`tab-${tab}`}
          >
            {tab} ({tab === "samples" ? (samplesData?.total ?? 0) : (expsData?.total ?? 0)})
          </button>
        ))}
      </div>

      {activeTab === "samples" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Input
              placeholder="Search name / barcode / organism..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="rounded-none font-mono text-xs bg-black border-border w-56"
            />
            <select
              value={sampleType}
              onChange={(e) => setSampleType(e.target.value)}
              className="bg-black border border-border text-white text-xs font-mono p-2"
              data-testid="sample-type-filter"
            >
              <option value="">All Types</option>
              {SAMPLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={sampleStatus}
              onChange={(e) => setSampleStatus(e.target.value)}
              className="bg-black border border-border text-white text-xs font-mono p-2"
              data-testid="sample-status-filter"
            >
              <option value="">All Statuses</option>
              {["active", "depleted", "degraded", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Button
              onClick={() => setShowSampleForm(!showSampleForm)}
              className="rounded-none uppercase text-xs ml-auto"
              data-testid="add-sample-btn"
            >
              {showSampleForm ? "Cancel" : "+ Add Sample"}
            </Button>
          </div>

          {showSampleForm && (
            <Card className="rounded-none border-border bg-card">
              <CardHeader><CardTitle className="text-sm uppercase">New Sample</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Input placeholder="Sample name *" value={sampleForm.name} onChange={(e) => setSampleForm({ ...sampleForm, name: e.target.value })} className="rounded-none font-mono text-sm bg-black border-border" data-testid="sample-name-input" />
                <select value={sampleForm.type} onChange={(e) => setSampleForm({ ...sampleForm, type: e.target.value })} className="bg-black border border-border text-white text-sm font-mono p-2">
                  {SAMPLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <Input placeholder="Concentration" value={sampleForm.concentration} onChange={(e) => setSampleForm({ ...sampleForm, concentration: e.target.value })} className="rounded-none font-mono text-sm bg-black border-border" type="number" />
                <Input placeholder="Unit (ng/uL)" value={sampleForm.unit} onChange={(e) => setSampleForm({ ...sampleForm, unit: e.target.value })} className="rounded-none font-mono text-sm bg-black border-border" />
                <Input placeholder="Volume (uL)" value={sampleForm.volume} onChange={(e) => setSampleForm({ ...sampleForm, volume: e.target.value })} className="rounded-none font-mono text-sm bg-black border-border" type="number" />
                <Input placeholder="Organism" value={sampleForm.organism} onChange={(e) => setSampleForm({ ...sampleForm, organism: e.target.value })} className="rounded-none font-mono text-sm bg-black border-border" />
                <Input placeholder="Tissue" value={sampleForm.tissue} onChange={(e) => setSampleForm({ ...sampleForm, tissue: e.target.value })} className="rounded-none font-mono text-sm bg-black border-border" />
                <Button onClick={handleCreateSample} disabled={!sampleForm.name || createSampleMutation.isPending} className="rounded-none uppercase text-xs col-span-2 md:col-span-1" data-testid="save-sample-btn">
                  {createSampleMutation.isPending ? "Saving..." : "Save Sample"}
                </Button>
              </CardContent>
            </Card>
          )}

          {samplesLoading ? <Skeleton className="h-48 rounded-none" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase">
                    <th className="text-left py-2 pr-4">Name</th>
                    <th className="text-left py-2 pr-4">Type</th>
                    <th className="text-left py-2 pr-4">Conc.</th>
                    <th className="text-left py-2 pr-4">Volume</th>
                    <th className="text-left py-2 pr-4">Organism</th>
                    <th className="text-left py-2 pr-4">Tissue</th>
                    <th className="text-left py-2 pr-4">Barcode</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-left py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {samples.length === 0 && (
                    <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No samples. Add one to get started.</td></tr>
                  )}
                  {samples.map((s) => (
                    <tr key={s.id} className="border-b border-border hover:bg-white/5">
                      <td className="py-2 pr-4 font-bold">{s.name}</td>
                      <td className="py-2 pr-4">{s.type}</td>
                      <td className="py-2 pr-4">{s.concentration != null ? `${s.concentration} ${s.unit ?? ""}` : "-"}</td>
                      <td className="py-2 pr-4">{s.volume != null ? `${s.volume} uL` : "-"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{s.organism ?? "-"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{s.tissue ?? "-"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{s.barcode ?? "-"}</td>
                      <td className="py-2 pr-4">
                        <select
                          value={s.status}
                          onChange={(ev) => handleUpdateSampleStatus(s.id, ev.target.value)}
                          className="bg-black border border-border text-white text-xs font-mono p-1"
                        >
                          {["active", "depleted", "degraded", "archived"].map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                      </td>
                      <td className="py-2 pr-4">
                        <button onClick={() => handleDeleteSample(s.id)} className="text-muted-foreground hover:text-white transition-colors text-xs" data-testid="delete-sample-btn">
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "experiments" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={expStatus}
              onChange={(e) => setExpStatus(e.target.value)}
              className="bg-black border border-border text-white text-xs font-mono p-2"
              data-testid="exp-status-filter"
            >
              <option value="">All Statuses</option>
              {["planned", "running", "completed", "failed"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Button onClick={() => setShowExpForm(!showExpForm)} className="rounded-none uppercase text-xs ml-auto" data-testid="add-exp-btn">
              {showExpForm ? "Cancel" : "+ New Experiment"}
            </Button>
          </div>

          {showExpForm && (
            <Card className="rounded-none border-border bg-card">
              <CardHeader><CardTitle className="text-sm uppercase">New Experiment</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Input placeholder="Experiment name *" value={expForm.name} onChange={(e) => setExpForm({ ...expForm, name: e.target.value })} className="rounded-none font-mono text-sm bg-black border-border" data-testid="exp-name-input" />
                <select value={expForm.type} onChange={(e) => setExpForm({ ...expForm, type: e.target.value })} className="bg-black border border-border text-white text-sm font-mono p-2">
                  {EXP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <Input placeholder="Protocol" value={expForm.protocol} onChange={(e) => setExpForm({ ...expForm, protocol: e.target.value })} className="rounded-none font-mono text-sm bg-black border-border" />
                <Input placeholder="Notes" value={expForm.notes} onChange={(e) => setExpForm({ ...expForm, notes: e.target.value })} className="rounded-none font-mono text-sm bg-black border-border col-span-2" />
                <Button onClick={handleCreateExp} disabled={!expForm.name || createExpMutation.isPending} className="rounded-none uppercase text-xs" data-testid="save-exp-btn">
                  {createExpMutation.isPending ? "Saving..." : "Save Experiment"}
                </Button>
              </CardContent>
            </Card>
          )}

          {expsLoading ? <Skeleton className="h-48 rounded-none" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase">
                    <th className="text-left py-2 pr-4">Name</th>
                    <th className="text-left py-2 pr-4">Type</th>
                    <th className="text-left py-2 pr-4">Protocol</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-left py-2 pr-4">Set Status</th>
                  </tr>
                </thead>
                <tbody>
                  {experiments.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No experiments. Create one to get started.</td></tr>
                  )}
                  {experiments.map((e) => (
                    <tr key={e.id} className="border-b border-border hover:bg-white/5">
                      <td className="py-2 pr-4 font-bold">{e.name}</td>
                      <td className="py-2 pr-4">{e.type}</td>
                      <td className="py-2 pr-4 text-muted-foreground max-w-[200px] truncate">{e.protocol ?? "-"}</td>
                      <td className="py-2 pr-4">
                        <Badge className={`rounded-none text-xs ${STATUS_COLORS[e.status] ?? "bg-white/10 text-white"}`}>{e.status}</Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <select
                          value={e.status}
                          onChange={(ev) => handleUpdateExpStatus(e.id, ev.target.value)}
                          className="bg-black border border-border text-white text-xs font-mono p-1"
                          data-testid="exp-status-select"
                        >
                          {["planned", "running", "completed", "failed"].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
