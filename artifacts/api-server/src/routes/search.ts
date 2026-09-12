import { Router } from "express";
import { getSearchIndex, COLLECTION_SPECS } from "../lib/search-index";
import store from "../data";

const router = Router();

/**
 * Global natural-language search across every dataset.
 * Supports `field:value` filters (e.g. `BRCA1 significance:pathogenic`)
 * and per-collection scoping.
 */
router.get("/search", (req, res) => {
  const { q, collections, limit = "20", offset = "0" } = req.query as Record<string, string>;
  if (!q || !q.trim()) {
    res.status(400).json({ error: "q is required" });
    return;
  }
  const index = getSearchIndex();
  const collectionList = collections
    ? collections.split(",").map((c) => c.trim()).filter((c) => index.collections().includes(c))
    : undefined;
  const { total, results } = index.search(q, {
    collections: collectionList,
    limit: Math.min(100, parseInt(limit, 10) || 20),
    offset: parseInt(offset, 10) || 0,
  });

  res.json({
    query: q,
    total,
    results: results.map(({ doc, score, snippet }) => ({
      id: doc.id,
      collection: doc.collection,
      rowId: doc.rowId,
      score,
      snippet,
      fields: doc.fields,
      links: buildLinks(doc.collection, doc.rowId),
    })),
  });
});

/** Which collections have which searchable/facetable fields — powers the UI. */
router.get("/search/schema", (_req, res) => {
  const index = getSearchIndex();
  res.json({
    collections: Object.entries(COLLECTION_SPECS).map(([name, spec]) => ({
      collection: name,
      count: index.docCount(name),
      searchableFields: spec.searchable,
      metadataFields: spec.metadata ?? [],
    })),
  });
});

/** Facet counts, optionally scoped to a field + collection + query. */
router.get("/search/facets", (req, res) => {
  const { field, collections, q, limit = "25" } = req.query as Record<string, string>;
  if (!field) {
    res.status(400).json({ error: "field is required" });
    return;
  }
  const index = getSearchIndex();
  const collectionList = collections
    ? collections.split(",").map((c) => c.trim()).filter((c) => index.collections().includes(c))
    : undefined;
  const facets = index.facets(field, { collections: collectionList, query: q }).slice(0, parseInt(limit, 10) || 25);
  res.json({ field, facets, total: facets.length });
});

function buildLinks(collection: string, rowId: string): Record<string, string> {
  switch (collection) {
    case "variants": {
      const v = store.variants.find(rowId);
      if (!v) return { app: "/genomics" };
      return {
        app: "/genomics",
        ensembl: `https://www.ensembl.org/Homo_sapiens/Variation/Explore?v=${v.chromosome}:${v.position}-${v.position}`,
        ucsc: `https://genome.ucsc.edu/cgi-bin/hgTracks?db=hg38&position=chr${v.chromosome}:${v.position}-${v.position + 1}`,
        ...(v.rsId ? { dbsnp: `https://www.ncbi.nlm.nih.gov/snp/${v.rsId}`, clinvar: `https://www.ncbi.nlm.nih.gov/clinvar/?term=${v.rsId}` } : {}),
      };
    }
    case "genomicsJobs": return { app: "/genomics" };
    case "crisprJobs": return { app: "/crispr" };
    case "guideRnas": return { app: "/crispr" };
    case "samples": return { app: "/lims" };
    case "experiments": return { app: "/lims" };
    case "nlpEntities": return { app: "/nlp" };
    case "nlpRelations": return { app: "/nlp" };
    case "transcriptomicsJobs": return { app: "/transcriptomics" };
    default: return { app: "/" };
  }
}

/** Cross-dataset overview powering the dashboard charts. */
router.get("/stats/overview", (_req, res) => {
  const index = getSearchIndex();
  const variants = store.variants.all();
  const genomicsJobs = store.genomicsJobs.all();
  const crisprJobs = store.crisprJobs.all();
  const guides = store.guideRnas.all();
  const samples = store.samples.all();
  const exps = store.experiments.all();
  const entities = store.nlpEntities.all();
  const relations = store.nlpRelations.all();
  const tjobs = store.transcriptomicsJobs.all();

  const significance = new Map<string, number>();
  for (const v of variants) {
    const k = v.significance ?? "unannotated";
    significance.set(k, (significance.get(k) ?? 0) + 1);
  }
  const entityTypes = new Map<string, number>();
  for (const e of entities) {
    entityTypes.set(String(e.entityType), (entityTypes.get(String(e.entityType)) ?? 0) + 1);
  }
  const expStatus = new Map<string, number>();
  for (const e of exps) expStatus.set(String(e.status), (expStatus.get(String(e.status)) ?? 0) + 1);
  const sampleTypes = new Map<string, number>();
  for (const s of samples) sampleTypes.set(String(s.type), (sampleTypes.get(String(s.type)) ?? 0) + 1);

  // Variants per day (last 14 days) — activity timeline.
  const byDay = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  for (const v of variants) {
    const key = new Date(v.createdAt).toISOString().slice(0, 10);
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  res.json({
    datasets: Object.fromEntries(
      Object.keys(COLLECTION_SPECS).map((c) => [c, index.docCount(c)]),
    ),
    totalRecords: index.docCount(),
    moduleStats: {
      genomics: { variants: variants.length, jobs: genomicsJobs.length },
      crispr: { jobs: crisprJobs.length, guides: guides.length },
      lims: { samples: samples.length, experiments: exps.length },
      nlp: { entities: entities.length, relations: relations.length },
      transcriptomics: { jobs: tjobs.length },
    },
    charts: {
      variantSignificance: [...significance.entries()].map(([key, count]) => ({ key, count })),
      entityTypeBreakdown: [...entityTypes.entries()].map(([key, count]) => ({ key, count })),
      experimentStatus: [...expStatus.entries()].map(([key, count]) => ({ key, count })),
      sampleTypes: [...sampleTypes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([key, count]) => ({ key, count })),
      variantActivity: [...byDay.entries()].map(([date, count]) => ({ date, count })),
    },
  });
});

export default router;
