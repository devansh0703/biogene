// In-memory data store powering the demo API. Replaces live Postgres so the
// app is fully runnable and loads real content out of the box.

import { seed, uid, type Row } from "./seed";

type RowMap = Record<string, Row>;

class Collection<T extends Row> {
  private rows: RowMap = {};
  private order: string[] = [];

  constructor(rows: T[]) {
    for (const r of rows) {
      this.rows[r.id] = r;
      this.order.push(r.id);
    }
  }

  all(): T[] {
    return this.order.map((id) => this.rows[id] as T);
  }

  find(id: string): T | undefined {
    return this.rows[id] as T | undefined;
  }

  insert(row: T | T[]): void {
    const list = Array.isArray(row) ? row : [row];
    for (const r of list) {
      if (!this.rows[r.id]) this.order.push(r.id);
      this.rows[r.id] = r;
    }
  }

  update(id: string, patch: Partial<T>): T | undefined {
    const existing = this.rows[id] as T | undefined;
    if (!existing) return undefined;
    const next = { ...existing, ...patch, updatedAt: new Date() } as T;
    this.rows[id] = next;
    return next;
  }

  remove(id: string): boolean {
    if (!this.rows[id]) return false;
    delete this.rows[id];
    this.order = this.order.filter((x) => x !== id);
    return true;
  }

  where(pred: (row: T) => boolean): T[] {
    return this.order.map((id) => this.rows[id] as T).filter(pred);
  }

  count(): number {
    return this.order.length;
  }

  countBy(field: string): Array<{ key: string; count: number }> {
    const map: Record<string, number> = {};
    for (const id of this.order) {
      const v = (this.rows[id] as unknown as Record<string, unknown>)[field];
      const key = v == null ? "unknown" : String(v);
      map[key] = (map[key] ?? 0) + 1;
    }
    return Object.entries(map).map(([key, count]) => ({ key, count }));
  }
}

function buildCollections() {
  const genomicsJobs = seed.genomicsJobs;
  const variantRows = seed.variants.map((v, i) => ({
    ...v,
    jobId: genomicsJobs[i % 2].id,
  }));
  const crisprJobs = seed.crisprJobs;
  const guideRows = seed.guideRnas.map((g, i) => ({
    ...g,
    jobId: crisprJobs[i % 2].id,
  }));
  const samples = seed.samples;
  const experiments = seed.experiments;
  const entities = seed.nlpEntities;
  const relations = seed.nlpRelations;
  const tjobs = seed.transcriptomicsJobs;

  return {
    genomicsJobs: new Collection(genomicsJobs),
    variants: new Collection(variantRows),
    crisprJobs: new Collection(crisprJobs),
    guideRnas: new Collection(guideRows),
    samples: new Collection(samples),
    experiments: new Collection(experiments),
    nlpEntities: new Collection(entities),
    nlpRelations: new Collection(relations),
    transcriptomicsJobs: new Collection(tjobs),
  };
}

const store = buildCollections();

export type DataStore = typeof store;
export default store;
export { uid };
