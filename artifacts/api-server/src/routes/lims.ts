import { Router } from "express";
import { randomUUID } from "crypto";
import store from "../data";

const router = Router();

router.get("/lims/samples", async (req, res) => {
  const { type, status, limit = "50" } = req.query as Record<string, string>;
  let samples = store.samples.all();
  if (type) samples = samples.filter((s) => s.type === type);
  if (status) samples = samples.filter((s) => s.status === status);
  samples.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const total = samples.length;
  res.json({ samples: samples.slice(0, parseInt(limit || "50")), total });
});

router.post("/lims/samples", async (req, res) => {
  const body = req.body as {
    name: string; type: string; concentration?: number; unit?: string;
    volume?: number; organism?: string; tissue?: string;
    storageLocation?: string; notes?: string;
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
  } as never;
  store.samples.insert(sample);
  res.status(201).json(sample);
});

router.get("/lims/samples/:sampleId", async (req, res) => {
  const sample = store.samples.find(req.params.sampleId);
  if (!sample) { res.status(404).json({ error: "Sample not found" }); return; }
  res.json(sample);
});

router.patch("/lims/samples/:sampleId", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const allowed = ["name", "status", "concentration", "volume", "storageLocation", "notes"];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  const sample = store.samples.update(req.params.sampleId, patch as never);
  if (!sample) { res.status(404).json({ error: "Sample not found" }); return; }
  res.json(sample);
});

router.delete("/lims/samples/:sampleId", async (req, res) => {
  store.samples.remove(req.params.sampleId);
  res.status(204).send();
});

router.get("/lims/experiments", async (req, res) => {
  const { status, limit = "50" } = req.query as Record<string, string>;
  let experiments = store.experiments.all();
  if (status) experiments = experiments.filter((e) => e.status === status);
  experiments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const total = experiments.length;
  res.json({ experiments: experiments.slice(0, parseInt(limit || "50")), total });
});

router.post("/lims/experiments", async (req, res) => {
  const body = req.body as { name: string; type: string; sampleIds?: string[]; protocol?: string; notes?: string };
  if (!body.name || !body.type) {
    res.status(400).json({ error: "name and type are required" });
    return;
  }
  const experiments = {
    id: randomUUID(),
    name: body.name,
    type: body.type,
    status: "planned",
    sampleIds: body.sampleIds ?? [],
    protocol: body.protocol ?? null,
    notes: body.notes ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never;
  store.experiments.insert(experiments);
  res.status(201).json(experiments);
});

router.get("/lims/experiments/:experimentId", async (req, res) => {
  const experiments = store.experiments.find(req.params.experimentId);
  if (!experiments) { res.status(404).json({ error: "Experiment not found" }); return; }
  res.json(experiments);
});

router.patch("/lims/experiments/:experimentId", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const allowed = ["name", "status", "protocol", "notes", "completedAt"];
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
  if (!exp) { res.status(404).json({ error: "Experiment not found" }); return; }
  res.json(exp);
});

router.get("/lims/stats", async (_req, res) => {
  const samples = store.samples.all();
  const exps = store.experiments.all();
  const samplesByType = store.samples.countBy("type").map((r) => ({ type: r.key, count: r.count }));
  const expsByStatus = store.experiments.countBy("status").map((r) => ({ status: r.key, count: r.count }));

  const recentSamples = [...samples]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3);
  const recentExps = [...exps]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3);

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
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 5);

  res.json({
    totalSamples: samples.length,
    activeSamples: samples.filter((s) => s.status === "active").length,
    totalExperiments: exps.length,
    runningExperiments: exps.filter((e) => e.status === "running").length,
    samplesByType,
    experimentsByStatus: expsByStatus,
    recentActivity,
  });
});

export default router;