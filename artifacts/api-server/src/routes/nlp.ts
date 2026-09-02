import { Router } from "express";
import { randomUUID } from "crypto";
import store from "../data";

const router = Router();

interface PubTatorAnnotation {
  infons: { type?: string; identifier?: string };
  text: string;
  locations: Array<{ offset: number; length: number }>;
}

interface PubTatorPassage {
  annotations: PubTatorAnnotation[];
  text: string;
}

async function extractWithPubTator(text: string, pmid?: string) {
  const entities: Array<Record<string, unknown>> = [];

  if (pmid) {
    try {
      const url = `https://www.ncbi.nlm.nih.gov/research/pubtator3-api/publications/export/biocjson?pmids=${pmid}&full=true`;
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (res.ok) {
        const data = await res.json() as { PubTator3: Array<{ passages: PubTatorPassage[] }> };
        const doc = data.PubTator3?.[0];
        if (doc) {
          for (const passage of doc.passages ?? []) {
            for (const ann of passage.annotations ?? []) {
              const typeMap: Record<string, string> = {
                Gene: "gene", Disease: "disease", Chemical: "drug",
                Species: "organism", Mutation: "mutation", CellLine: "protein",
              };
              const etype = typeMap[ann.infons.type ?? ""] ?? "gene";
              entities.push({
                id: randomUUID(),
                entityText: ann.text,
                entityType: etype,
                normalizedId: ann.infons.identifier ?? null,
                confidence: 0.9,
                sourceText: passage.text ?? null,
                startOffset: ann.locations[0]?.offset ?? null,
                endOffset: ann.locations[0] ? ann.locations[0].offset + ann.locations[0].length : null,
              });
            }
          }
        }
      }
    } catch {}
  }

  if (entities.length === 0 && text) {
    const entityPatterns: Array<{ pattern: RegExp; type: string }> = [
      { pattern: /\b([A-Z][A-Z0-9]{1,10}[0-9])\b/g, type: "gene" },
      { pattern: /\b(cancer|tumor|carcinoma|syndrome|disease|disorder|diabetes|alzheimer|parkinson)\b/gi, type: "disease" },
      { pattern: /\b(aspirin|ibuprofen|metformin|cisplatin|tamoxifen|herceptin|gleevec|taxol)\b/gi, type: "drug" },
      { pattern: /\b(p\.?[A-Z][a-z]{2}\d+[A-Z][a-z]{2}|c\.\d+[A-Z]>[A-Z]|rs\d{6,})\b/g, type: "mutation" },
    ];

    for (const { pattern, type } of entityPatterns) {
      for (const match of text.matchAll(pattern)) {
        entities.push({
          id: randomUUID(),
          entityText: match[0],
          entityType: type,
          normalizedId: null,
          confidence: 0.75,
          sourceText: text,
          startOffset: match.index ?? null,
          endOffset: match.index != null ? match.index + match[0].length : null,
        });
      }
    }
  }

  return entities;
}

function inferRelations(entities: Array<Record<string, unknown>>) {
  const relations: Array<Record<string, unknown>> = [];
  const genes = entities.filter((e) => e.entityType === "gene");
  const diseases = entities.filter((e) => e.entityType === "disease");
  const drugs = entities.filter((e) => e.entityType === "drug");

  for (const gene of genes) {
    for (const disease of diseases) {
      relations.push({
        id: randomUUID(),
        subjectText: gene.entityText,
        predicate: "associated_with",
        objectText: disease.entityText,
        confidence: 0.7,
        evidence: "co-occurrence",
      });
    }
    for (const drug of drugs) {
      relations.push({
        id: randomUUID(),
        subjectText: drug.entityText,
        predicate: "targets",
        objectText: gene.entityText,
        confidence: 0.65,
        evidence: "co-occurrence",
      });
    }
  }
  return relations;
}

router.post("/nlp/extract", async (req, res) => {
  const { text, pmid } = req.body as { text?: string; pmid?: string };
  if (!text && !pmid) {
    res.status(400).json({ error: "text or pmid is required" });
    return;
  }

  let finalText = text ?? "";

  if (pmid && !text) {
    try {
      const abstractUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml&rettype=abstract`;
      const r = await fetch(abstractUrl, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const xml = await r.text();
        const abstractMatch = xml.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/);
        finalText = abstractMatch?.[1]?.replace(/<[^>]+>/g, "") ?? "";
      }
    } catch {}
  }

  const entities = await extractWithPubTator(finalText, pmid);
  const relations = inferRelations(entities);

  if (entities.length > 0) {
    store.nlpEntities.insert(entities as never);
  }
  if (relations.length > 0) {
    store.nlpRelations.insert(relations as never);
  }

  const entityCounts: Record<string, number> = {};
  for (const e of entities) {
    const t = e.entityType as string;
    entityCounts[t] = (entityCounts[t] ?? 0) + 1;
  }

  res.json({
    entities: entities.map((e) => ({
      id: e.id, text: e.entityText, type: e.entityType, normalizedId: e.normalizedId,
      confidence: e.confidence, startOffset: e.startOffset, endOffset: e.endOffset,
    })),
    relations: relations.map((r) => ({
      subject: r.subjectText, predicate: r.predicate, object: r.objectText,
      confidence: r.confidence, evidence: r.evidence,
    })),
    text: finalText,
    entityCounts,
  });
});

router.get("/nlp/papers/search", async (req, res) => {
  const { query, limit = "10" } = req.query as Record<string, string>;
  if (!query) { res.status(400).json({ error: "query is required" }); return; }

  try {
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query + "[Title/Abstract]")}&retmode=json&retmax=${limit}&sort=relevance`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
    if (!searchRes.ok) throw new Error("Search failed");
    const searchData = await searchRes.json() as { esearchresult: { idlist: string[]; count: string } };
    const pmids = searchData.esearchresult.idlist;
    const total = parseInt(searchData.esearchresult.count);

    if (!pmids.length) { res.json({ papers: [], total: 0, query }); return; }

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmids.join(",")}&retmode=json`;
    const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(10000) });
    const summaryData = await summaryRes.json() as {
      result: Record<string, {
        uid: string; title: string; sortpubdate: string; fulljournalname: string;
        authors: Array<{ name: string }>; articleids: Array<{ idtype: string; value: string }>;
        pubdate: string;
      }>
    };

    const papers = pmids.map((pmid) => {
      const s = summaryData.result[pmid];
      if (!s) return null;
      const doi = s.articleids?.find((a) => a.idtype === "doi")?.value ?? "";
      return {
        pmid,
        title: s.title ?? "",
        abstract: "",
        authors: (s.authors ?? []).map((a) => a.name),
        journal: s.fulljournalname ?? "",
        year: parseInt(s.pubdate?.split(" ")[0] ?? "0"),
        doi,
        keywords: [],
      };
    }).filter(Boolean);

    res.json({ papers, total, query });
  } catch {
    res.status(502).json({ error: "Failed to reach PubMed" });
  }
});

router.get("/nlp/knowledge-graph", async (req, res) => {
  const { entityType } = req.query as { entityType?: string };

  let entities = store.nlpEntities.all();
  if (entityType) entities = entities.filter((e) => e.entityType === entityType);

  const entityCounts: Record<string, { id: string; type: string; count: number }> = {};
  for (const e of entities) {
    const key = String(e.entityText).toLowerCase();
    if (!entityCounts[key]) entityCounts[key] = { id: e.id, type: String(e.entityType), count: 0 };
    entityCounts[key].count++;
  }

  const relations = store.nlpRelations.all()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 100);

  const nodeMap = new Map<string, { id: string; label: string; type: string; count: number }>();
  for (const [key, v] of Object.entries(entityCounts)) {
    if (nodeMap.has(key)) continue;
    nodeMap.set(key, { id: v.id, label: key, type: v.type, count: v.count });
  }

  const nodes = Array.from(nodeMap.values());
  const edges = relations.map((r) => ({
    source: r.subjectText,
    target: r.objectText,
    relation: r.predicate,
    confidence: r.confidence ?? 0,
  }));

  res.json({ nodes, edges, totalDocuments: store.nlpEntities.count() });
});

export default router;
