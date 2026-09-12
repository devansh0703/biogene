// Topic discovery: run the user's natural-language topic through the existing
// BM25 index over every local dataset, then turn the top hits into concrete
// URLs in the external sources we already integrate (PubMed, ChEMBL, RCSB,
// UniProt, Ensembl, Wikipedia). Firecrawl scrapes exactly those pages.

import store from "../data";
import { getSearchIndex } from "./search-index";

export interface TopicHit {
  collection: string;
  rowId: string;
  score: number;
  label: string;
  detail: string;
}

/** BM25 over the local corpus to understand what the user is asking about. */
export function discoverTopic(query: string, limit = 12): { hits: TopicHit[]; genes: string[]; title: string } {
  const index = getSearchIndex();
  const { results } = index.search(query, { limit });
  const hits: TopicHit[] = results.map(({ doc, score }) => {
    const f = doc.fields as Record<string, unknown>;
    const label =
      String(f.gene ?? f.geneName ?? f.entityText ?? f.name ?? f.filename ?? f.subjectText ?? doc.collection) || doc.collection;
    const detailBits = [f.consequence, f.significance, f.entityType, f.status, f.type, f.predicate]
      .filter((v) => v != null && String(v).length > 0)
      .map(String);
    return {
      collection: doc.collection,
      rowId: doc.rowId,
      score,
      label,
      detail: detailBits.join(" · "),
    };
  });

  // Genes mentioned anywhere in the corpus hits (drives gene-centric sources).
  const genes = new Set<string>();
  for (const h of hits) {
    for (const g of extractGeneSymbols(h.label)) genes.add(g);
  }
  for (const g of extractGeneSymbols(query)) genes.add(g);

  const title = hits[0]?.label && hits[0].score > 0 ? hits[0].label : humanize(query);
  return { hits, genes: [...genes].slice(0, 5), title: title.slice(0, 80) };
}const GENE_RE = /^[A-Z][A-Z0-9]{1,9}$/;
// English words that happen to look like gene symbols.
const COMMON_WORDS = new Set(
  "ALL AND ARE BUT CAN CAR CAT COW DID DOES FOR GET HAD HAS HER HIM HIS HOW ITS LET MAN MAY MEN NEW NOT NOW OFF OLD ONE ONLY OUR OUT OWN SAY SEE SHE SIT SIX SUN TEN THE TOO TWO USE WAS WAY WHO WHY YES YET YOU VIA AMP GEN PRO PRE NON TER TION".split(" "),
);

function extractGeneSymbols(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[^A-Za-z0-9]+/)) {
    if (raw.length < 3 || raw.length > 10) continue;
    if (!GENE_RE.test(raw)) continue;
    if (COMMON_WORDS.has(raw)) continue;
    out.push(raw);
  }
  return out;
}

function humanize(q: string): string {
  return q
    .split(/\s+/)
    .slice(0, 6)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export interface SourceLink {
  source: string;
  url: string;
  title: string;
}

/**
 * Build the exact pages to scrape for a topic, derived from the BM25 hits
 * (gene symbols, PubMed IDs already in the corpus, entity normalized IDs).
 */
export function buildSourceLinks(query: string, hits: TopicHit[], genes: string[]): SourceLink[] {
  const links: SourceLink[] = [];
  const seen = new Set<string>();
  const push = (source: string, url: string, title: string) => {
    if (!url || seen.has(url) || links.length >= 16) return;
    seen.add(url);
    links.push({ source, url, title });
  };

  const q = query.trim();
  const qEnc = encodeURIComponent(q);

  // 1. PubMed: real PMIDs found in local NLP entities first (exact articles).
  const pmids = new Set<string>();
  for (const e of store.nlpEntities.all()) {
    const m = String(e.normalizedId ?? "").match(/^PMID:(\d+)$/i);
    if (m) {
      // Only surface entities whose text plausibly relates to the query.
      if (tokenOverlap(q, e.entityText) > 0) pmids.add(m[1]);
    }
  }
  for (const pmid of [...pmids].slice(0, 4)) {
    push("PubMed", `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`, `PubMed article ${pmid}`);
  }
  // Plus a live PubMed search page for the query itself.
  push("PubMed", `https://pubmed.ncbi.nlm.nih.gov/?term=${qEnc}&size=20`, `PubMed search: ${q}`);

  // 2. Gene-centric sources for every gene symbol we detected.
  for (const gene of genes.slice(0, 3)) {
    const gEnc = encodeURIComponent(gene);
    push("Wikipedia", `https://en.wikipedia.org/wiki/${gEnc}_(gene)`, `${gene} — Wikipedia (gene)`);
    push("Wikipedia", `https://en.wikipedia.org/w/index.php?search=${gEnc}+protein+function`, `${gene} protein function — Wikipedia`);
    push("UniProt", `https://www.uniprot.org/uniprotkb?query=${gEnc}+AND+organism_id:9606`, `${gene} — UniProt human entries`);
    push("RCSB PDB", `https://www.rcsb.org/search?query=${gEnc}`, `${gene} — PDB structures`);
    push("ChEMBL", `https://www.ebi.ac.uk/chembl/g/#search_results/all/query=${gEnc}`, `${gene} — ChEMBL targets & compounds`);
    push("GeneCards", `https://www.genecards.org/cgi-bin/carddisp.pl?gene=${gEnc}`, `${gene} — GeneCards`);
  }

  // 3. If no gene detected, fall back to general scientific sources for the raw topic.
  if (links.length <= 1) {
    push("Wikipedia", `https://en.wikipedia.org/wiki/Special:Search?search=${qEnc}`, `${q} — Wikipedia`);
    push("UniProt", `https://www.uniprot.org/uniprotkb?query=${qEnc}`, `${q} — UniProt`);
    push("RCSB PDB", `https://www.rcsb.org/search?query=${qEnc}`, `${q} — PDB structures`);
    push("ChEMBL", `https://www.ebi.ac.uk/chembl/g/#search_results/all/query=${qEnc}`, `${q} — ChEMBL`);
  }

  // 4. ChEMBL: if a compound name is mentioned in the local drugs data, add its page.
  for (const hit of hits) {
    if (hit.collection === "nlpEntities" && (hit.detail.includes("DRUG") || hit.detail.includes("CHEMICAL"))) {
      push("ChEMBL", `https://www.ebi.ac.uk/chembl/g/#search_results/all/query=${encodeURIComponent(hit.label)}`, `${hit.label} — ChEMBL`);
    }
  }

  return links;
}

function tokenOverlap(a: string, b: string): number {
  const sa = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
  const sb = new Set(String(b).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
  let n = 0;
  for (const t of sa) if (sb.has(t)) n++;
  return n;
}
