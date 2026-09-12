import { Router } from "express";
import { randomUUID } from "crypto";
import store from "../data";
import { reindex } from "../lib/search-index";

const router = Router();

router.get("/lims/samples", (req, res) => {
  const { type, status, limit = "50", offset = "0", q } = req.query as Record<string, string>;
  let samples = store.samples.all();
  if (type) samples = samples.filter((s) => (s.type as string).toLowerCase() === type.toLowerCase());
  if (status) samples = samples.filter((s) => (s.status as string).toLowerCase() === status.toLowerCase());
  if (q) {
    const needle = q.toLowerCase();
    samples = samples.filter(
      (s) =>
        String(s.name).toLowerCase().includes(needle) ||
        String(s.barcode ?? "").toLowerCase().includes(needle) ||
        String(s.tissue ?? "").toLowerCase().includes(needle) ||
        String(s.organism ?? "").toLowerCase().includes(needle),
    );
  }
  samples = [...samples].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const total = samples.length;
  const off = parseInt(offset, 10) || 0;
  const lim = parseInt(limit, 10) || 50;
  res.json({ samples: samples.slice(off, off + lim), total });
});

router.post("/lims/samples", (req, res) => {
  const body = req.body as {
    name?: string;
    type?: string;
    concentration?: number;
    unit?: string;
    volume?: number;
    organism?: string;
    tissue?: string;
    storageLocation?: string;
    notes?: string;
  };
  if (!body.name || !body.type) {
    res.status(400).json({ error: "name and type are required" });
    return;
  }
  const sample = {
    id: randomUUID(),
    name: body.name,
    type: body.type,
    status: "active",
    concentration: body.concentration ?? null,
    unit: body.unit ?? null,
    volume: body.volume ?? null,
    organism: body.organism ?? null,
    tissue: body.tissue ?? null,
    storageLocation: body.storageLocation ?? null,
    barcode: `BF-${Date.now().toString(36).toUpperCase()}`,
    notes: body.notes ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.samples.insert(sample as never);
  reindex();
  res.status(201).json(sample);
});

router.get("/lims/samples/:sampleId", (req, res) => {
  const sample = store.samples.find(req.params.sampleId);
  if (!sample) {
    res.status(404).json({ error: "Sample not found" });
    return;
  }
  res.json(sample);
});

router.patch("/lims/samples/:sampleId", (req, res) => {
  const body = req.body as Record<string, unknown>;
  const allowed = ["name", "status", "concentration", "unit", "volume", "organism", "tissue", "storageLocation", "notes"];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  const sample = store.samples.update(req.params.sampleId, patch as never);
  if (!sample) {
    res.status(404).json({ error: "Sample not found" });
    return;
  }
  reindex();
  res.json(sample);
});

router.delete("/lims/samples/:sampleId", (req, res) => {
  const removed = store.samples.remove(req.params.sampleId);
  if (removed) reindex();
  res.status(removed ? 204 : 404).send();
});

router.get("/lims/experiments", (req, res) => {
  const { status, type, limit = "50", offset = "0", q } = req.query as Record<string, string>;
  let experiments = store.experiments.all();
  if (status) experiments = experiments.filter((e) => (e.status as string).toLowerCase() === status.toLowerCase());
  if (type) experiments = experiments.filter((e) => (e.type as string).toLowerCase() === type.toLowerCase());
  if (q) {
    const needle = q.toLowerCase();
    experiments = experiments.filter(
      (e) =>
        String(e.name).toLowerCase().includes(needle) ||
        String(e.protocol ?? "").toLowerCase().includes(needle) ||
        String(e.notes ?? "").toLowerCase().includes(needle),
    );
  }
  experiments = [...experiments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const total = experiments.length;
  const off = parseInt(offset, 10) || 0;
  const lim = parseInt(limit, 10) || 50;
  res.json({ experiments: experiments.slice(off, off + lim), total });
});

router.post("/lims/experiments", (req, res) => {
  const body = req.body as { name?: string; type?: string; sampleIds?: string[]; protocol?: string; notes?: string };
  if (!body.name || !body.type) {
    res.status(400).json({ error: "name and type are required" });
    return;
  }
  const experiment = {
    id: randomUUID(),
    name: body.name,
    type: body.type,
    status: "planned",
    sampleIds: body.sampleIds ?? [],
    protocol: body.protocol ?? null,
    notes: body.notes ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.experiments.insert(experiment as never);
  reindex();
  res.status(201).json(experiment);
});

router.get("/lims/experiments/:experimentId", (req, res) => {
  const experiment = store.experiments.find(req.params.experimentId);
  if (!experiment) {
    res.status(404).json({ error: "Experiment not found" });
    return;
  }
  res.json(experiment);
});

router.patch("/lims/experiments/:experimentId", (req, res) => {
  const body = req.body as Record<string, unknown>;
  const allowed = ["name", "type", "status", "protocol", "notes", "completedAt"];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      if (key === "completedAt" && body[key]) patch[key] = new Date(body[key] as string);
      else patch[key] = body[key];
    }
  }
  if (body.status === "running") {
    const existing = store.experiments.find(req.params.experimentId);
    if (existing && !existing.startedAt) patch.startedAt = new Date();
  }
  const exp = store.experiments.update(req.params.experimentId, patch as never);
  if (!exp) {
    res.status(404).json({ error: "Experiment not found" });
    return;
  }
  reindex();
  res.json(exp);
});

router.get("/lims/stats", (_req, res) => {
  const samples = store.samples.all();
  const exps = store.experiments.all();
  const samplesByType = store.samples.countBy("type");
  const samplesByStatus = store.samples.countBy("status");
  const expsByStatus = store.experiments.countBy("status");
  const expsByType = store.experiments.countBy("type");

  // Volume + concentration distributions for charts.
  const concBuckets = [0, 0, 0, 0, 0]; // <10, <30, <60, <100, >=100
  const volBuckets = [0, 0, 0, 0]; // <50, <150, <300, >=300
  for (const s of samples) {
    const c = Number(s.concentration ?? 0);
    const v = Number(s.volume ?? 0);
    concBuckets[c < 10 ? 0 : c < 30 ? 1 : c < 60 ? 2 : c < 100 ? 3 : 4]++;
    volBuckets[v < 50 ? 0 : v < 150 ? 1 : v < 300 ? 2 : 3]++;
  }

  // Samples created per month (timeline).
  const byMonth = new Map<string, number>();
  for (const s of samples) {
    const d = new Date(s.createdAt);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }
  const creationTimeline = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([month, count]) => ({ month, count }));

  const recentSamples = [...samples]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);
  const recentExps = [...exps]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  const recentActivity = [
    ...recentSamples.map((s) => ({
      action: "Sample created",
      entityType: "sample",
      entityName: s.name,
      timestamp: new Date(s.createdAt).toISOString(),
    })),
    ...recentExps.map((e) => ({
      action: "Experiment created",
      entityType: "experiment",
      entityName: e.name,
      timestamp: new Date(e.createdAt).toISOString(),
    })),
  ]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 5);

  res.json({
    totalSamples: samples.length,
    activeSamples: samples.filter((s) => s.status === "active").length,
    totalExperiments: exps.length,
    runningExperiments: exps.filter((e) => e.status === "running").length,
    samplesByType,
    samplesByStatus,
    experimentsByStatus: expsByStatus,
    experimentsByType: expsByType,
    concentrationHistogram: [
      { bucket: "<10", count: concBuckets[0] },
      { bucket: "10–29", count: concBuckets[1] },
      { bucket: "30–59", count: concBuckets[2] },
      { bucket: "60–99", count: concBuckets[3] },
      { bucket: "100+", count: concBuckets[4] },
    ],
    volumeHistogram: [
      { bucket: "<50", count: volBuckets[0] },
      { bucket: "50–149", count: volBuckets[1] },
      { bucket: "150–299", count: volBuckets[2] },
      { bucket: "300+", count: volBuckets[3] },
    ],
    creationTimeline,
    recentActivity,
  });
});

export default router;
