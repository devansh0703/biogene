import { Router } from "express";
import { randomUUID } from "crypto";
import store from "../data";
import { fetchJson, fetchJsonOrNull } from "../lib/external";
import { reindex } from "../lib/search-index";

const router = Router();

const GTEX_BASE = "https://gtexportal.org/api/v2";

interface GtexGene {
  gencodeId: string;
  geneSymbol: string;
  chromosome: string;
  start: number;
  end: number;
  description?: string;
}
interface GtexMedian {
  median: number;
  tissueSiteDetailId: string;
  ontologyId: string;
  gencodeId: string;
  geneSymbol: string;
  unit: string;
}
interface GtexTissue {
  tissueSiteDetailId: string;
  colorHex?: string;
  eGeneCount?: number;
  expressedGeneCount?: number;
  eqtlSampleSummary?: { totalCount?: number };
  rnaSeqSampleSummary?: { totalCount?: number };
}

/**
 * Resolve a gene symbol or Ensembl ID to GTEx's versioned gencodeId
 * (e.g. BRCA1 -> ENSG00000012048.20). GTEx v2 API requires the version.
 */
async function resolveGencode(gene: string): Promise<GtexGene | null> {
  const q = gene.trim();
  const direct = await fetchJsonOrNull<{ data?: GtexGene[] }>(
    `${GTEX_BASE}/reference/geneSearch?geneId=${encodeURIComponent(q)}&datasetId=gtex_v8&format=json`,
    { timeoutMs: 15000 },
  );
  let hit = direct?.data?.[0];
  if (!hit) {
    const search = await fetchJsonOrNull<{ data?: Array<{ gencodeId: string; geneSymbol: string; chromosome: string; start: number; end: number }> }>(
      `${GTEX_BASE}/dataset/link?geneSymbol=${encodeURIComponent(q)}&datasetId=gtex_v8&format=json`,
      { timeoutMs: 15000 },
    );
    hit = search?.data?.[0];
  }
  return hit ?? null;
}

/** Live tissue list from GTEx with sample counts, colors, gene counts. */
router.get("/transcriptomics/tissues", async (_req, res, next) => {
  try {
    const data = await fetchJson<{ data?: GtexTissue[] }>(
      `${GTEX_BASE}/dataset/tissueSiteDetail?datasetId=gtex_v8&pageSize=250&format=json`,
      { timeoutMs: 20000, retries: 1 },
    );
    const tissues = (data.data ?? []).map((t) => ({
      id: t.tissueSiteDetailId,
      name: t.tissueSiteDetailId.replace(/_/g, " "),
      sampleCount: t.rnaSeqSampleSummary?.totalCount ?? t.eqtlSampleSummary?.totalCount ?? 0,
      colorHex: t.colorHex ? `#${t.colorHex}` : null,
      expressedGeneCount: t.expressedGeneCount ?? null,
      eGeneCount: t.eGeneCount ?? null,
    }));
    res.json({ tissues, total: tissues.length });
  } catch (err) {
    next(err);
  }
});

router.get("/transcriptomics/expression/search", async (req, res, next) => {
  const { gene, tissue } = req.query as Record<string, string>;
  if (!gene) {
    res.status(400).json({ error: "gene is required" });
    return;
  }
  try {
    const gencode = await resolveGencode(gene);
    if (!gencode) {
      res.status(404).json({ error: `Gene ${gene} not found in GTEx` });
      return;
    }

    const data = await fetchJson<{ data?: GtexMedian[] }>(
      `${GTEX_BASE}/expression/medianGeneExpression?gencodeId=${encodeURIComponent(gencode.gencodeId)}&datasetId=gtex_v8&format=json`,
      { timeoutMs: 20000, retries: 1 },
    );

    let expressions = (data.data ?? []).map((d) => ({
      geneId: d.gencodeId,
      geneName: d.geneSymbol ?? gencode.geneSymbol,
      tissue: d.tissueSiteDetailId,
      tissueName: d.tissueSiteDetailId.replace(/_/g, " "),
      ontologyId: d.ontologyId,
      tpm: Math.round((d.median ?? 0) * 1000) / 1000,
      median: Math.round((d.median ?? 0) * 1000) / 1000,
      unit: d.unit ?? "TPM",
      gtexUrl: `https://gtexportal.org/home/gene/${gencode.gencodeId}`,
    }));

    if (tissue) {
      const t = tissue.toLowerCase();
      expressions = expressions.filter((e) => e.tissue.toLowerCase().includes(t) || e.tissueName.toLowerCase().includes(t));
    }

    expressions.sort((a, b) => b.tpm - a.tpm);
    const tissues = [...new Set(expressions.map((e) => e.tissue))];
    const maxTpm = expressions.reduce((m, e) => Math.max(m, e.tpm), 0);

    // Bucket distribution for the expression histogram.
    const buckets = [0, 0, 0, 0, 0, 0]; // 0, <0.1, <1, <10, <100, >=100 TPM
    for (const e of expressions) {
      const b = e.tpm <= 0 ? 0 : e.tpm < 0.1 ? 1 : e.tpm < 1 ? 2 : e.tpm < 10 ? 3 : e.tpm < 100 ? 4 : 5;
      buckets[b]++;
    }

    res.json({
      gene: gencode.geneSymbol,
      geneId: gencode.gencodeId,
      chromosome: gencode.chromosome,
      start: gencode.start,
      end: gencode.end,
      description: gencode.description,
      expressions,
      tissues,
      maxTpm,
      medianExpressionHistogram: [
        { bucket: "0", count: buckets[0] },
        { bucket: "<0.1", count: buckets[1] },
        { bucket: "0.1–1", count: buckets[2] },
        { bucket: "1–10", count: buckets[3] },
        { bucket: "10–100", count: buckets[4] },
        { bucket: "100+", count: buckets[5] },
      ],
      gtexUrl: `https://gtexportal.org/home/gene/${gencode.gencodeId}`,
      ensemblUrl: `https://www.ensembl.org/Homo_sapiens/Gene/Summary?g=${gencode.gencodeId.split(".")[0]}`,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Body map: anatomical coordinates for each GTEx tissue site on a schematic
// human body (0–100 vertical, ±40 horizontal, z = depth). TPMs, colors and
// sample counts always come live from GTEx — this table only positions them.
// ---------------------------------------------------------------------------

interface OrganPosition {
  x: number;
  y: number;
  z: number;
  size: number; // relative base radius
}

const BODY_MAP: Record<string, OrganPosition> = {
  // Brain sub-regions — cluster inside the head
  Brain_Amygdala: { x: -4, y: 88, z: 2, size: 1.1 },
  Brain_Anterior_cingulate_cortex_BA24: { x: 0, y: 92, z: 3, size: 1.3 },
  Brain_Caudate_basal_ganglia: { x: -5, y: 89, z: 0, size: 1.2 },
  Brain_Cerebellar_Hemisphere: { x: -7, y: 84, z: -4, size: 1.8 },
  Brain_Cerebellum: { x: 0, y: 84, z: -5, size: 2.0 },
  Brain_Cortex: { x: 3, y: 92, z: 0, size: 2.4 },
  Brain_Frontal_Cortex_BA9: { x: 0, y: 95, z: 6, size: 1.8 },
  Brain_Hippocampus: { x: 6, y: 87, z: 2, size: 1.2 },
  Brain_Hypothalamus: { x: 0, y: 87, z: 3, size: 1.0 },
  Brain_Nucleus_accumbens_basal_ganglia: { x: 4, y: 89, z: 2, size: 1.0 },
  Brain_Putamen_basal_ganglia: { x: -6, y: 88, z: 2, size: 1.2 },
  Brain_Spinal_cord_cervical_c_1: { x: 0, y: 80, z: -3, size: 1.2 },
  Brain_Substantia_nigra: { x: 2, y: 86, z: -1, size: 1.0 },
  // Head & neck
  Pituitary: { x: 0, y: 85, z: 5, size: 1.0 },
  Minor_Salivary_Gland: { x: 8, y: 79, z: 6, size: 1.2 },
  Thyroid: { x: 0, y: 74, z: 4, size: 1.6 },
  // Thorax
  Heart_Atrial_Appendage: { x: -4, y: 64, z: 3, size: 2.0 },
  Heart_Left_Ventricle: { x: -2, y: 61, z: 2, size: 2.4 },
  Lung: { x: 8, y: 63, z: 0, size: 3.2 },
  Esophagus_Gastroesophageal_Junction: { x: 2, y: 57, z: -3, size: 1.3 },
  Esophagus_Mucosa: { x: 2, y: 66, z: -4, size: 1.2 },
  Esophagus_Muscularis: { x: 2, y: 61, z: -4, size: 1.2 },
  Breast_Mammary_Tissue: { x: 11, y: 64, z: 6, size: 2.0 },
  // Circulatory & blood
  Artery_Aorta: { x: 1, y: 58, z: -1, size: 1.3 },
  Artery_Coronary: { x: -3, y: 62, z: 1, size: 1.0 },
  Artery_Tibial: { x: 12, y: 16, z: 2, size: 1.1 },
  Nerve_Tibial: { x: -12, y: 16, z: -2, size: 1.1 },
  Whole_Blood: { x: -16, y: 55, z: 4, size: 1.6 },
  Cells_EBV_transformed_lymphocytes: { x: -18, y: 70, z: 2, size: 1.4 },
  Cells_Cultured_fibroblasts: { x: 18, y: 70, z: 2, size: 1.4 },
  // Abdomen
  Liver: { x: 7, y: 52, z: 2, size: 3.6 },
  Kidney_Cortex: { x: -9, y: 47, z: -3, size: 2.0 },
  Kidney_Medulla: { x: -7, y: 45, z: -3, size: 1.4 },
  Adrenal_Gland: { x: 8, y: 49, z: -3, size: 1.2 },
  Pancreas: { x: 2, y: 47, z: 0, size: 2.0 },
  Spleen: { x: -11, y: 51, z: -2, size: 2.0 },
  Stomach: { x: -4, y: 53, z: 2, size: 2.2 },
  Colon_Sigmoid: { x: -6, y: 39, z: 1, size: 1.8 },
  Colon_Transverse: { x: 0, y: 43, z: 2, size: 2.0 },
  Small_Intestine_Terminal_Ileum: { x: 5, y: 39, z: 2, size: 2.0 },
  Bladder: { x: 0, y: 33, z: 1, size: 1.6 },
  // Reproductive
  Ovary: { x: -6, y: 34, z: 2, size: 1.3 },
  Fallopian_Tube: { x: -8, y: 36, z: 3, size: 1.1 },
  Prostate: { x: 0, y: 31, z: 1, size: 1.4 },
  Testis: { x: 3, y: 26, z: 2, size: 1.5 },
  Uterus: { x: 2, y: 34, z: 1, size: 1.7 },
  Vagina: { x: 1, y: 31, z: 0, size: 1.2 },
  Cervix_Ectocervix: { x: 3, y: 33, z: 1, size: 1.0 },
  Cervix_Endocervix: { x: -3, y: 33, z: 1, size: 1.0 },
  // Skin, muscle, fat
  Skin_Sun_Exposed_Lower_leg: { x: 14, y: 10, z: 6, size: 1.5 },
  Skin_Not_Sun_Exposed_Suprapubic: { x: -4, y: 36, z: 7, size: 1.5 },
  Muscle_Skeletal: { x: 12, y: 24, z: 0, size: 2.0 },
  Adipose_Subcutaneous: { x: -13, y: 40, z: 7, size: 2.0 },
  Adipose_Visceral_Omentum: { x: 6, y: 44, z: 4, size: 2.0 },
};

/**
 * Expression across all GTEx tissues positioned on a schematic body for the
 * 3D body-map view. Coordinates are layout only; every value is live GTEx.
 */
router.get("/transcriptomics/bodymap", async (req, res, next) => {
  const { gene } = req.query as Record<string, string>;
  if (!gene) {
    res.status(400).json({ error: "gene is required" });
    return;
  }
  try {
    const gencode = await resolveGencode(gene);
    if (!gencode) {
      res.status(404).json({ error: `Gene ${gene} not found in GTEx` });
      return;
    }
    const [exprData, tissueData] = await Promise.all([
      fetchJson<{ data?: GtexMedian[] }>(
        `${GTEX_BASE}/expression/medianGeneExpression?gencodeId=${encodeURIComponent(gencode.gencodeId)}&datasetId=gtex_v8&format=json`,
        { timeoutMs: 20000, retries: 1 },
      ),
      fetchJson<{ data?: GtexTissue[] }>(
        `${GTEX_BASE}/dataset/tissueSiteDetail?datasetId=gtex_v8&pageSize=250&format=json`,
        { timeoutMs: 20000, retries: 1 },
      ).catch(() => ({ data: undefined as GtexTissue[] | undefined })),
    ]);

    const colorByTissue = new Map<string, string>();
    for (const t of tissueData.data ?? []) {
      if (t.colorHex) colorByTissue.set(t.tissueSiteDetailId, `#${t.colorHex}`);
    }

    const rows = (exprData.data ?? []).map((d) => ({
      tissue: d.tissueSiteDetailId,
      tissueName: d.tissueSiteDetailId.replace(/_/g, " "),
      tpm: Math.round((d.median ?? 0) * 1000) / 1000,
      colorHex: colorByTissue.get(d.tissueSiteDetailId) ?? "#8b8b8b",
    }));
    const maxTpm = rows.reduce((m, r) => Math.max(m, r.tpm), 0);

    // Deterministic fallback: spread unmapped tissues in a ring around the torso.
    let unmappedIdx = 0;
    const organs = rows.map((r) => {
      const pos = BODY_MAP[r.tissue];
      // log-scaled intensity so low-TPM tissues stay visible
      const intensity =
        maxTpm > 0 ? Math.min(1, Math.log10(r.tpm * 10 + 1) / Math.log10(maxTpm * 10 + 1)) : 0;
      let position = pos;
      if (!position) {
        const angle = (unmappedIdx / Math.max(rows.length, 1)) * Math.PI * 2;
        position = { x: Math.cos(angle) * 30, y: 55 + Math.sin(angle) * 12, z: 10, size: 1.0 };
        unmappedIdx++;
      }
      return {
        ...r,
        position,
        mapped: !!pos,
        intensity: Math.round(intensity * 1000) / 1000,
        radius: position.size * (0.7 + 0.6 * intensity),
      };
    });

    res.json({
      gene: gencode.geneSymbol,
      geneId: gencode.gencodeId,
      maxTpm,
      medianTpm: rows.length ? Math.round(rows.reduce((s, r) => s + r.tpm, 0) / rows.length * 1000) / 1000 : 0,
      organCount: organs.length,
      unmappedTissues: organs.filter((o) => !o.mapped).map((o) => o.tissue),
      organs,
      gtexUrl: `https://gtexportal.org/home/gene/${gencode.gencodeId}`,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/transcriptomics/jobs", (_req, res) => {
  const jobs = [...store.transcriptomicsJobs.all()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50);
  res.json({ jobs });
});

router.post("/transcriptomics/jobs", (req, res) => {
  const { name, sampleType, pairedEnd = false, referenceGenome = "GRCh38" } = req.body as {
    name?: string;
    sampleType?: string;
    pairedEnd?: boolean;
    referenceGenome?: string;
  };
  if (!name || !sampleType) {
    res.status(400).json({ error: "name and sampleType are required" });
    return;
  }
  const job = {
    id: randomUUID(),
    name,
    sampleType,
    status: "pending",
    referenceGenome,
    pairedEnd: String(pairedEnd),
    createdAt: new Date(),
    readsCount: 0,
    genesDetected: 0,
  };
  store.transcriptomicsJobs.insert(job as never);
  reindex();
  res.status(201).json({
    ...job,
    createdAt: job.createdAt.toISOString(),
    completedAt: null,
  });
});

export default router;
