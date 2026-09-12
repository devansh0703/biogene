// BM25 full-text search index over every in-memory collection. Documents are
// flat field maps (string/number/boolean/Date only) so the same index powers
// search, field:value filters, and facet counts.

import store, { type DataStore } from "../data";
import type { Row } from "../data/seed";

export interface IndexedDoc {
  id: string; // globally unique, e.g. "variants:seed-abc"
  collection: string;
  rowId: string;
  fields: Record<string, string | number | boolean | string[]>;
  text: string; // lowercased searchable text
  tokens: Map<string, number>; // term -> tf
  length: number;
}

const STOPWORDS = new Set(
  "a an and are as at be by for from has have in is it its of on or that the to was were will with".split(" "),
);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9@._:+-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function fieldToText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map((x) => String(x)).join(" ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export interface CollectionFieldSpec {
  /** Fields to tokenize into the BM25 body. */
  searchable: string[];
  /** Extra fields kept for filtering/facets/display but not tokenized. */
  metadata?: string[];
}

export const COLLECTION_SPECS: Record<string, CollectionFieldSpec> = {
  genomicsJobs: { searchable: ["filename", "status"], metadata: ["variantCount", "createdAt", "completedAt"] },
  variants: {
    searchable: ["gene", "consequence", "significance", "rsId", "chromosome"],
    metadata: ["position", "ref", "alt", "quality", "filter", "alleleFrequency", "jobId", "createdAt"],
  },
  crisprJobs: {
    searchable: ["geneName", "pamType", "status"],
    metadata: ["guidesCount", "sequenceLength", "createdAt"],
  },
  guideRnas: {
    searchable: ["sequence", "pamSequence", "strand"],
    metadata: ["position", "score", "gcContent", "offTargetScore", "selfComplementarity", "rank", "jobId", "gene", "createdAt"],
  },
  samples: {
    searchable: ["name", "type", "status", "organism", "tissue", "barcode", "notes"],
    metadata: ["concentration", "unit", "volume", "storageLocation", "createdAt", "updatedAt"],
  },
  experiments: {
    searchable: ["name", "type", "status", "protocol", "notes"],
    metadata: ["sampleIds", "startedAt", "completedAt", "createdAt", "updatedAt"],
  },
  nlpEntities: {
    searchable: ["entityText", "entityType", "normalizedId"],
    metadata: ["confidence", "sourceText", "createdAt"],
  },
  nlpRelations: {
    searchable: ["subjectText", "predicate", "objectText", "evidence"],
    metadata: ["confidence", "createdAt"],
  },
  transcriptomicsJobs: {
    searchable: ["name", "sampleType", "status", "referenceGenome"],
    metadata: ["readsCount", "genesDetected", "pairedEnd", "createdAt", "completedAt"],
  },
};

interface Bm25Stats {
  avgLen: number;
  docFreq: Map<string, number>; // term -> number of docs containing term
}

export class SearchIndex {
  private docs: IndexedDoc[] = [];
  private byId = new Map<string, IndexedDoc>();
  private byCollection = new Map<string, IndexedDoc[]>();
  private stats: Bm25Stats = { avgLen: 0, docFreq: new Map() };

  constructor(private readonly store: DataStore) {
    this.rebuild();
  }

  rebuild(): void {
    this.docs = [];
    this.byId.clear();
    this.byCollection.clear();
    for (const [collection, spec] of Object.entries(COLLECTION_SPECS)) {
      const rows = (this.store as unknown as Record<string, { all(): Row[] }>)[collection]?.all() ?? [];
      const list: IndexedDoc[] = [];
      for (const row of rows) {
        const rawRow = row as unknown as Record<string, unknown>;
        const fields: Record<string, string | number | boolean | string[]> = {};
        for (const key of [...spec.searchable, ...(spec.metadata ?? [])]) {
          const v = rawRow[key];
          if (v === undefined) continue;
          fields[key] =
            v instanceof Date ? v.toISOString() : Array.isArray(v) ? (v as unknown[]).map(String) : (v as string | number | boolean | string[]);
        }
        if (rawRow.jobId) fields["jobId"] = String(rawRow.jobId);
        if (rawRow.gene) fields["gene"] = String(rawRow.gene);
        const body = spec.searchable.map((f) => fieldToText(rawRow[f])).join(" ");
        const tokens = tokenize(body);
        const tf = new Map<string, number>();
        for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
        const doc: IndexedDoc = {
          id: `${collection}:${row.id}`,
          collection,
          rowId: row.id,
          fields,
          text: body,
          tokens: tf,
          length: tokens.length,
        };
        list.push(doc);
        this.byId.set(doc.id, doc);
      }
      this.byCollection.set(collection, list);
      this.docs.push(...list);
    }
    // BM25 corpus statistics
    const docFreq = new Map<string, number>();
    let totalLen = 0;
    for (const d of this.docs) {
      totalLen += d.length;
      for (const term of d.tokens.keys()) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
    this.stats = { avgLen: this.docs.length ? totalLen / this.docs.length : 0, docFreq };
  }

  /**
   * Parse a query supporting free text plus field:value filters
   * (e.g. `BRCA1 significance:pathogenic`). Bare terms are BM25-scored;
   * field terms narrow the candidate set. Returns scored docs.
   */
  search(query: string, opts: { collections?: string[]; limit?: number; offset?: number } = {}): {
    total: number;
    results: Array<{ doc: IndexedDoc; score: number; snippet: string }>;
  } {
    const { collections, limit = 20, offset = 0 } = opts;
    const terms: string[] = [];
    const fieldTerms: Array<{ field: string; value: string }> = [];
    for (const raw of query.split(/\s+/)) {
      if (!raw) continue;
      const m = raw.match(/^([a-zA-Z_]+):(.+)$/);
      if (m && (COLLECTION_SPECS as Record<string, CollectionFieldSpec>) && this.hasField(m[1])) {
        fieldTerms.push({ field: m[1], value: m[2].toLowerCase() });
      } else {
        terms.push(...tokenize(raw));
      }
    }

    let candidates = collections?.length ? collections.flatMap((c) => this.byCollection.get(c) ?? []) : this.docs;
    for (const ft of fieldTerms) {
      candidates = candidates.filter((d) => {
        const v = d.fields[ft.field];
        if (v == null) return false;
        return Array.isArray(v) ? v.some((x) => String(x).toLowerCase().includes(ft.value)) : String(v).toLowerCase().includes(ft.value);
      });
    }

    const k1 = 1.5;
    const b = 0.75;
    const N = this.docs.length;
    const scored: Array<{ doc: IndexedDoc; score: number }> = [];
    for (const doc of candidates) {
      let score = 0;
      for (const term of terms) {
        const tf = doc.tokens.get(term) ?? 0;
        if (!tf) continue;
        const df = this.stats.docFreq.get(term) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const norm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (doc.length / (this.stats.avgLen || 1))));
        score += idf * norm;
      }
      // Pure field:value queries (no free-text terms) must still return matches.
      if (score > 0 || terms.length === 0) scored.push({ doc, score });
    }
    scored.sort((x, y) => y.score - x.score || x.doc.id.localeCompare(y.doc.id));

    const total = scored.length;
    const results = scored.slice(offset, offset + limit).map(({ doc, score }) => ({
      doc,
      score: Math.round(score * 1000) / 1000,
      snippet: this.snippet(doc, terms),
    }));
    return { total, results };
  }

  private hasField(field: string): boolean {
    return Object.values(COLLECTION_SPECS).some(
      (s) => s.searchable.includes(field) || (s.metadata ?? []).includes(field),
    );
  }

  private snippet(doc: IndexedDoc, terms: string[]): string {
    const text = doc.text;
    if (!terms.length) return text.slice(0, 140);
    for (const term of terms) {
      const idx = text.indexOf(term);
      if (idx >= 0) {
        const start = Math.max(0, idx - 40);
        return (start > 0 ? "…" : "") + text.slice(start, idx + 100) + (idx + 100 < text.length ? "…" : "");
      }
    }
    return text.slice(0, 140);
  }

  /** Facet counts for a field across the (optionally filtered) corpus. */
  facets(field: string, opts: { collections?: string[]; query?: string } = {}): Array<{ key: string; count: number }> {
    let docs = opts.collections?.length ? opts.collections.flatMap((c) => this.byCollection.get(c) ?? []) : this.docs;
    if (opts.query) {
      const { results } = this.search(opts.query, { collections: opts.collections, limit: Number.MAX_SAFE_INTEGER });
      docs = results.map((r) => r.doc);
    }
    const map = new Map<string, number>();
    for (const d of docs) {
      const v = d.fields[field];
      let keys: string[];
      if (v == null) keys = ["(none)"];
      else if (Array.isArray(v)) keys = v.map(String);
      else if (field.endsWith("At")) keys = [String(v).slice(0, 10)]; // date -> day bucket
      else keys = [String(v)];
      for (const k of keys) map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  }

  collections(): string[] {
    return [...this.byCollection.keys()];
  }

  docCount(collection?: string): number {
    return collection ? (this.byCollection.get(collection)?.length ?? 0) : this.docs.length;
  }

  getDoc(rowId: string, collection: string): IndexedDoc | undefined {
    return this.byId.get(`${collection}:${rowId}`);
  }
}

let singleton: SearchIndex | null = null;

export function getSearchIndex(): SearchIndex {
  if (!singleton) singleton = new SearchIndex(store);
  return singleton;
}

/** Invalidate cached search results after a mutation. Cheap full rebuild. */
export function reindex(): void {
  if (singleton) singleton.rebuild();
}
