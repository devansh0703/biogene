import { Router } from "express";

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

router.get("/genome/search", async (req, res) => {
  const { query, species = "human" } = req.query as Record<string, string>;
  if (!query) { res.status(400).json({ error: "query is required" }); return; }

  const speciesMap: Record<string, string> = { human: "homo_sapiens", mouse: "mus_musculus" };
  const ensemblSpecies = speciesMap[species] ?? "homo_sapiens";

  try {
    const url = `https://rest.ensembl.org/xrefs/symbol/${ensemblSpecies}/${encodeURIComponent(query)}?content-type=application/json&object_type=gene`;
    const res2 = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!res2.ok) {
      const searchUrl = `https://rest.ensembl.org/lookup/symbol/${ensemblSpecies}/${encodeURIComponent(query)}?content-type=application/json`;
      const sr = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
      if (!sr.ok) { res.json({ features: [], total: 0 }); return; }
      const gene = await sr.json() as Record<string, unknown>;
      const feature = {
        id: gene.id as string,
        name: gene.display_name as string ?? query,
        type: "gene",
        chromosome: gene.seq_region_name as string,
        start: gene.start as number,
        end: gene.end as number,
        strand: gene.strand as number,
        biotype: gene.biotype as string,
        description: gene.description as string ?? "",
      };
      res.json({ features: [feature], total: 1 });
      return;
    }

    const refs = await res2.json() as Array<{ id: string; type: string }>;
    const geneRefs = refs.filter((r) => r.type === "gene").slice(0, 10);

    const features = await Promise.all(geneRefs.map(async (ref) => {
      try {
        const infoUrl = `https://rest.ensembl.org/lookup/id/${ref.id}?content-type=application/json`;
        const ir = await fetch(infoUrl, { signal: AbortSignal.timeout(6000) });
        if (!ir.ok) return null;
        const gene = await ir.json() as Record<string, unknown>;
        return {
          id: gene.id as string,
          name: gene.display_name as string ?? gene.id as string,
          type: "gene",
          chromosome: gene.seq_region_name as string,
          start: gene.start as number,
          end: gene.end as number,
          strand: gene.strand as number,
          biotype: gene.biotype as string,
          description: gene.description as string ?? "",
        };
      } catch { return null; }
    }));

    const valid = features.filter(Boolean);
    res.json({ features: valid, total: valid.length });
  } catch {
    res.status(502).json({ error: "Failed to reach Ensembl" });
  }
});

router.get("/genome/region", async (req, res) => {
  const { chromosome, start, end, species = "human" } = req.query as Record<string, string>;
  if (!chromosome || !start || !end) {
    res.status(400).json({ error: "chromosome, start, and end are required" });
    return;
  }

  const speciesMap: Record<string, string> = { human: "homo_sapiens", mouse: "mus_musculus" };
  const ensemblSpecies = speciesMap[species] ?? "homo_sapiens";
  const regionStr = `${chromosome}:${start}-${end}`;

  try {
    const [genesRes, variantsRes] = await Promise.all([
      fetch(
        `https://rest.ensembl.org/overlap/region/${ensemblSpecies}/${regionStr}?feature=gene;content-type=application/json`,
        { signal: AbortSignal.timeout(10000) }
      ),
      fetch(
        `https://rest.ensembl.org/overlap/region/${ensemblSpecies}/${regionStr}?feature=variation;content-type=application/json`,
        { signal: AbortSignal.timeout(10000) }
      ),
    ]);

    const genes = genesRes.ok
      ? ((await genesRes.json() as Array<Record<string, unknown>>).map((g) => ({
          id: g.id as string,
          name: g.external_name as string ?? g.gene_id as string ?? "",
          type: g.feature_type as string ?? "gene",
          chromosome,
          start: g.start as number,
          end: g.end as number,
          strand: g.strand as number,
          biotype: g.biotype as string ?? "",
          description: g.description as string ?? "",
        })))
      : [];

    const rawVariants = variantsRes.ok
      ? (await variantsRes.json() as Array<Record<string, unknown>>).slice(0, 200)
      : [];

    const variants = rawVariants.map((v) => ({
      id: v.id as string ?? v.variation_id as string ?? "",
      position: v.start as number,
      ref: (v.alleles as string[] | undefined)?.[0] ?? "N",
      alt: (v.alleles as string[] | undefined)?.[1] ?? "N",
      consequence: ((v.consequence_type as string[] | undefined) ?? [])[0] ?? "",
    }));

    const startN = parseInt(start);
    const endN = parseInt(end);
    const step = Math.max(1, Math.floor((endN - startN) / 200));
    const coverageData = [];
    for (let pos = startN; pos <= endN; pos += step) {
      coverageData.push({ position: pos, coverage: 0 });
    }

    res.json({ chromosome, start: startN, end: endN, genes, variants, coverageData });
  } catch {
    res.status(502).json({ error: "Failed to reach Ensembl" });
  }
});

export default router;
