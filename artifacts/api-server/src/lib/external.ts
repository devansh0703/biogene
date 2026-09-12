// Shared helpers for calling external scientific APIs. Every upstream call
// goes through `fetchJson` (timeout + bounded retry) so flaky upstreams
// (e.g. Ensembl) do not take down a whole route.

export const JSON_HEADERS = { Accept: "application/json" } as const;

export class UpstreamError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function fetchJson<T = unknown>(
  url: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    retries?: number;
  } = {},
): Promise<T> {
  const { method = "GET", headers = {}, body, timeoutMs = 15000, retries = 1 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        // Retry only on transient upstream failures (429/5xx).
        if (res.status >= 500 || res.status === 429) {
          lastErr = new UpstreamError(`Upstream ${res.status} for ${url}`, 502);
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
            continue;
          }
          throw lastErr;
        }
        throw new UpstreamError(`Upstream ${res.status} for ${url}`, res.status === 404 ? 404 : 502);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (err instanceof UpstreamError && err.status !== 502) throw err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr instanceof Error ? lastErr : new UpstreamError(`Upstream failed for ${url}`);
}

export async function fetchJsonOrNull<T = unknown>(
  url: string,
  opts?: Parameters<typeof fetchJson>[1],
): Promise<T | null> {
  try {
    return await fetchJson<T>(url, opts);
  } catch {
    return null;
  }
}

/** Fetch a plain-text body (e.g. PDB/SDF/FASTA files) with timeout + retries. */
export async function fetchText(url: string, timeoutMs = 20000): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new UpstreamError(`Upstream ${res.status} for ${url}`, res.status === 404 ? 404 : 502);
  return res.text();
}

export async function fetchTextOrNull(url: string, timeoutMs?: number): Promise<string | null> {
  try {
    return await fetchText(url, timeoutMs);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Ensembl species — no hardcoded species maps. Resolved live from Ensembl and
// cached in-process.
// ---------------------------------------------------------------------------

export interface EnsemblSpecies {
  name: string; // e.g. homo_sapiens
  display_name: string;
  common_name: string | null;
  groups: string[];
  strain_collection?: string;
}

let speciesCache: EnsemblSpecies[] | null = null;
let speciesCacheAt = 0;
const SPECIES_TTL = 24 * 60 * 60 * 1000;

export async function getEnsemblSpecies(): Promise<EnsemblSpecies[]> {
  if (speciesCache && Date.now() - speciesCacheAt < SPECIES_TTL) return speciesCache;
  const data = await fetchJson<{ species: EnsemblSpecies[] }>(
    "https://rest.ensembl.org/info/species?content-type=application/json",
    { timeoutMs: 20000, retries: 2 },
  );
  speciesCache = data.species ?? [];
  speciesCacheAt = Date.now();
  return speciesCache;
}

/**
 * Resolve a user-provided species name (common or scientific, any case,
 * spaces/underscores) against the live Ensembl species list. Returns the
 * Ensembl species slug or null when unknown.
 */
export async function resolveEnsemblSpecies(input: string | undefined | null): Promise<string | null> {
  if (!input) return null;
  const species = await getEnsemblSpecies();
  const norm = (s: string) => s.toLowerCase().trim().replace(/[\s_]+/g, " ");
  const q = norm(input);
  // direct slug match ("homo sapiens" <-> "homo_sapiens")
  const slug = q.replace(/ /g, "_");
  const exact = species.find((s) => s.name === slug);
  if (exact) return exact.name;
  // common name match ("human" -> "homo sapiens")
  const byCommon = species.find((s) => norm(s.common_name ?? "") === q);
  if (byCommon) return byCommon.name;
  const byDisplay = species.find((s) => norm(s.display_name) === q);
  if (byDisplay) return byDisplay.name;
  // unique prefix match on slug
  const prefix = species.filter((s) => s.name.startsWith(q.replace(/ /g, "_")));
  if (prefix.length === 1) return prefix[0].name;
  return null;
}
