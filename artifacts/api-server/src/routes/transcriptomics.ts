import { Router } from "express";
import { db } from "@workspace/db";
import { transcriptomicsJobsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

const GTEX_TISSUES = [
  { id: "Adipose_Subcutaneous", name: "Adipose - Subcutaneous", sampleCount: 581 },
  { id: "Adipose_Visceral_Omentum", name: "Adipose - Visceral (Omentum)", sampleCount: 469 },
  { id: "Adrenal_Gland", name: "Adrenal Gland", sampleCount: 233 },
  { id: "Artery_Aorta", name: "Artery - Aorta", sampleCount: 387 },
  { id: "Artery_Coronary", name: "Artery - Coronary", sampleCount: 213 },
  { id: "Artery_Tibial", name: "Artery - Tibial", sampleCount: 584 },
  { id: "Brain_Amygdala", name: "Brain - Amygdala", sampleCount: 129 },
  { id: "Brain_Caudate_basal_ganglia", name: "Brain - Caudate (basal ganglia)", sampleCount: 194 },
  { id: "Brain_Cerebellum", name: "Brain - Cerebellum", sampleCount: 209 },
  { id: "Brain_Cortex", name: "Brain - Cortex", sampleCount: 205 },
  { id: "Brain_Frontal_Cortex_BA9", name: "Brain - Frontal Cortex (BA9)", sampleCount: 175 },
  { id: "Brain_Hippocampus", name: "Brain - Hippocampus", sampleCount: 165 },
  { id: "Brain_Hypothalamus", name: "Brain - Hypothalamus", sampleCount: 170 },
  { id: "Breast_Mammary_Tissue", name: "Breast - Mammary Tissue", sampleCount: 396 },
  { id: "Cells_Cultured_fibroblasts", name: "Cells - Cultured fibroblasts", sampleCount: 483 },
  { id: "Colon_Sigmoid", name: "Colon - Sigmoid", sampleCount: 318 },
  { id: "Colon_Transverse", name: "Colon - Transverse", sampleCount: 368 },
  { id: "Esophagus_Mucosa", name: "Esophagus - Mucosa", sampleCount: 497 },
  { id: "Heart_Left_Ventricle", name: "Heart - Left Ventricle", sampleCount: 386 },
  { id: "Kidney_Cortex", name: "Kidney - Cortex", sampleCount: 73 },
  { id: "Liver", name: "Liver", sampleCount: 208 },
  { id: "Lung", name: "Lung", sampleCount: 578 },
  { id: "Muscle_Skeletal", name: "Muscle - Skeletal", sampleCount: 706 },
  { id: "Nerve_Tibial", name: "Nerve - Tibial", sampleCount: 532 },
  { id: "Ovary", name: "Ovary", sampleCount: 167 },
  { id: "Pancreas", name: "Pancreas", sampleCount: 305 },
  { id: "Prostate", name: "Prostate", sampleCount: 221 },
  { id: "Skin_Not_Sun_Exposed_Suprapubic", name: "Skin - Not Sun Exposed (Suprapubic)", sampleCount: 517 },
  { id: "Skin_Sun_Exposed_Lower_leg", name: "Skin - Sun Exposed (Lower leg)", sampleCount: 605 },
  { id: "Small_Intestine_Terminal_Ileum", name: "Small Intestine - Terminal Ileum", sampleCount: 174 },
  { id: "Spleen", name: "Spleen", sampleCount: 227 },
  { id: "Stomach", name: "Stomach", sampleCount: 324 },
  { id: "Testis", name: "Testis", sampleCount: 259 },
  { id: "Thyroid", name: "Thyroid", sampleCount: 574 },
  { id: "Uterus", name: "Uterus", sampleCount: 129 },
  { id: "Vagina", name: "Vagina", sampleCount: 141 },
  { id: "Whole_Blood", name: "Whole Blood", sampleCount: 755 },
];

router.get("/transcriptomics/tissues", (_req, res) => {
  res.json({ tissues: GTEX_TISSUES });
});

router.get("/transcriptomics/expression/search", async (req, res) => {
  const { gene, tissue } = req.query as Record<string, string>;
  if (!gene) { res.status(400).json({ error: "gene is required" }); return; }

  try {
    const url = `https://gtexportal.org/api/v2/expression/medianGeneExpression?geneId=${encodeURIComponent(gene)}&datasetId=gtex_v8&format=json`;
    const gtexRes = await fetch(url, { signal: AbortSignal.timeout(12000) });

    if (!gtexRes.ok) {
      const ensemblUrl = `https://rest.ensembl.org/xrefs/symbol/homo_sapiens/${encodeURIComponent(gene)}?content-type=application/json`;
      const ensRes = await fetch(ensemblUrl, { signal: AbortSignal.timeout(8000) });
      if (!ensRes.ok) { res.json({ gene, expressions: [], tissues: [] }); return; }
      const refs = await ensRes.json() as Array<{ id: string; type: string }>;
      const geneRef = refs.find((r) => r.type === "gene");
      if (!geneRef) { res.json({ gene, expressions: [], tissues: [] }); return; }

      const ensemblId = geneRef.id;
      const gtexUrl2 = `https://gtexportal.org/api/v2/expression/medianGeneExpression?geneId=${ensemblId}&datasetId=gtex_v8&format=json`;
      const gtexRes2 = await fetch(gtexUrl2, { signal: AbortSignal.timeout(12000) });
      if (!gtexRes2.ok) { res.json({ gene, expressions: [], tissues: [], maxTpm: 0 }); return; }

      const gtexData = await gtexRes2.json() as {
        data: Array<{ tissueSiteDetailId: string; geneSymbol: string; gencodeId: string; median: number; unit: string }>;
      };
      processGtexData(gtexData, gene, tissue, res);
      return;
    }

    const gtexData = await gtexRes.json() as {
      data: Array<{ tissueSiteDetailId: string; geneSymbol: string; gencodeId: string; median: number; unit: string }>;
    };
    processGtexData(gtexData, gene, tissue, res);
  } catch {
    res.status(502).json({ error: "Failed to reach GTEx" });
  }
});

function processGtexData(
  gtexData: { data: Array<{ tissueSiteDetailId: string; geneSymbol: string; gencodeId: string; median: number; unit: string }> },
  gene: string,
  tissue: string | undefined,
  res: import("express").Response
) {
  let expressions = (gtexData.data ?? []).map((d) => ({
    geneId: d.gencodeId ?? gene,
    geneName: d.geneSymbol ?? gene,
    tissue: d.tissueSiteDetailId ?? "",
    tpm: d.median ?? 0,
    median: d.median ?? 0,
    unit: d.unit ?? "TPM",
  }));

  if (tissue) {
    expressions = expressions.filter((e) => e.tissue.toLowerCase().includes(tissue.toLowerCase()));
  }

  const tissues = [...new Set(expressions.map((e) => e.tissue))];
  const maxTpm = expressions.reduce((m, e) => Math.max(m, e.tpm), 0);
  res.json({ gene, expressions, tissues, maxTpm });
}

router.get("/transcriptomics/jobs", async (_req, res) => {
  const jobs = await db.select().from(transcriptomicsJobsTable).orderBy(desc(transcriptomicsJobsTable.createdAt)).limit(50);
  res.json({ jobs });
});

router.post("/transcriptomics/jobs", async (req, res) => {
  const { name, sampleType, pairedEnd = false, referenceGenome = "GRCh38" } = req.body as {
    name: string; sampleType: string; pairedEnd?: boolean; referenceGenome?: string;
  };
  if (!name || !sampleType) {
    res.status(400).json({ error: "name and sampleType are required" });
    return;
  }
  const id = randomUUID();
  await db.insert(transcriptomicsJobsTable).values({
    id, name, sampleType, status: "pending",
    referenceGenome, pairedEnd: String(pairedEnd),
  });
  const [job] = await db.select().from(transcriptomicsJobsTable).where(
    (await import("drizzle-orm")).eq(transcriptomicsJobsTable.id, id)
  ).limit(1);
  res.status(201).json(job);
});

export default router;
