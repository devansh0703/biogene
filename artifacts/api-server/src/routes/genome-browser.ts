import { Router } from "express";
import { fetchJson, fetchJsonOrNull, getEnsemblSpecies, resolveEnsemblSpecies } from "../lib/external";

const router = Router();

const AVAILABLE_TRACKS = [
  { id: "genes", name: "Ensembl Genes", type: "gene", source: "Ensembl", description: "Gene annotations from Ensembl" },
  { id: "variants", name: "Common Variants", type: "variant", source: "Ensembl/dbSNP", description: "Common SNPs from dbSNP" },
  { id: "conservation", name: "PhyloP Conservation", type: "conservation", source: "UCSC", description: "Multi-species conservation scores" },
  { id: "repeats", name: "Repeat Elements", type: "repeat", source: "UCSC", description: "RepeatMasker repeat elements" },
  { id: "regulatory", name: "Regulatory Features", type: "regulatory", source: "Ensembl", description: "Regulatory build features" },
  { id: "transcripts", name: "Transcripts", type: "transcript", source: "Ensembl", description: "Transcript annotations" },
];

router.get("/genome/tracks", (_req, res) => {
  res.json({ tracks: AVAILABLE_TRACKS });
});

// Live Ensembl species list for the browser species picker.
router.get("/genome/species", async (_req, res, next) => {
  try {
    const species = await getEnsemblSpecies();
    res.json({
      species: species.map((s) => ({
        name: s.name,
        displayName: s.display_name || s.name.replace(/_/g, " "),
        commonName: s.common_name,
      })),
      total: species.length,
    });
  } catch (err) {
    next(err);
  }
});

interface NcbiGeneSummary {
  name: string;
  description: string;
  chromosome: string;
  maplocation: string;
  genomicinfo?: Array<{ chrstart: number; chrstop: number; chraccver?: string }>;
  organism?: { scientificname?: string };
}

function grepVersionFromAssembly(acc: string | undefined): string {
  // NC_000017.11 -> chromosome accession; Ensembl wants plain names, keep chr only.
  return acc ? acc.split(".")[0] : "";
}

/**
 * Natural-language genome search: free text like "tumor protein p53" or
 * "breast cancer gene BRCA1" resolves through NCBI Gene (full-text ranked),
 * with an Ensembl symbol-lookup pass for exact symbols.
 */
router.get("/genome/search", async (req, res, next) => {
  const { query, species = "human" } = req.query as Record<string, string>;
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  try {
    const ensemblSpecies = (await resolveEnsemblSpecies(species)) ?? "homo_sapiens";

    // 1) NCBI Gene full-text search (handles natural language + symbols).
    const taxid = ensemblSpecies === "mus_musculus" ? "10090" : ensemblSpecies === "rattus_norvegicus" ? "10116" : "9606";
    const term = `${query} AND "Homo sapiens"[Organism]`.replace("Homo sapiens", taxid === "9606" ? "Homo sapiens" : taxid === "10090" ? "Mus musculus" : "Rattus norvegicus");
    const esearch = await fetchJsonOrNull<{ esearchresult?: { idlist?: string[] } }>(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gene&term=${encodeURIComponent(term)}&retmode=json&retmax=8`,
      { timeoutMs: 12000 },
    );
    const geneIds = esearch?.esearchresult?.idlist ?? [];

    const features: Array<Record<string, unknown>> = [];

    if (geneIds.length) {
      const esummary = await fetchJson<{ result: Record<string, NcbiGeneSummary | string> }>(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=${geneIds.join(",")}&retmode=json`,
        { timeoutMs: 12000 },
      );
      for (const gid of geneIds) {
        const g = esummary.result?.[gid] as NcbiGeneSummary | undefined;
        if (!g || typeof g !== "object" || !g.name) continue;
        const gi = g.genomicinfo?.[0];
        const start = gi ? Math.min(gi.chrstart, gi.chrstop) + 1 : 0;
        const end = gi ? Math.max(gi.chrstart, gi.chrstop) + 1 : 0;
        features.push({
          id: gid,
          name: g.name,
          type: "gene",
          chromosome: g.chromosome?.replace(/^chr/i, "") ?? "",
          start,
          end,
          strand: gi && gi.chrstop < gi.chrstart ? -1 : 1,
          biotype: g.maplocation ?? "",
          description: g.description ?? "",
          organism: g.organism?.scientificname ?? "",
          ncbiGeneUrl: `https://www.ncbi.nlm.nih.gov/gene/${gid}`,
          ensemblUrl: `https://www.ensembl.org/${ensemblSpecies}/Gene/Summary?g=${g.name}`,
        });
      }
    }

    // 2) Ensembl exact-symbol lookup as a second source (dedup by symbol).
    try {
      const lookupUrl = `https://rest.ensembl.org/lookup/symbol/${ensemblSpecies}/${encodeURIComponent(query)}?content-type=application/json`;
      const gene = await fetchJsonOrNull<Record<string, unknown>>(lookupUrl, { timeoutMs: 12000 });
      if (gene?.id) {
        const name = (gene.display_name as string) ?? query;
        if (!features.some((f) => String(f.name).toUpperCase() === name.toUpperCase())) {
          features.unshift({
            id: gene.id,
            name,
            type: "gene",
            chromosome: gene.seq_region_name as string,
            start: gene.start as number,
            end: gene.end as number,
            strand: gene.strand as number,
            biotype: gene.biotype as string,
            description: gene.description as string ?? "",
            organism: ensemblSpecies,
            ncbiGeneUrl: null,
            ensemblUrl: `https://www.ensembl.org/${ensemblSpecies}/Gene/Summary?g=${name}`,
          });
        }
      }
    } catch {
      // Ensembl lookup is best-effort; NCBI results still stand.
    }

    res.json({ features, total: features.length, species: ensemblSpecies });
  } catch (err) {
    next(err);
  }
});

router.get("/genome/region", async (req, res, next) => {
  const { chromosome, start, end, species = "human" } = req.query as Record<string, string>;
  if (!chromosome || !start || !end) {
    res.status(400).json({ error: "chromosome, start, and end are required" });
    return;
  }
  const startN = parseInt(start, 10);
  const endN = parseInt(end, 10);
  if (!Number.isFinite(startN) || !Number.isFinite(endN) || endN <= startN || endN - startN > 5_000_000) {
    res.status(400).json({ error: "invalid region (max span 5 Mb)" });
    return;
  }

  try {
    const ensemblSpecies = (await resolveEnsemblSpecies(species)) ?? "homo_sapiens";
    const regionStr = `${chromosome}:${startN}-${endN}`;

    const [genesRes, variantsRes, seqData] = await Promise.all([
      fetchJsonOrNull<Array<Record<string, unknown>>>(
        `https://rest.ensembl.org/overlap/region/${ensemblSpecies}/${regionStr}?feature=gene;content-type=application/json`,
        { timeoutMs: 15000, retries: 1 },
      ),
      fetchJsonOrNull<Array<Record<string, unknown>>>(
        `https://rest.ensembl.org/overlap/region/${ensemblSpecies}/${regionStr}?feature=variation;content-type=application/json`,
        { timeoutMs: 15000, retries: 1 },
      ),
      fetchJsonOrNull<{ seq: string }>(
        `https://rest.ensembl.org/sequence/region/${ensemblSpecies}/${regionStr}?content-type=application/json`,
        { timeoutMs: 15000 },
      ),
    ]);

    const genes = (genesRes ?? []).map((g) => ({
      id: g.id as string,
      name: (g.external_name as string) ?? (g.gene_id as string) ?? "",
      type: (g.feature_type as string) ?? "gene",
      chromosome,
      start: g.start as number,
      end: g.end as number,
      strand: g.strand as number,
      biotype: (g.biotype as string) ?? "",
      description: (g.description as string) ?? "",
      ensemblUrl: `https://www.ensembl.org/${ensemblSpecies}/Gene/Summary?g=${g.id}`,
    }));

    const variants = (variantsRes ?? []).slice(0, 300).map((v) => ({
      id: (v.id as string) ?? (v.variation_id as string) ?? "",
      position: v.start as number,
      ref: (v.alleles as string[] | undefined)?.[0] ?? "N",
      alt: (v.alleles as string[] | undefined)?.[1] ?? "N",
      consequence: ((v.consequence_type as string[] | undefined) ?? [])[0] ?? "",
      mostSevere: (v.most_severe_consequence as string) ?? "",
      miniId: (v.mini_id as number) ?? null,
      dbsnpUrl: (v.id as string) ? `https://www.ncbi.nlm.nih.gov/snp/${v.id as string}` : null,
    }));

    // GC content profile computed from real sequence.
    const seq = (seqData?.seq ?? "").toUpperCase();
    const windows = 60;
    const step = Math.max(1, Math.floor((endN - startN) / windows));
    const coverageData: Array<{ position: number; coverage: number }> = [];
    for (let i = 0; i < windows; i++) {
      const from = i * step;
      const to = Math.min(seq.length, from + step);
      const w = seq.slice(from, to);
      if (!w.length) break;
      const gc = (w.match(/[GC]/g) ?? []).length / w.length;
      coverageData.push({ position: startN + from, coverage: Math.round(gc * 1000) / 10 });
    }

    const consequenceCounts: Record<string, number> = {};
    for (const v of variants) {
      if (!v.consequence) continue;
      consequenceCounts[v.consequence] = (consequenceCounts[v.consequence] ?? 0) + 1;
    }

    res.json({
      chromosome,
      start: startN,
      end: endN,
      species: ensemblSpecies,
      genes,
      variants,
      coverageData,
      gcContent: seq ? Math.round(((seq.match(/[GC]/g) ?? []).length / seq.length) * 1000) / 10 : null,
      sequenceLength: seq.length,
      consequenceCounts: Object.entries(consequenceCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([consequence, count]) => ({ consequence, count })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
