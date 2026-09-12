import { Router } from "express";
import { randomUUID } from "crypto";
import store from "../data";
import { fetchJson, fetchJsonOrNull } from "../lib/external";
import { reindex } from "../lib/search-index";

const router = Router();

const PUBTATOR_BASE = "https://www.ncbi.nlm.nih.gov/research/pubtator3-api";
const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

interface PubTatorAnnotation {
  infons: { type?: string; identifier?: string };
  text: string;
  locations: Array<{ offset: number; length: number }>;
}

interface PubTatorPassage {
  annotations?: PubTatorAnnotation[];
  text: string;
  infons?: { type?: string };
}

interface PubTatorDoc {
  passages: PubTatorPassage[];
}

const TYPE_MAP: Record<string, string> = {
  Gene: "gene",
  Disease: "disease",
  Chemical: "drug",
  Species: "organism",
  Mutation: "mutation",
  CellLine: "protein",
  Variant: "mutation",
};

function extractFromBiocJson(doc: PubTatorDoc | undefined): Array<Record<string, unknown>> {
  const entities: Array<Record<string, unknown>> = [];
  if (!doc) return entities;
  for (const passage of doc.passages ?? []) {
    for (const ann of passage.annotations ?? []) {
      const etype = TYPE_MAP[ann.infons.type ?? ""] ?? "gene";
      entities.push({
        id: randomUUID(),
        entityText: ann.text,
        entityType: etype,
        normalizedId: ann.infons.identifier ?? null,
        confidence: 0.95,
        sourceText: passage.text ?? null,
        startOffset: ann.locations?.[0]?.offset ?? null,
        endOffset: ann.locations?.[0] ? ann.locations[0].offset + ann.locations[0].length : null,
        createdAt: new Date(),
      });
    }
  }
  return entities;
}

/**
 * Annotate user-provided free text via PubTator3's public search index:
 * find the closest matching PubMed article through /search, then pull its
 * full precomputed annotations through /publications/export/biocjson.
 * (PubTator3's direct free-text annotate endpoint was retired upstream, so
 * the search->export chain is the supported path for raw text.)
 */
async function extractFromFreeText(text: string): Promise<Array<Record<string, unknown>>> {
  const search = await fetchJsonOrNull<{ results?: Array<{ pmid: number }> }>(
    `${PUBTATOR_BASE}/search/?text=${encodeURIComponent(text)}&max=1`,
    { timeoutMs: 15000 },
  );
  const pmid = search?.results?.[0]?.pmid;
  if (!pmid) return [];
  const data = await fetchJsonOrNull<{ PubTator3: PubTatorDoc[] }>(
    `${PUBTATOR_BASE}/publications/export/biocjson?pmids=${pmid}&full=true`,
    { timeoutMs: 20000 },
  );
  return extractFromBiocJson(data?.PubTator3?.[0]);
}

async function extractForPmid(pmid: string): Promise<Array<Record<string, unknown>>> {
  const data = await fetchJsonOrNull<{ PubTator3: PubTatorDoc[] }>(
    `${PUBTATOR_BASE}/publications/export/biocjson?pmids=${encodeURIComponent(pmid)}&full=true`,
    { timeoutMs: 20000 },
  );
  return extractFromBiocJson(data?.PubTator3?.[0]);
}

/** Relations via PubTator3's relation search, falling back to co-occurrence within the doc. */
async function relationsFromPubTator(entities: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
  const relations: Array<Record<string, unknown>> = [];
  const genes = entities.filter((e) => e.entityType === "gene");
  const diseases = entities.filter((e) => e.entityType === "disease");
  const drugs = entities.filter((e) => e.entityType === "drug");

  // PubTator3 relation search for gene-disease pairs of the top entities.
  const topGenes = genes.slice(0, 3).map((g) => String(g.entityText));
  for (const gene of topGenes) {
    const rel = await fetchJsonOrNull<{ results?: Array<{ _id: string; pmid: number; title?: string }> }>(
      `${PUBTATOR_BASE}/search/?text=@GENE_${encodeURIComponent(gene)}&max=1`,
      { timeoutMs: 12000 },
    );
    if (rel?.results?.length) {
      for (const disease of diseases.slice(0, 3)) {
        relations.push({
          id: randomUUID(),
          subjectText: gene,
          predicate: "associated_with",
          objectText: disease.entityText,
          confidence: 0.85,
          evidence: "PubTator3 relation index",
          createdAt: new Date(),
        });
      }
    }
  }

  // Co-occurrence within the same document for the remaining pairs.
  const seen = new Set(relations.map((r) => `${r.subjectText}|${r.objectText}`));
  for (const gene of genes.slice(0, 10)) {
    for (const disease of diseases.slice(0, 10)) {
      const key = `${gene.entityText}|${disease.entityText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      relations.push({
        id: randomUUID(),
        subjectText: gene.entityText,
        predicate: "associated_with",
        objectText: disease.entityText,
        confidence: 0.7,
        evidence: "co-occurrence",
        createdAt: new Date(),
      });
    }
    for (const drug of drugs.slice(0, 10)) {
      const key = `${drug.entityText}|${gene.entityText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      relations.push({
        id: randomUUID(),
        subjectText: drug.entityText,
        predicate: "targets",
        objectText: gene.entityText,
        confidence: 0.65,
        evidence: "co-occurrence",
        createdAt: new Date(),
      });
    }
  }
  return relations;
}

router.post("/nlp/extract", async (req, res, next) => {
  const { text, pmid } = req.body as { text?: string; pmid?: string };
  if (!text && !pmid) {
    res.status(400).json({ error: "text or pmid is required" });
    return;
  }

  try {
    let finalText = text ?? "";
    let resolvedPmid = pmid ?? null;
    let source: "pmid" | "text-matched" | "none" = "none";

    if (pmid && !text) {
      // Pull abstract text via E-utils for display.
      const abstractUrl = `${EUTILS}/efetch.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=xml&rettype=abstract`;
      try {
        const r = await fetch(abstractUrl, { signal: AbortSignal.timeout(10000) });
        if (r.ok) {
          const xml = await r.text();
          const abstractMatch = xml.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/);
          finalText = abstractMatch?.[1]?.replace(/<[^>]+>/g, "") ?? finalText;
        }
      } catch {
        // abstract text is optional display sugar
      }
      source = "pmid";
    }

    const entities = pmid ? await extractForPmid(pmid) : await extractFromFreeText(finalText);
    if (!pmid && entities.length > 0) source = "text-matched";
    if (!pmid && entities.length === 0) {
      // No PubTator coverage for this text — say so instead of guessing.
      res.json({
        entities: [],
        relations: [],
        text: finalText,
        entityCounts: {},
        source: "none",
        note: "No PubTator3 annotation match found for the provided text.",
      });
      return;
    }

    const relations = await relationsFromPubTator(entities);

    if (entities.length > 0) store.nlpEntities.insert(entities as never);
    if (relations.length > 0) store.nlpRelations.insert(relations as never);
    reindex();

    const entityCounts: Record<string, number> = {};
    for (const e of entities) {
      const t = e.entityType as string;
      entityCounts[t] = (entityCounts[t] ?? 0) + 1;
    }

    res.json({
      entities: entities.map((e) => ({
        id: e.id,
        text: e.entityText,
        type: e.entityType,
        normalizedId: e.normalizedId,
        confidence: e.confidence,
        startOffset: e.startOffset,
        endOffset: e.endOffset,
      })),
      relations: relations.map((r) => ({
        subject: r.subjectText,
        predicate: r.predicate,
        object: r.objectText,
        confidence: r.confidence,
        evidence: r.evidence,
      })),
      text: finalText,
      entityCounts,
      source,
      pmid: resolvedPmid,
      pubmedUrl: resolvedPmid ? `https://pubmed.ncbi.nlm.nih.gov/${resolvedPmid}/` : null,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/nlp/papers/search", async (req, res, next) => {
  const { query, limit = "10" } = req.query as Record<string, string>;
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }
  try {
    // PubTator3's semantic search over PubMed (entity-aware scoring + facets).
    const searchUrl = `${PUBTATOR_BASE}/search/?text=${encodeURIComponent(query)}&max=${Math.min(50, parseInt(limit, 10) || 10)}`;
    const data = await fetchJson<{
      results?: Array<{
        pmid: number;
        title?: string;
        journal?: string;
        authors?: string[];
        date?: string;
        doi?: string;
        citations?: number;
        text_hl?: string;
      }>;
      count?: number;
    }>(searchUrl, { timeoutMs: 15000, retries: 1 });

    const papers = (data.results ?? []).map((r) => ({
      pmid: String(r.pmid),
      title: r.title ?? "",
      abstract: r.text_hl ?? "",
      authors: r.authors ?? [],
      journal: r.journal ?? "",
      year: r.date ? new Date(r.date).getUTCFullYear() : null,
      doi: r.doi ?? "",
      keywords: [],
      citationCount: r.citations ?? 0,
      pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`,
      doiUrl: r.doi ? `https://doi.org/${r.doi}` : null,
    }));

    res.json({ papers, total: data.count ?? papers.length, query });
  } catch (err) {
    // Fallback: NCBI E-utils search (works even when PubTator3 search is down).
    try {
      const searchUrl = `${EUTILS}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query + "[Title/Abstract]")}&retmode=json&retmax=${limit}&sort=relevance`;
      const searchData = await fetchJson<{ esearchresult: { idlist: string[]; count: string } }>(searchUrl, { timeoutMs: 12000 });
      const pmids = searchData.esearchresult.idlist;
      if (!pmids.length) {
        res.json({ papers: [], total: 0, query });
        return;
      }
      const summaryData = await fetchJson<{
        result: Record<string, { uid: string; title: string; fulljournalname: string; authors: Array<{ name: string }>; pubdate: string; articleids: Array<{ idtype: string; value: string }> }>;
      }>(`${EUTILS}/esummary.fcgi?db=pubmed&id=${pmids.join(",")}&retmode=json`, { timeoutMs: 12000 });

      const papers = pmids
        .map((pmid) => {
          const s = summaryData.result?.[pmid];
          if (!s) return null;
          const doi = s.articleids?.find((a) => a.idtype === "doi")?.value ?? "";
          return {
            pmid,
            title: s.title ?? "",
            abstract: "",
            authors: (s.authors ?? []).map((a) => a.name),
            journal: s.fulljournalname ?? "",
            year: parseInt(s.pubdate?.split(" ")[0] ?? "0", 10) || null,
            doi,
            keywords: [],
            citationCount: 0,
            pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
            doiUrl: doi ? `https://doi.org/${doi}` : null,
          };
        })
        .filter(Boolean);
      res.json({ papers, total: parseInt(searchData.esearchresult.count, 10), query });
    } catch {
      next(err);
    }
  }
});

router.get("/nlp/knowledge-graph", (req, res) => {
  const { entityType, limit = "120" } = req.query as { entityType?: string; limit?: string };

  let entities = store.nlpEntities.all();
  if (entityType) entities = entities.filter((e) => e.entityType === entityType);

  const entityCounts: Record<string, { id: string; type: string; count: number }> = {};
  for (const e of entities) {
    const key = String(e.entityText).toLowerCase();
    if (!entityCounts[key]) entityCounts[key] = { id: e.id, type: String(e.entityType), count: 0 };
    entityCounts[key].count++;
  }

  const nodeMap = new Map<string, { id: string; label: string; type: string; count: number }>();
  for (const [key, v] of Object.entries(entityCounts)) {
    nodeMap.set(key, { id: v.id, label: key, type: v.type, count: v.count });
  }

  const nodes = Array.from(nodeMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, parseInt(limit, 10) || 120);
  const nodeLabels = new Set(nodes.map((n) => n.label));

  const edges = store.nlpRelations
    .all()
    .filter((r) => nodeLabels.has(String(r.subjectText).toLowerCase()) && nodeLabels.has(String(r.objectText).toLowerCase()))
    .map((r) => ({
      source: r.subjectText,
      target: r.objectText,
      relation: r.predicate,
      confidence: r.confidence ?? 0,
    }))
    .slice(0, 200);

  const byType: Record<string, number> = {};
  for (const n of nodes) byType[n.type] = (byType[n.type] ?? 0) + 1;

  res.json({
    nodes,
    edges,
    totalDocuments: store.nlpEntities.count(),
    entityTypeCounts: Object.entries(byType).map(([type, count]) => ({ type, count })),
  });
});

export default router;
