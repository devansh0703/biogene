import { Router } from "express";
import { randomUUID } from "crypto";
import store from "../data";
import { fetchJson, fetchJsonOrNull } from "../lib/external";
import { reindex } from "../lib/search-index";

const router = Router();

interface VcfVariant {
  id: string;
  jobId: string;
  chromosome: string;
  position: number;
  ref: string;
  alt: string;
  quality: number | null;
  filter: string;
  rsId: string | null;
  alleleFrequency: number | null;
  gene: string | null;
  consequence: string | null;
  significance: string | null;
  createdAt: Date;
}

interface VepTranscriptConsequence {
  gene_symbol?: string;
  consequence_terms?: string[];
}

interface VepResponse {
  transcript_consequences?: VepTranscriptConsequence[];
  most_severe_consequence?: string;
}

interface ClinVarSummary {
  clinical_significance?: { description?: string };
  gene?: { symbol?: string };
  name?: string;
}

function parseVcf(content: string, jobId: string): VcfVariant[] {
  const lines = content.split(/\r?\n/);
  const variants: VcfVariant[] = [];
  for (const line of lines) {
    if (line.startsWith("#") || !line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 5) continue;
    const [chrom, pos, id, ref, alt, qual, filter, info] = parts;
    const rsId = id && id !== "." ? id : null;
    let af: number | null = null;
    if (info) {
      const afMatch = info.match(/AF=([0-9.eE+-]+)/);
      if (afMatch) af = parseFloat(afMatch[1]);
    }
    variants.push({
      id: randomUUID(),
      jobId,
      chromosome: (chrom ?? "").replace(/^chr/i, ""),
      position: parseInt(pos ?? "0", 10) || 0,
      ref: ref ?? "",
      alt: alt ?? "",
      quality: qual && qual !== "." ? parseFloat(qual) : null,
      filter: filter && filter !== "." ? filter : "PASS",
      rsId,
      alleleFrequency: af,
      gene: null,
      consequence: null,
      significance: null,
      createdAt: new Date(),
    });
  }
  return variants;
}

async function annotateWithEnsembl(
  chromosome: string,
  position: number,
  ref: string,
  alt: string,
): Promise<{ gene: string | null; consequence: string | null } | null> {
  if (!chromosome || !position || !ref || !alt) return null;
  const hgvs = `${chromosome}:g.${position}${ref}>${alt}`;
  const url = `https://rest.ensembl.org/vep/human/hgvs/${encodeURIComponent(hgvs)}?content-type=application/json&hgvs=1&canonical=1&pick=1`;
  const data = await fetchJsonOrNull<VepResponse[]>(url, { timeoutMs: 12000, retries: 2 });
  if (!data?.length) return null;
  const top = data[0];
  const tc = top.transcript_consequences?.[0];
  return {
    gene: tc?.gene_symbol ?? null,
    consequence: tc?.consequence_terms?.[0] ?? top.most_severe_consequence ?? null,
  };
}

async function annotateWithClinVar(rsId: string): Promise<{ significance: string | null; clinvarId: string | null } | null> {
  if (!/^rs\d+$/i.test(rsId)) return null;
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=${encodeURIComponent(rsId)}&retmode=json&retmax=1`;
  const searchData = await fetchJsonOrNull<{ esearchresult?: { idlist?: string[] } }>(searchUrl, { timeoutMs: 8000 });
  const ids = searchData?.esearchresult?.idlist ?? [];
  if (!ids.length) return null;
  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=clinvar&id=${ids[0]}&retmode=json`;
  const summaryData = await fetchJsonOrNull<{ result?: Record<string, ClinVarSummary> }>(summaryUrl, { timeoutMs: 8000 });
  const result = summaryData?.result?.[ids[0]];
  if (!result) return { significance: null, clinvarId: ids[0] };
  return { significance: result.clinical_significance?.description ?? null, clinvarId: ids[0] };
}

router.post("/genomics/variants/upload", async (req, res) => {
  const { filename, content } = req.body as { filename?: string; content?: string };
  if (!filename || !content) {
    res.status(400).json({ error: "filename and content are required" });
    return;
  }
  const jobId = randomUUID();
  store.genomicsJobs.insert({
    id: jobId,
    filename,
    status: "processing",
    variantCount: 0,
    createdAt: new Date(),
  } as never);

  const rawVariants = parseVcf(content, jobId);

  // Annotate a bounded subset concurrently (external API quotas).
  const subset = rawVariants.slice(0, 60);
  const annotated = await Promise.all(
    subset.map(async (v): Promise<VcfVariant> => {
      const [ensembl, clinvar] = await Promise.all([
        annotateWithEnsembl(v.chromosome, v.position, v.ref, v.alt),
        v.rsId ? annotateWithClinVar(v.rsId) : Promise.resolve(null),
      ]);
      return {
        ...v,
        gene: ensembl?.gene ?? null,
        consequence: ensembl?.consequence ?? null,
        significance: clinvar?.significance ?? null,
      };
    }),
  );
  // Non-annotated remainder is still stored (raw parse data).
  const rest = rawVariants.slice(60);
  const rows = [...annotated, ...rest];

  if (rows.length > 0) store.variants.insert(rows as never);
  store.genomicsJobs.update(jobId, {
    status: "completed",
    variantCount: rows.length,
    completedAt: new Date(),
  } as never);
  reindex();

  res.json({
    id: jobId,
    filename,
    status: "completed",
    variantCount: rows.length,
    annotatedCount: annotated.length,
    createdAt: new Date().toISOString(),
  });
});

router.get("/genomics/variants", (req, res) => {
  const { jobId, chromosome, significance, gene, limit = "50", offset = "0" } = req.query as Record<string, string>;
  let variants = store.variants.all();
  if (jobId) variants = variants.filter((v) => v.jobId === jobId);
  if (chromosome) variants = variants.filter((v) => v.chromosome === chromosome);
  if (significance) variants = variants.filter((v) => (v.significance ?? "").toLowerCase() === significance.toLowerCase());
  if (gene) variants = variants.filter((v) => (v.gene ?? "").toLowerCase() === gene.toLowerCase());
  variants = [...variants].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const total = variants.length;
  const page = variants.slice(parseInt(offset, 10) || 0, (parseInt(offset, 10) || 0) + (parseInt(limit, 10) || 50));
  res.json({ variants: page, total });
});

router.get("/genomics/variants/:variantId/annotate", async (req, res) => {
  const { variantId } = req.params;
  const variant = store.variants.find(variantId);
  if (!variant) {
    res.status(404).json({ error: "Variant not found" });
    return;
  }

  const [ensemblAnnotation, clinvarAnnotation] = await Promise.all([
    annotateWithEnsembl(variant.chromosome, variant.position, variant.ref, variant.alt),
    variant.rsId ? annotateWithClinVar(variant.rsId) : Promise.resolve(null),
  ]);

  res.json({
    variant,
    ensemblAnnotation: ensemblAnnotation ?? null,
    clinvarAnnotation: clinvarAnnotation ?? null,
    dbsnpAnnotation: variant.rsId
      ? { rsId: variant.rsId, url: `https://www.ncbi.nlm.nih.gov/snp/${variant.rsId}` }
      : null,
    externalUrls: {
      ensembl: `https://www.ensembl.org/Homo_sapiens/Variation/Explore?v=${variant.rsId ?? `${variant.chromosome}:${variant.position}-${variant.position}`}`,
      clinvar: variant.rsId ? `https://www.ncbi.nlm.nih.gov/clinvar/?term=${variant.rsId}` : null,
      ucsc: `https://genome.ucsc.edu/cgi-bin/hgTracks?db=hg38&position=chr${variant.chromosome}:${variant.position}-${variant.position + 1}`,
    },
  });
});

router.get("/genomics/stats", (req, res) => {
  const { jobId } = req.query as Record<string, string>;
  let variants = store.variants.all();
  if (jobId) variants = variants.filter((v) => v.jobId === jobId);

  const byChromosome: Record<string, number> = {};
  const bySignificance: Record<string, number> = {};
  const byConsequence: Record<string, number> = {};
  const byGene: Record<string, number> = {};
  const qualityBuckets = [0, 0, 0, 0, 0]; // <30, <50, <70, <90, >=90
  const afBuckets = [0, 0, 0, 0, 0]; // <0.1, <0.25, <0.5, <0.75, <=1
  for (const v of variants) {
    byChromosome[v.chromosome] = (byChromosome[v.chromosome] ?? 0) + 1;
    bySignificance[v.significance ?? "unannotated"] = (bySignificance[v.significance ?? "unannotated"] ?? 0) + 1;
    byConsequence[v.consequence ?? "unannotated"] = (byConsequence[v.consequence ?? "unannotated"] ?? 0) + 1;
    if (v.gene) byGene[v.gene] = (byGene[v.gene] ?? 0) + 1;
    const q = v.quality ?? 0;
    const qi = q < 30 ? 0 : q < 50 ? 1 : q < 70 ? 2 : q < 90 ? 3 : 4;
    qualityBuckets[qi]++;
    const af = v.alleleFrequency ?? 0;
    const ai = af < 0.1 ? 0 : af < 0.25 ? 1 : af < 0.5 ? 2 : af < 0.75 ? 3 : 4;
    afBuckets[ai]++;
  }

  const top = (m: Record<string, number>, n: number) =>
    Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([key, count]) => ({ [key]: count ? key : key, chromosome: undefined, consequence: undefined, significance: undefined, gene: undefined, key, count }))
      .map(({ key, count }) => ({ key, count }));

  res.json({
    totalVariants: variants.length,
    byChromosome: Object.entries(byChromosome)
      .sort((a, b) => b[1] - a[1])
      .map(([chromosome, count]) => ({ chromosome, count })),
    bySignificance: top(bySignificance, 12).map(({ key, count }) => ({ significance: key, count })),
    byConsequence: top(byConsequence, 12).map(({ key, count }) => ({ consequence: key, count })),
    topGenes: top(byGene, 15).map(({ key, count }) => ({ gene: key, count })),
    qualityHistogram: [
      { bucket: "<30", count: qualityBuckets[0] },
      { bucket: "30–49", count: qualityBuckets[1] },
      { bucket: "50–69", count: qualityBuckets[2] },
      { bucket: "70–89", count: qualityBuckets[3] },
      { bucket: "90+", count: qualityBuckets[4] },
    ],
    alleleFrequencyHistogram: [
      { bucket: "<0.1", count: afBuckets[0] },
      { bucket: "0.1–0.25", count: afBuckets[1] },
      { bucket: "0.25–0.5", count: afBuckets[2] },
      { bucket: "0.5–0.75", count: afBuckets[3] },
      { bucket: "0.75–1", count: afBuckets[4] },
    ],
    recentJobs: store.genomicsJobs.count(),
  });
});

router.get("/genomics/jobs", (_req, res) => {
  const jobs = [...store.genomicsJobs.all()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50);
  res.json({ jobs });
});

/**
 * Real reference sequence context around a variant, fetched live from
 * Ensembl. Powers the 3D DNA helix view — no synthetic bases.
 */
router.get("/genomics/variants/:variantId/sequence-context", async (req, res) => {
  const { variantId } = req.params;
  const { flank = "20" } = req.query as Record<string, string>;
  const variant = store.variants.find(variantId);
  if (!variant) {
    res.status(404).json({ error: "Variant not found" });
    return;
  }
  const flankN = Math.min(60, Math.max(5, parseInt(flank, 10) || 20));
  const start = Math.max(1, variant.position - flankN);
  const end = variant.position - 1; // bases before the REF allele
  let leftFlank = "";
  if (end >= start) {
    const seq = await fetchJsonOrNull<{ seq?: string }>(
      `https://rest.ensembl.org/sequence/region/human/${variant.chromosome}:${start}..${end}?content-type=application/json`,
      { timeoutMs: 12000, retries: 2 },
    );
    leftFlank = (seq?.seq ?? "").toUpperCase();
  }
  const refStart = variant.position;
  const refEnd = variant.position + Math.max(variant.ref.length, 1) - 1;
  const refSeq = await fetchJsonOrNull<{ seq?: string }>(
    `https://rest.ensembl.org/sequence/region/human/${variant.chromosome}:${refStart}..${refEnd}?content-type=application/json`,
    { timeoutMs: 12000, retries: 2 },
  );
  const ref = (refSeq?.seq ?? "").toUpperCase() || variant.ref;
  const rightStart = refStart + ref.length;
  const rightEnd = rightStart + flankN - 1;
  const rightSeq = await fetchJsonOrNull<{ seq?: string }>(
    `https://rest.ensembl.org/sequence/region/human/${variant.chromosome}:${rightStart}..${rightEnd}?content-type=application/json`,
    { timeoutMs: 12000, retries: 2 },
  );
  const rightFlank = (rightSeq?.seq ?? "").toUpperCase();

  res.json({
    variant: {
      id: variant.id,
      chromosome: variant.chromosome,
      position: variant.position,
      ref,
      alt: variant.alt,
      rsId: variant.rsId,
      gene: variant.gene,
      consequence: variant.consequence,
      significance: variant.significance,
    },
    sequence: `${leftFlank}[${ref}>${variant.alt}]${rightFlank}`,
    leftFlank,
    refAllele: ref,
    rightFlank,
    flank: flankN,
    source: "Ensembl REST — GRCh38",
  });
});

export default router;
