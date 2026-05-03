import { Router } from "express";

const router = Router();

const CHEMBL_BASE = "https://www.ebi.ac.uk/chembl/api/data";

async function chemblGet(path: string) {
  const res = await fetch(`${CHEMBL_BASE}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`ChEMBL request failed: ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

function mapMolecule(m: Record<string, unknown>) {
  const props = m.molecule_properties as Record<string, unknown> | null;
  const synonyms = (m.molecule_synonyms as Array<Record<string, string>> | null) ?? [];
  return {
    chemblId: m.molecule_chembl_id as string,
    name: (m.pref_name as string) ?? (synonyms[0]?.molecule_synonym ?? ""),
    synonyms: synonyms.slice(0, 5).map((s) => s.molecule_synonym ?? "").filter(Boolean),
    smiles: (m.molecule_structures as Record<string, string> | null)?.canonical_smiles ?? null,
    inchi: (m.molecule_structures as Record<string, string> | null)?.standard_inchi ?? null,
    molecularFormula: props?.full_molformula as string ?? null,
    molecularWeight: props?.full_mwt as number ?? null,
    alogp: props?.alogp as number ?? null,
    hbondDonors: props?.hbd_count as number ?? null,
    hbondAcceptors: props?.hba_count as number ?? null,
    rotatableBonds: props?.rtb as number ?? null,
    aromaticRings: props?.aromatic_rings as number ?? null,
    qedScore: props?.qed_weighted as number ?? null,
    maxPhase: m.max_phase as number ?? null,
    indication: m.indication_class as string ?? null,
    atcClass: null,
  };
}

router.get("/drugs/search", async (req, res) => {
  const { query, limit = "20" } = req.query as Record<string, string>;
  if (!query) { res.status(400).json({ error: "query is required" }); return; }

  try {
    const data = await chemblGet(
      `/molecule/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=0`
    );
    const molecules = (data.molecules as Array<Record<string, unknown>>) ?? [];
    res.json({
      compounds: molecules.map(mapMolecule),
      total: (data.page_meta as Record<string, number> | undefined)?.total_count ?? molecules.length,
      query,
    });
  } catch {
    res.status(502).json({ error: "Failed to reach ChEMBL" });
  }
});

router.get("/drugs/targets/search", async (req, res) => {
  const { query, limit = "10" } = req.query as Record<string, string>;
  if (!query) { res.status(400).json({ error: "query is required" }); return; }

  try {
    const data = await chemblGet(
      `/target/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=0`
    );
    const targets = (data.targets as Array<Record<string, unknown>>) ?? [];
    const mapped = targets.map((t) => ({
      targetChemblId: t.target_chembl_id as string,
      targetName: t.pref_name as string,
      targetType: t.target_type as string,
      organism: t.organism as string ?? "",
      geneNames: ((t.target_components as Array<Record<string, unknown>> | null) ?? [])
        .flatMap((tc) =>
          ((tc.target_component_synonyms as Array<Record<string, string>> | null) ?? [])
            .filter((s) => s.syn_type === "GENE_SYMBOL")
            .map((s) => s.component_synonym)
        ).filter(Boolean),
      uniprotId: ((t.target_components as Array<Record<string, unknown>> | null) ?? [])
        .flatMap((tc) =>
          ((tc.target_component_synonyms as Array<Record<string, string>> | null) ?? [])
            .filter((s) => s.syn_type === "UNIPROT")
            .map((s) => s.component_synonym)
        )[0] ?? null,
    }));
    res.json({ targets: mapped, total: mapped.length });
  } catch {
    res.status(502).json({ error: "Failed to reach ChEMBL" });
  }
});

router.get("/drugs/:chemblId", async (req, res) => {
  const { chemblId } = req.params;
  try {
    const data = await chemblGet(`/molecule/${chemblId.toUpperCase()}`);
    res.json(mapMolecule(data));
  } catch {
    res.status(502).json({ error: "Failed to reach ChEMBL" });
  }
});

router.get("/drugs/:chemblId/activities", async (req, res) => {
  const { chemblId } = req.params;
  const { limit = "20" } = req.query as Record<string, string>;
  try {
    const data = await chemblGet(
      `/activity?molecule_chembl_id=${chemblId.toUpperCase()}&limit=${limit}&offset=0`
    );
    const activities = (data.activities as Array<Record<string, unknown>>) ?? [];
    const mapped = activities.map((a) => ({
      activityId: a.activity_id as string,
      targetName: a.target_pref_name as string ?? "",
      targetChemblId: a.target_chembl_id as string ?? "",
      standardType: a.standard_type as string ?? "",
      standardValue: a.standard_value as number ?? null,
      standardUnits: a.standard_units as string ?? "",
      relation: a.standard_relation as string ?? "=",
      assayType: a.assay_type as string ?? "",
      pchembl: a.pchembl_value as number ?? null,
    }));
    res.json({
      chemblId: chemblId.toUpperCase(),
      activities: mapped,
      total: (data.page_meta as Record<string, number> | undefined)?.total_count ?? mapped.length,
    });
  } catch {
    res.status(502).json({ error: "Failed to reach ChEMBL" });
  }
});

router.get("/drugs/dashboard/stats", async (_req, res) => {
  try {
    const [approvedRes, targetRes] = await Promise.all([
      chemblGet("/molecule?max_phase=4&limit=1").catch(() => null),
      chemblGet("/target?limit=1").catch(() => null),
    ]);

    res.json({
      totalCompoundsSearched: 0,
      approvedDrugs: (approvedRes?.page_meta as Record<string, number> | undefined)?.total_count ?? 0,
      uniqueTargets: (targetRes?.page_meta as Record<string, number> | undefined)?.total_count ?? 0,
      recentSearches: [],
      topIndications: [
        { indication: "Antineoplastic", count: 0 },
        { indication: "Cardiovascular", count: 0 },
        { indication: "Anti-infective", count: 0 },
      ],
    });
  } catch {
    res.json({
      totalCompoundsSearched: 0,
      approvedDrugs: 0,
      uniqueTargets: 0,
      recentSearches: [],
      topIndications: [],
    });
  }
});

export default router;
