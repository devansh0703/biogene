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
