import { Router } from "express";
import { db } from "@workspace/db";
import { genomicsJobsTable, variantsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

function parseVcf(content: string, jobId: string): Array<Record<string, unknown>> {
  const lines = content.split("\n");
  const variants: Array<Record<string, unknown>> = [];
  for (const line of lines) {
    if (line.startsWith("#") || !line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 5) continue;
    const [chrom, pos, id, ref, alt, qual, filter, info] = parts;
    const rsId = id && id !== "." ? id : undefined;
    let af: number | undefined;
    if (info) {
      const afMatch = info.match(/AF=([0-9.eE+-]+)/);
      if (afMatch) af = parseFloat(afMatch[1]);
    }
    variants.push({
      id: randomUUID(),
      jobId,
      chromosome: chrom?.replace("chr", "") ?? "",
      position: parseInt(pos ?? "0"),
      ref: ref ?? "",
      alt: alt ?? "",
      quality: qual && qual !== "." ? parseFloat(qual) : null,
      filter: filter && filter !== "." ? filter : "PASS",
      rsId: rsId ?? null,
      alleleFrequency: af ?? null,
    });
  }
  return variants;
}

async function annotateWithEnsembl(chromosome: string, position: number, ref: string, alt: string) {
  try {
    const region = `${chromosome}:${position}-${position}`;
    const hgvs = `${chromosome}:g.${position}${ref}>${alt}`;
    const url = `https://rest.ensembl.org/vep/human/hgvs/${encodeURIComponent(hgvs)}?content-type=application/json&hgvs=1&canonical=1&pick=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json() as Array<Record<string, unknown>>;
    if (!data?.length) return null;
    const top = data[0] as Record<string, unknown>;
    const tc = (top.transcript_consequences as Array<Record<string, unknown>> | undefined)?.[0];
    return {
      gene: tc?.gene_symbol as string ?? null,
      consequence: ((tc?.consequence_terms as string[]) ?? [])[0] ?? null,
    };
  } catch {
    return null;
  }
}

async function annotateWithClinVar(rsId: string) {
  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=${encodeURIComponent(rsId)}&retmode=json&retmax=1`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(6000) });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json() as Record<string, unknown>;
    const ids = (searchData as { esearchresult?: { idlist?: string[] } }).esearchresult?.idlist ?? [];
    if (!ids.length) return null;
    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=clinvar&id=${ids[0]}&retmode=json`;
    const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(6000) });
    if (!summaryRes.ok) return null;
    const summaryData = await summaryRes.json() as Record<string, unknown>;
    const result = (summaryData as Record<string, Record<string, Record<string, unknown>>>).result?.[ids[0] as string];
    if (!result) return null;
    const sig = (result.clinical_significance as Record<string, unknown> | undefined)?.description as string ?? null;
    return { significance: sig };
  } catch {
    return null;
  }
}

router.post("/genomics/variants/upload", async (req, res) => {
  const { filename, content } = req.body as { filename: string; content: string };
  if (!filename || !content) {
    res.status(400).json({ error: "filename and content are required" });
    return;
  }
  const jobId = randomUUID();
  await db.insert(genomicsJobsTable).values({ id: jobId, filename, status: "processing" });

  const rawVariants = parseVcf(content, jobId);

  const annotated = await Promise.all(rawVariants.slice(0, 100).map(async (v) => {
    const ensembl = await annotateWithEnsembl(
      v.chromosome as string, v.position as number, v.ref as string, v.alt as string
    );
    let significance: string | null = null;
    if (v.rsId) {
      const clinvar = await annotateWithClinVar(v.rsId as string);
      significance = clinvar?.significance ?? null;
    }
    return { ...v, gene: ensembl?.gene ?? null, consequence: ensembl?.consequence ?? null, significance };
  }));

  if (annotated.length > 0) {
    await db.insert(variantsTable).values(annotated as Parameters<typeof db.insert>[1] extends infer T ? T[] : never[]);
  }

  await db.update(genomicsJobsTable)
    .set({ status: "completed", variantCount: annotated.length, completedAt: new Date() })
    .where(eq(genomicsJobsTable.id, jobId));

  const job = await db.select().from(genomicsJobsTable).where(eq(genomicsJobsTable.id, jobId)).limit(1);
  res.json(job[0]);
});

router.get("/genomics/variants", async (req, res) => {
  const { jobId, chromosome, significance, limit = "50", offset = "0" } = req.query as Record<string, string>;
  let query = db.select().from(variantsTable).$dynamic();
  const conditions = [];
  if (jobId) conditions.push(eq(variantsTable.jobId, jobId));
  if (chromosome) conditions.push(eq(variantsTable.chromosome, chromosome));
  if (significance) conditions.push(eq(variantsTable.significance, significance));
  if (conditions.length) {
    const { and } = await import("drizzle-orm");
    query = query.where(and(...conditions));
  }
  const variants = await query.limit(parseInt(limit)).offset(parseInt(offset)).orderBy(desc(variantsTable.createdAt));
  const total = await db.select({ count: sql<number>`count(*)` }).from(variantsTable);
  res.json({ variants, total: Number(total[0]?.count ?? 0) });
});

router.get("/genomics/variants/:variantId/annotate", async (req, res) => {
  const { variantId } = req.params;
  const [variant] = await db.select().from(variantsTable).where(eq(variantsTable.id, variantId)).limit(1);
  if (!variant) { res.status(404).json({ error: "Variant not found" }); return; }

  const [ensemblAnnotation, clinvarAnnotation] = await Promise.all([
    (async () => {
      try {
        const hgvs = `${variant.chromosome}:g.${variant.position}${variant.ref}>${variant.alt}`;
        const url = `https://rest.ensembl.org/vep/human/hgvs/${encodeURIComponent(hgvs)}?content-type=application/json&hgvs=1&canonical=1&pick=1`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        return r.ok ? r.json() : null;
      } catch { return null; }
    })(),
    (async () => {
      if (!variant.rsId) return null;
      try {
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=${encodeURIComponent(variant.rsId)}&retmode=json&retmax=1`;
        const sr = await fetch(searchUrl, { signal: AbortSignal.timeout(6000) });
        const sd = await sr.json() as Record<string, Record<string, string[]>>;
        const ids = sd.esearchresult?.idlist ?? [];
        if (!ids.length) return null;
        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=clinvar&id=${ids[0]}&retmode=json`;
        const sr2 = await fetch(summaryUrl, { signal: AbortSignal.timeout(6000) });
        return sr2.ok ? sr2.json() : null;
      } catch { return null; }
    })(),
  ]);

  res.json({ variant, ensemblAnnotation, clinvarAnnotation, dbsnpAnnotation: null });
});

router.get("/genomics/stats", async (req, res) => {
  const { jobId } = req.query as Record<string, string>;
  const baseCondition = jobId ? eq(variantsTable.jobId, jobId) : undefined;

  const [totalRes, byChromRes, bySigRes, byConseqRes, recentJobsRes] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(variantsTable).where(baseCondition),
    db.select({ chromosome: variantsTable.chromosome, count: sql<number>`count(*)` })
      .from(variantsTable).where(baseCondition)
      .groupBy(variantsTable.chromosome).orderBy(desc(sql`count(*)`)).limit(25),
    db.select({ significance: variantsTable.significance, count: sql<number>`count(*)` })
      .from(variantsTable).where(baseCondition)
      .groupBy(variantsTable.significance),
    db.select({ consequence: variantsTable.consequence, count: sql<number>`count(*)` })
      .from(variantsTable).where(baseCondition)
      .groupBy(variantsTable.consequence).orderBy(desc(sql`count(*)`)).limit(10),
    db.select({ count: sql<number>`count(*)` }).from(genomicsJobsTable),
  ]);

  res.json({
    totalVariants: Number(totalRes[0]?.count ?? 0),
    byChromosome: byChromRes.map(r => ({ chromosome: r.chromosome, count: Number(r.count) })),
    bySignificance: bySigRes.map(r => ({ significance: r.significance ?? "unknown", count: Number(r.count) })),
    byConsequence: byConseqRes.map(r => ({ consequence: r.consequence ?? "unknown", count: Number(r.count) })),
    recentJobs: Number(recentJobsRes[0]?.count ?? 0),
  });
});

router.get("/genomics/jobs", async (req, res) => {
  const jobs = await db.select().from(genomicsJobsTable).orderBy(desc(genomicsJobsTable.createdAt)).limit(50);
  res.json({ jobs });
});

export default router;
