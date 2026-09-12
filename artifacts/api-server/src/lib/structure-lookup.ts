// Resolves a plausible 3D structure for a chat topic by searching the RCSB
// PDB for the topic title (falls back to any gene symbols detected).

const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

interface RcsbSearchHit {
  identifier: string;
  score: number;
}

interface RcsbEntry {
  struct?: { title?: string };
  rcsb_polymer_entity_container_identifiers?: { uniprot_ids?: string[] };
}

export interface TopicStructure {
  pdbId: string;
  title: string;
  uniprot?: string;
}

/** RCSB full-text search → best hit entry metadata. */
export async function resolvePdbForTopic(topic: string): Promise<TopicStructure | null> {
  try {
    const searchRes = await fetch("https://search.rcsb.org/rcsbsearch/v2/query", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": BROWSER_UA },
      body: JSON.stringify({
        query: {
          type: "terminal",
          service: "full_text",
          parameters: { value: topic },
        },
        request_options: { results_content_type: ["experimental"], paginate: { start: 0, rows: 5 } },
        return_type: "entry",
      }),
    });
    if (!searchRes.ok) return null;
    const search = (await searchRes.json()) as { result_set?: RcsbSearchHit[] };
    const hits = (search.result_set ?? []).map((h) => h.identifier).filter(Boolean);
    if (hits.length === 0) return null;

    const ids = hits.slice(0, 3).join(",");
    const entryRes = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${ids.split(",")[0]}`, {
      headers: { Accept: "application/json", "User-Agent": BROWSER_UA },
    });
    if (!entryRes.ok) return null;
    const entry = (await entryRes.json()) as RcsbEntry;
    return {
      pdbId: hits[0],
      title: entry.struct?.title ?? hits[0],
      uniprot: entry.rcsb_polymer_entity_container_identifiers?.uniprot_ids?.[0],
    };
  } catch {
    return null;
  }
}
