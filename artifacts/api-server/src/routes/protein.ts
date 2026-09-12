import { Router } from "express";
import { fetchJson, fetchJsonOrNull } from "../lib/external";

const router = Router();

interface RcsbSearchResult {
  result_set?: Array<{ identifier: string; score: number }>;
  total_count?: number;
}

async function searchRcsbPdb(query: string, limit: number): Promise<RcsbSearchResult> {
  const searchQuery = {
    query: {
      type: "group",
      logical_operator: "or",
      nodes: [{ type: "terminal", service: "full_text", parameters: { value: query } }],
    },
    return_type: "entry",
    request_options: {
      paginate: { start: 0, rows: limit },
      results_content_type: ["experimental"],
      sort: [{ sort_by: "score", direction: "desc" }],
    },
  };

  return fetchJson<RcsbSearchResult>("https://search.rcsb.org/rcsbsearch/v2/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(searchQuery),
    timeoutMs: 15000,
  });
}

async function fetchPdbEntry(pdbId: string): Promise<Record<string, unknown> | null> {
  return fetchJsonOrNull<Record<string, unknown>>(
    `https://data.rcsb.org/rest/v1/core/entry/${pdbId.toUpperCase()}`,
    { timeoutMs: 10000 },
  );
}

function mapPdbEntryToProtein(entry: Record<string, unknown>) {
  const struct = entry.struct as Record<string, string> | undefined;
  const rcsb = entry.rcsb_entry_info as Record<string, unknown> | undefined;
  const exptl = (entry.exptl as Array<Record<string, string>> | undefined)?.[0];
  const polymer = (entry.polymer_entities as Array<Record<string, unknown>> | undefined) ?? [];
  const citations = ((entry.citation as Array<Record<string, unknown>> | undefined) ?? [])
    .filter((c) => c.pdbx_database_id_PubMed || c.pdbx_database_id_DOI)
    .slice(0, 5)
    .map((c) => ({
      title: (c.title as string) ?? "",
      journal: (c.rcsb_journal_abbrev as string) ?? (c.journal_abbrev as string) ?? "",
      year: (c.year as string) ?? null,
      pmid: c.pdbx_database_id_PubMed ? String(c.pdbx_database_id_PubMed) : null,
      doi: c.pdbx_database_id_DOI ? String(c.pdbx_database_id_DOI) : null,
    }));
  return {
    pdbId: (entry.rcsb_id as string) ?? (entry.entry as Record<string, string>)?.id ?? "",
    title: struct?.title ?? "",
    organism: (polymer[0]?.rcsb_entity_source_organism as Array<Record<string, string>> | undefined)?.[0]?.scientific_name ?? "",
    resolution: (rcsb?.resolution_combined as number[] | undefined)?.[0] ?? null,
    method: exptl?.method ?? "",
    depositionDate: (entry.rcsb_accession_info as Record<string, string> | undefined)?.deposit_date ?? "",
    releaseDate: (entry.rcsb_accession_info as Record<string, string> | undefined)?.initial_release_date ?? "",
    citationCount: (entry.rcsb_accession_info as Record<string, number> | undefined)?.citation_count ?? 0,
    citations,
    chains: (rcsb?.polymer_entity_count as number) ?? 0,
    atoms: (rcsb?.deposited_atom_count as number) ?? 0,
    ligands: ((entry.nonpolymer_entities as Array<Record<string, unknown>> | undefined) ?? [])
      .map((e) => (e.chem_comp as Record<string, string> | undefined)?.id ?? "")
      .filter(Boolean),
    pdbUrl: `https://www.rcsb.org/structure/${((entry.rcsb_id as string) ?? "").toUpperCase()}`,
  };
}

router.get("/protein/search", async (req, res, next) => {
  const { query, limit = "10" } = req.query as Record<string, string>;
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }
  try {
    const searchData = await searchRcsbPdb(query, parseInt(limit, 10) || 10);
    const pdbIds = (searchData.result_set ?? []).map((r) => r.identifier);
    const entries = await Promise.all(pdbIds.map(fetchPdbEntry));
    const proteins = entries.filter(Boolean).map((e) => mapPdbEntryToProtein(e as Record<string, unknown>));
    res.json({ proteins, total: searchData.total_count ?? proteins.length });
  } catch (err) {
    next(err);
  }
});

/**
 * Featured = most recently DEPOSITED experimental structures from RCSB
 * (live query, no hardcoded PDB id list).
 */
router.get("/protein/featured", async (_req, res, next) => {
  try {
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const searchQuery = {
      query: {
        type: "terminal",
        service: "text",
        parameters: { attribute: "rcsb_accession_info.deposit_date", operator: "greater", value: cutoff },
      },
      return_type: "entry",
      request_options: {
        paginate: { start: 0, rows: 12 },
        results_content_type: ["experimental"],
        sort: [{ sort_by: "rcsb_accession_info.deposit_date", direction: "desc" }],
      },
    };
    const searchData = await fetchJson<RcsbSearchResult>("https://search.rcsb.org/rcsbsearch/v2/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(searchQuery),
      timeoutMs: 15000,
    });
    const pdbIds = (searchData.result_set ?? []).map((r) => r.identifier);
    const entries = await Promise.all(pdbIds.map(fetchPdbEntry));
    const proteins = entries.filter(Boolean).map((e) => mapPdbEntryToProtein(e as Record<string, unknown>));
    res.json({ proteins, total: proteins.length });
  } catch (err) {
    next(err);
  }
});

/**
 * Related structures: members of the same RCSB sequence-identity cluster
 * (100% cluster preferred, falls back to 90%), with entity metadata.
 */
router.get("/protein/:pdbId/related", async (req, res, next) => {
  const { pdbId } = req.params;
  try {
    const upper = pdbId.toUpperCase();
    // Cluster membership lives on the per-entity endpoint
    // (/core/polymer_entity/{entry}/{entity}) — the list-style route 404s.
    const entry = await fetchPdbEntry(upper);
    const entityCount =
      ((entry?.rcsb_entry_info as Record<string, unknown> | undefined)?.polymer_entity_count as number) ?? 1;
    const entityIds = Array.from({ length: Math.min(entityCount, 4) }, (_, i) => i + 1);
    const entities = await Promise.all(
      entityIds.map((i) =>
        fetchJsonOrNull<Record<string, unknown>>(
          `https://data.rcsb.org/rest/v1/core/polymer_entity/${upper}/${i}`,
          { timeoutMs: 10000 },
        ),
      ),
    );
    const first = entities.find(Boolean);
    const memberships = (first?.rcsb_polymer_entity_group_membership as Array<Record<string, unknown>> | undefined) ?? [];
    const cluster =
      memberships.find((m) => m.similarity_cutoff === 100) ??
      memberships.find((m) => m.similarity_cutoff === 90) ??
      memberships[0];
    if (!cluster?.group_id) {
      res.json({ pdbId: upper, clusterId: null, related: [] });
      return;
    }
    const groupQuery = {
      query: {
        type: "group",
        logical_operator: "and",
        nodes: [
          {
            type: "terminal",
            service: "text",
            parameters: {
              attribute: "rcsb_polymer_entity_group_membership.group_id",
              operator: "exact_match",
              value: cluster.group_id,
            },
          },
        ],
      },
      return_type: "polymer_instance",
      request_options: { paginate: { start: 0, rows: 30 } },
    };
    const searchData = await fetchJson<{ result_set?: Array<{ identifier: string }> }>(
      "https://search.rcsb.org/rcsbsearch/v2/query",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(groupQuery),
        timeoutMs: 15000,
      },
    );
    // polymer_instance identifiers look like "1CRN.A"
    const relatedIds = [...new Set((searchData.result_set ?? []).map((r) => r.identifier.split(".")[0].toUpperCase()))]
      .filter((id) => id !== upper)
      .slice(0, 10);
    const entries = await Promise.all(relatedIds.map(fetchPdbEntry));
    const related = entries.filter(Boolean).map((e) => mapPdbEntryToProtein(e as Record<string, unknown>));
    res.json({
      pdbId: upper,
      clusterId: cluster.group_id,
      similarityCutoff: cluster.similarity_cutoff,
      related,
    });
  } catch (err) {
    next(err);
  }
});

async function fetchUniprotForPdb(pdbId: string): Promise<string | null> {
  const data = await fetchJsonOrNull<Record<string, Record<string, unknown>>>(
    `https://www.ebi.ac.uk/pdbe/api/mappings/uniprot/${pdbId.toLowerCase()}`,
    { timeoutMs: 8000 },
  );
  const entry = data?.[pdbId.toLowerCase()];
  if (!entry) return null;
  return Object.keys(entry.UniProt ?? {})[0] ?? null;
}

router.get("/protein/:pdbId/structure", async (req, res, next) => {
  const { pdbId } = req.params;
  const upper = pdbId.toUpperCase();
  try {
    const entry = await fetchPdbEntry(upper);
    if (!entry) {
      res.status(404).json({ error: "PDB entry not found" });
      return;
    }

    const struct = entry.struct as Record<string, string> | undefined;
    const rcsb = entry.rcsb_entry_info as Record<string, unknown> | undefined;
    const exptl = (entry.exptl as Array<Record<string, string>> | undefined)?.[0];
    const polymers = (entry.polymer_entities as Array<Record<string, unknown>> | undefined) ?? [];
    const accessions = entry.rcsb_accession_info as Record<string, unknown> | undefined;
    const citations = ((entry.citation as Array<Record<string, unknown>> | undefined) ?? [])
      .filter((c) => c.pdbx_database_id_PubMed || c.pdbx_database_id_DOI)
      .slice(0, 5)
      .map((c) => ({
        title: (c.title as string) ?? "",
        journal: (c.rcsb_journal_abbrev as string) ?? (c.journal_abbrev as string) ?? "",
        year: (c.year as string) ?? null,
        pmid: c.pdbx_database_id_PubMed ? String(c.pdbx_database_id_PubMed) : null,
        doi: c.pdbx_database_id_DOI ? String(c.pdbx_database_id_DOI) : null,
        pubmedUrl: c.pdbx_database_id_PubMed ? `https://pubmed.ncbi.nlm.nih.gov/${c.pdbx_database_id_PubMed}/` : null,
        doiUrl: c.pdbx_database_id_DOI ? `https://doi.org/${c.pdbx_database_id_DOI}` : null,
      }));

    const chains = polymers.flatMap((pe) => {
      const seq = (pe.entity_poly as Record<string, unknown> | undefined)?.pdbx_seq_one_letter_code_can as string ?? "";
      const chainIds =
        (((pe.rcsb_polymer_entity_container_identifiers as Record<string, unknown> | undefined)?.auth_asym_ids as string[]) ?? []);
      return chainIds.map((chainId) => ({
        chainId,
        sequence: seq.replace(/\s/g, "").slice(0, 200),
        length: seq.replace(/\s/g, "").length,
      }));
    });

    // Secondary structure from PDBe (helix/sheet residue ranges).
    const ssData = await fetchJsonOrNull<{
      [id: string]: { molecules: Array<{ chains: Array<{ chain_id: string; secondary_structure: { helices: unknown[]; sheets: unknown[] } }> }> };
    }>(`https://www.ebi.ac.uk/pdbe/api/pdb/entry/secondary_structure/${upper.toLowerCase()}`, { timeoutMs: 8000 });
    const ssEntry = ssData?.[upper.toLowerCase()];
    let helices = 0;
    let sheets = 0;
    for (const mol of ssEntry?.molecules ?? []) {
      for (const chain of mol.chains ?? []) {
        helices += chain.secondary_structure?.helices?.length ?? 0;
        sheets += chain.secondary_structure?.sheets?.length ?? 0;
      }
    }

    const bindingSites = ((entry.struct_sites as Array<Record<string, unknown>> | undefined) ?? []).map((s) => ({
      siteId: s.id as string,
      residues: ((s.residue_ids as number[] | undefined) ?? []).map(String),
      ligand: (s.pdbx_evidence_code as string) ?? "",
      details: (s.details as string) ?? "",
    }));

    const uniprotId = await fetchUniprotForPdb(upper);

    res.json({
      pdbId: upper,
      title: struct?.title ?? "",
      downloadUrl: `https://files.rcsb.org/download/${upper}.pdb`,
      cifUrl: `https://files.rcsb.org/download/${upper}.cif`,
      organism: (polymers[0]?.rcsb_entity_source_organism as Array<Record<string, string>> | undefined)?.[0]?.scientific_name ?? "",
      resolution: (rcsb?.resolution_combined as number[] | undefined)?.[0] ?? null,
      method: exptl?.method ?? "",
      chains,
      secondaryStructure: { helices, sheets },
      bindingSites,
      uniprotId,
      citations,
      citationCount: (accessions?.citation_count as number) ?? 0,
      rcsbUrl: `https://www.rcsb.org/structure/${upper}`,
      pdbeUrl: `https://www.ebi.ac.uk/pdbe/entry/pdb/${upper}`,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/protein/:pdbId/annotations", async (req, res, next) => {
  const { pdbId } = req.params;
  const upper = pdbId.toUpperCase();
  try {
    const uniprotId = await fetchUniprotForPdb(upper);
    if (!uniprotId) {
      res.json({ pdbId: upper, uniprotId: null, pdbeMappingsUrl: `https://www.ebi.ac.uk/pdbe/api/mappings/uniprot/${upper.toLowerCase()}` });
      return;
    }

    const upData = await fetchJson<Record<string, unknown>>(
      `https://rest.uniprot.org/uniprotkb/${uniprotId}?format=json`,
      { timeoutMs: 10000 },
    );
    const comments = (upData.comments as Array<Record<string, unknown>> | undefined) ?? [];
    const functionComment = comments.find((c) => c.commentType === "FUNCTION");
    const subcellComment = comments.find((c) => c.commentType === "SUBCELLULAR LOCATION");
    const diseaseComments = comments.filter((c) => c.commentType === "DISEASE");
    const ptmComment = comments.find((c) => c.commentType === "PTM");

    const genes = (upData.genes as Array<Record<string, unknown>> | undefined) ?? [];
    const geneName = (genes[0]?.geneName as Record<string, string> | undefined)?.value ?? "";

    const goTerms = ((upData.uniProtKBCrossReferences as Array<Record<string, unknown>> | undefined) ?? [])
      .filter((x) => x.database === "GO")
      .slice(0, 20)
      .map((x) => {
        const props = (x.properties as Array<Record<string, string>> | undefined) ?? [];
        const termProp = props.find((p) => p.key === "GoTerm");
        const termVal = termProp?.value ?? "";
        const [cat, ...rest] = termVal.split(":");
        return { id: x.id as string, term: rest.join(":").trim(), category: cat?.trim() ?? "" };
      });

    const diseases = diseaseComments.map((d) => ({
      name: ((d.disease as Record<string, unknown> | undefined)?.diseaseId as string) ?? "",
      description: ((d.texts as Array<Record<string, string>> | undefined)?.[0]?.value) ?? "",
    }));

    const subcellularLocation = ((subcellComment?.subcellularLocations as Array<Record<string, unknown>> | undefined) ?? [])
      .map((sl) => ((sl.location as Record<string, string> | undefined)?.value) ?? "")
      .filter(Boolean);

    const features = (upData.features as Array<Record<string, unknown>> | undefined) ?? [];
    const featureCounts: Record<string, number> = {};
    for (const f of features) {
      const t = String(f.type ?? "");
      featureCounts[t] = (featureCounts[t] ?? 0) + 1;
    }

    res.json({
      pdbId: upper,
      uniprotId,
      function: ((functionComment?.texts as Array<Record<string, string>> | undefined)?.[0]?.value) ?? "",
      gene: geneName,
      organism: (upData.organism as Record<string, string> | undefined)?.scientificName ?? "",
      subcellularLocation,
      goTerms,
      diseases,
      ptms: [((ptmComment?.texts as Array<Record<string, string>> | undefined)?.[0]?.value) ?? ""].filter(Boolean),
      sequenceLength: (upData.sequence as Record<string, unknown> | undefined)?.length ?? null,
      featureCounts: Object.entries(featureCounts).map(([type, count]) => ({ type, count })),
      uniprotUrl: `https://www.uniprot.org/uniprotkb/${uniprotId}/entry`,
      pdbeUrl: `https://www.ebi.ac.uk/pdbe/entry/pdb/${upper}`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
