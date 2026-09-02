import { Router } from "express";
import { db } from "@workspace/db";
import { samplesTable, experimentsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

router.get("/lims/samples", async (req, res) => {
  const { type, status, limit = "50" } = req.query as Record<string, string>;
  let query = db.select().from(samplesTable).$dynamic();
  const conditions = [];
  if (type) conditions.push(eq(samplesTable.type, type));
  if (status) conditions.push(eq(samplesTable.status, status));
  if (conditions.length) {
    const { and } = await import("drizzle-orm");
    query = query.where(and(...conditions));
  }
  const samples = await query.orderBy(desc(samplesTable.createdAt)).limit(parseInt(limit));
  const total = await db.select({ count: sql<number>`count(*)` }).from(samplesTable);
  res.json({ samples, total: Number(total[0]?.count ?? 0) });
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
  const id = randomUUID();
  await db.insert(samplesTable).values({
    id,
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
  });
  const [sample] = await db.select().from(samplesTable).where(eq(samplesTable.id, id)).limit(1);
  res.status(201).json(sample);
});

router.get("/lims/samples/:sampleId", async (req, res) => {
  const [sample] = await db.select().from(samplesTable).where(eq(samplesTable.id, req.params.sampleId)).limit(1);
  if (!sample) { res.status(404).json({ error: "Sample not found" }); return; }
  res.json(sample);
});

router.patch("/lims/samples/:sampleId", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const allowed = ["name", "status", "concentration", "volume", "storageLocation", "notes"];
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  await db.update(samplesTable).set(update as unknown as (typeof samplesTable)["$inferInsert"]).where(eq(samplesTable.id, req.params.sampleId));
  const [sample] = await db.select().from(samplesTable).where(eq(samplesTable.id, req.params.sampleId)).limit(1);
  if (!sample) { res.status(404).json({ error: "Sample not found" }); return; }
  res.json(sample);
});

router.delete("/lims/samples/:sampleId", async (req, res) => {
  await db.delete(samplesTable).where(eq(samplesTable.id, req.params.sampleId));
  res.status(204).send();
});

router.get("/lims/experiments", async (req, res) => {
  const { status, limit = "50" } = req.query as Record<string, string>;
  let query = db.select().from(experimentsTable).$dynamic();
  if (status) query = query.where(eq(experimentsTable.status, status));
  const experiments = await query.orderBy(desc(experimentsTable.createdAt)).limit(parseInt(limit));
  const total = await db.select({ count: sql<number>`count(*)` }).from(experimentsTable);
  res.json({ experiments, total: Number(total[0]?.count ?? 0) });
});

router.post("/lims/experiments", async (req, res) => {
  const body = req.body as { name: string; type: string; sampleIds?: string[]; protocol?: string; notes?: string };
  if (!body.name || !body.type) {
    res.status(400).json({ error: "name and type are required" });
    return;
  }
  const id = randomUUID();
  await db.insert(experimentsTable).values({
    id,
    name: body.name,
    type: body.type,
    status: "planned",
    sampleIds: body.sampleIds ?? [],
    protocol: body.protocol ?? null,
    notes: body.notes ?? null,
  });
  const [exp] = await db.select().from(experimentsTable).where(eq(experimentsTable.id, id)).limit(1);
  res.status(201).json(exp);
});

router.get("/lims/experiments/:experimentId", async (req, res) => {
  const [exp] = await db.select().from(experimentsTable).where(eq(experimentsTable.id, req.params.experimentId)).limit(1);
  if (!exp) { res.status(404).json({ error: "Experiment not found" }); return; }
  res.json(exp);
});

router.patch("/lims/experiments/:experimentId", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const allowed = ["name", "status", "protocol", "notes", "completedAt"];
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (key in body) {
      if (key === "completedAt" && body[key]) update[key] = new Date(body[key] as string);
      else update[key] = body[key];
    }
  }
  if (body.status === "running" && !update.startedAt) {
    const [existing] = await db.select().from(experimentsTable).where(eq(experimentsTable.id, req.params.experimentId)).limit(1);
    if (existing && !existing.startedAt) update.startedAt = new Date();
  }
  await db.update(experimentsTable).set(update as unknown as (typeof experimentsTable)["$inferInsert"]).where(eq(experimentsTable.id, req.params.experimentId));
  const [exp] = await db.select().from(experimentsTable).where(eq(experimentsTable.id, req.params.experimentId)).limit(1);
  if (!exp) { res.status(404).json({ error: "Experiment not found" }); return; }
  res.json(exp);
});

router.get("/lims/stats", async (_req, res) => {
  const [totalSamples, activeSamples, totalExps, runningExps, samplesByType, expsByStatus] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(samplesTable),
    db.select({ count: sql<number>`count(*)` }).from(samplesTable).where(eq(samplesTable.status, "active")),
    db.select({ count: sql<number>`count(*)` }).from(experimentsTable),
    db.select({ count: sql<number>`count(*)` }).from(experimentsTable).where(eq(experimentsTable.status, "running")),
    db.select({ type: samplesTable.type, count: sql<number>`count(*)` }).from(samplesTable).groupBy(samplesTable.type),
    db.select({ status: experimentsTable.status, count: sql<number>`count(*)` }).from(experimentsTable).groupBy(experimentsTable.status),
  ]);

  const recentSamples = await db.select().from(samplesTable).orderBy(desc(samplesTable.createdAt)).limit(3);
  const recentExps = await db.select().from(experimentsTable).orderBy(desc(experimentsTable.createdAt)).limit(3);

  const recentActivity = [
    ...recentSamples.map((s) => ({
      action: "Sample created",
      entityType: "sample",
      entityName: s.name,
      timestamp: s.createdAt.toISOString(),
    })),
    ...recentExps.map((e) => ({
      action: "Experiment created",
      entityType: "experiment",
      entityName: e.name,
      timestamp: e.createdAt.toISOString(),
    })),
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 5);

  res.json({
    totalSamples: Number(totalSamples[0]?.count ?? 0),
    activeSamples: Number(activeSamples[0]?.count ?? 0),
    totalExperiments: Number(totalExps[0]?.count ?? 0),
    runningExperiments: Number(runningExps[0]?.count ?? 0),
    samplesByType: samplesByType.map((r) => ({ type: r.type, count: Number(r.count) })),
    experimentsByStatus: expsByStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
    recentActivity,
  });
});

export default router;
