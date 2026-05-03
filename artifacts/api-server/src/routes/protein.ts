import { Router } from "express";

const router = Router();

async function searchRcsbPdb(query: string, limit: number) {
  const searchQuery = {
    query: {
      type: "group",
      logical_operator: "or",
      nodes: [
        { type: "terminal", service: "full_text", parameters: { value: query } },
      ],
    },
    return_type: "entry",
    request_options: {
      paginate: { start: 0, rows: limit },
      results_content_type: ["experimental"],
      sort: [{ sort_by: "score", direction: "desc" }],
    },
  };

  const searchRes = await fetch("https://search.rcsb.org/rcsbsearch/v2/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(searchQuery),
    signal: AbortSignal.timeout(10000),
  });

  if (!searchRes.ok) return { result_set: [] };
  return searchRes.json() as Promise<{ result_set: Array<{ identifier: string; score: number }> }>;
}

async function fetchPdbEntry(pdbId: string) {
  const url = `https://data.rcsb.org/rest/v1/core/entry/${pdbId.toUpperCase()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, unknown>>;
}

async function fetchUniprotForPdb(pdbId: string) {
  try {
    const url = `https://www.ebi.ac.uk/pdbe/api/mappings/uniprot/${pdbId.toLowerCase()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, Record<string, unknown>>;
    const entry = data[pdbId.toLowerCase()];
    if (!entry) return null;
    const uniprotId = Object.keys(entry.UniProt ?? {})[0];
    return uniprotId ?? null;
  } catch { return null; }
}

function mapPdbEntryToProtein(entry: Record<string, unknown>) {
  const struct = entry.struct as Record<string, string> | undefined;
  const rcsb = entry.rcsb_entry_info as Record<string, unknown> | undefined;
  const exptl = (entry.exptl as Array<Record<string, string>> | undefined)?.[0];
  const polymer = (entry.polymer_entities as Array<Record<string, unknown>> | undefined) ?? [];
  return {
    pdbId: (entry.entry as Record<string, string>)?.id ?? "",
    title: struct?.title ?? "",
    organism: (polymer[0]?.rcsb_entity_source_organism as Array<Record<string, string>> | undefined)?.[0]?.scientific_name ?? "",
    resolution: (rcsb?.resolution_combined as number[] | undefined)?.[0] ?? null,
    method: exptl?.method ?? "",
    depositionDate: (entry.rcsb_accession_info as Record<string, string> | undefined)?.deposit_date ?? "",
    chains: (rcsb?.polymer_entity_count as number) ?? 0,
    atoms: (rcsb?.deposited_atom_count as number) ?? 0,
    ligands: ((entry.nonpolymer_entities as Array<Record<string, unknown>> | undefined) ?? [])
      .map((e) => (e.chem_comp as Record<string, string> | undefined)?.id ?? "").filter(Boolean),
  };
}

router.get("/protein/search", async (req, res) => {
  const { query, limit = "10" } = req.query as Record<string, string>;
  if (!query) { res.status(400).json({ error: "query is required" }); return; }

  try {
    const searchData = await searchRcsbPdb(query, parseInt(limit));
    const pdbIds = (searchData.result_set ?? []).map((r) => r.identifier);

    const entries = await Promise.all(pdbIds.map(fetchPdbEntry));
    const proteins = entries
      .filter(Boolean)
      .map((e) => mapPdbEntryToProtein(e as Record<string, unknown>));

    res.json({ proteins, total: proteins.length });
  } catch (err) {
    res.status(502).json({ error: "Failed to reach RCSB PDB" });
  }
});

router.get("/protein/featured", async (_req, res) => {
  const featuredIds = ["1TIM", "4HHB", "1GZX", "2HHB", "3NIR", "6LU7", "1CRN", "4ZQK", "1UBQ", "2VGB"];
  try {
    const entries = await Promise.all(featuredIds.map(fetchPdbEntry));
    const proteins = entries
      .filter(Boolean)
      .map((e) => mapPdbEntryToProtein(e as Record<string, unknown>));
    res.json({ proteins, total: proteins.length });
  } catch {
    res.status(502).json({ error: "Failed to reach RCSB PDB" });
  }
});

router.get("/protein/:pdbId/structure", async (req, res) => {
  const { pdbId } = req.params;
  try {
    const entry = await fetchPdbEntry(pdbId);
    if (!entry) { res.status(404).json({ error: "PDB entry not found" }); return; }

    const struct = entry.struct as Record<string, string> | undefined;
    const rcsb = entry.rcsb_entry_info as Record<string, unknown> | undefined;
    const exptl = (entry.exptl as Array<Record<string, string>> | undefined)?.[0];
    const polymers = (entry.polymer_entities as Array<Record<string, unknown>> | undefined) ?? [];

    const chains = polymers.flatMap((pe) => {
      const instances = (pe.entity_poly as Record<string, unknown> | undefined);
      const seq = instances?.pdbx_seq_one_letter_code_can as string ?? "";
      const chainIds = ((pe.rcsb_polymer_entity_container_identifiers as Record<string, unknown> | undefined)
        ?.auth_asym_ids as string[]) ?? [];
      return chainIds.map((chainId) => ({ chainId, sequence: seq.slice(0, 200), length: seq.length }));
    });

    const bindingSites = ((entry.struct_sites as Array<Record<string, unknown>> | undefined) ?? []).map((s) => ({
      siteId: s.id as string,
      residues: [],
      ligand: s.pdbx_evidence_code as string ?? "",
    }));

    const cifUrl = `https://files.rcsb.org/download/${pdbId.toUpperCase()}.cif`;
    const downloadUrl = `https://files.rcsb.org/download/${pdbId.toUpperCase()}.pdb`;

    res.json({
      pdbId: pdbId.toUpperCase(),
      title: struct?.title ?? "",
      downloadUrl,
      cifUrl,
      organism: (polymers[0]?.rcsb_entity_source_organism as Array<Record<string, string>> | undefined)?.[0]?.scientific_name ?? "",
      resolution: (rcsb?.resolution_combined as number[] | undefined)?.[0] ?? null,
      method: exptl?.method ?? "",
      chains,
      secondaryStructure: { helices: 0, sheets: 0 },
      bindingSites,
    });
  } catch {
    res.status(502).json({ error: "Failed to reach RCSB PDB" });
  }
});

router.get("/protein/:pdbId/annotations", async (req, res) => {
  const { pdbId } = req.params;
  try {
    const uniprotId = await fetchUniprotForPdb(pdbId);
    if (!uniprotId) {
      res.json({ pdbId: pdbId.toUpperCase() });
      return;
    }

    const uniprotUrl = `https://rest.uniprot.org/uniprotkb/${uniprotId}?format=json`;
    const uniprotRes = await fetch(uniprotUrl, { signal: AbortSignal.timeout(8000) });
    if (!uniprotRes.ok) { res.json({ pdbId: pdbId.toUpperCase(), uniprotId }); return; }

    const upData = await uniprotRes.json() as Record<string, unknown>;
    const comments = (upData.comments as Array<Record<string, unknown>> | undefined) ?? [];
    const functionComment = comments.find((c) => c.commentType === "FUNCTION");
    const subcellComment = comments.find((c) => c.commentType === "SUBCELLULAR LOCATION");
    const diseaseComments = comments.filter((c) => c.commentType === "DISEASE");

    const genes = (upData.genes as Array<Record<string, unknown>> | undefined) ?? [];
    const geneName = (genes[0]?.geneName as Record<string, string> | undefined)?.value ?? "";

    const goTerms = ((upData.uniProtKBCrossReferences as Array<Record<string, unknown>> | undefined) ?? [])
      .filter((x) => x.database === "GO")
      .slice(0, 20)
      .map((x) => {
        const props = (x.properties as Array<Record<string, string>> | undefined) ?? [];
        const termProp = props.find((p) => p.key === "GoTerm");
        const aspectProp = props.find((p) => p.key === "GoEvidenceType");
        const termVal = termProp?.value ?? "";
        const [cat, ...rest] = termVal.split(":");
        return { id: x.id as string, term: rest.join(":").trim(), category: cat?.trim() ?? "" };
      });

    const diseases = diseaseComments.map((d) => ({
      name: ((d.disease as Record<string, unknown> | undefined)?.diseaseId as string) ?? "",
      description: ((d.texts as Array<Record<string, string>> | undefined)?.[0]?.value) ?? "",
    }));

    const subcellularLocation = ((subcellComment?.subcellularLocations as Array<Record<string, unknown>> | undefined) ?? [])
      .map((sl) => (((sl.location as Record<string, string> | undefined)?.value) ?? ""))
      .filter(Boolean);

    res.json({
      pdbId: pdbId.toUpperCase(),
      uniprotId,
      function: ((functionComment?.texts as Array<Record<string, string>> | undefined)?.[0]?.value) ?? "",
      gene: geneName,
      organism: (upData.organism as Record<string, string> | undefined)?.scientificName ?? "",
      subcellularLocation,
      goTerms,
      diseases,
      ptms: [],
    });
  } catch {
    res.status(502).json({ error: "Failed to reach UniProt" });
  }
});

export default router;
