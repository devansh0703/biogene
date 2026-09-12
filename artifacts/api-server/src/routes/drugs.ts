import { Router } from "express";
import { fetchJson, fetchJsonOrNull } from "../lib/external";
import { fetchTextOrNull } from "../lib/external";

const router = Router();

const CHEMBL_BASE = "https://www.ebi.ac.uk/chembl/api/data";

interface ChembloMolecule {
  molecule_chembl_id: string;
  pref_name: string | null;
  molecule_synonyms?: Array<{ molecule_synonym: string; syn_type?: string }> | null;
  molecule_structures?: { canonical_smiles: string | null; standard_inchi: string | null } | null;
  molecule_properties?: {
    full_molformula?: string;
    full_mwt?: string;
    alogp?: string;
    hbd_count?: number;
    hba_count?: number;
    rtb?: number;
    aromatic_rings?: number;
    qed_weighted?: string;
    ro5_violations?: number;
    cx_logp?: string;
    psa?: string;
  } | null;
  max_phase?: number | null;
  indication_class?: string | null;
  atc_classifications?: string[] | null;
  first_approval?: number | null;
  therapeutic_flag?: boolean;
  dosed_ingredient?: boolean;
  molecule_type?: string;
}

function num(v: string | number | undefined | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function mapMolecule(m: ChembloMolecule) {
  const props = m.molecule_properties ?? null;
  const synonyms = (m.molecule_synonyms ?? []).filter((s) => s.molecule_synonym).map((s) => s.molecule_synonym);
  return {
    chemblId: m.molecule_chembl_id,
    name: m.pref_name ?? synonyms[0] ?? "",
    synonyms: synonyms.slice(0, 6),
    smiles: m.molecule_structures?.canonical_smiles ?? null,
    inchi: m.molecule_structures?.standard_inchi ?? null,
    molecularFormula: props?.full_molformula ?? null,
    molecularWeight: num(props?.full_mwt),
    alogp: num(props?.alogp),
    hbondDonors: props?.hbd_count ?? null,
    hbondAcceptors: props?.hba_count ?? null,
    rotatableBonds: props?.rtb ?? null,
    aromaticRings: props?.aromatic_rings ?? null,
    qedScore: num(props?.qed_weighted),
    ro5Violations: props?.ro5_violations ?? null,
    psa: num(props?.psa),
    maxPhase: m.max_phase ?? null,
    indication: m.indication_class ?? null,
    atcClass: m.atc_classifications?.[0] ?? null,
    atcClasses: m.atc_classifications ?? [],
    firstApproval: m.first_approval ?? null,
    moleculeType: m.molecule_type ?? null,
    chemblUrl: `https://www.ebi.ac.uk/chembl/compound_report_card/${m.molecule_chembl_id}/`,
    pubchemUrl: m.molecule_structures?.canonical_smiles
      ? `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(m.molecule_structures.canonical_smiles)}`
      : null,
  };
}

async function chemblGet(path: string, timeoutMs = 15000) {
  return fetchJson<Record<string, unknown>>(`${CHEMBL_BASE}${path}`, {
    headers: { Accept: "application/json" },
    timeoutMs,
  });
}

router.get("/drugs/search", async (req, res, next) => {
  const { query, limit = "20" } = req.query as Record<string, string>;
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }
  try {
    const data = await chemblGet(`/molecule/search?q=${encodeURIComponent(query)}&limit=${Math.min(50, parseInt(limit, 10) || 20)}&offset=0`);
    const molecules = (data.molecules as unknown as ChembloMolecule[]) ?? [];
    res.json({
      compounds: molecules.map(mapMolecule),
      total: ((data.page_meta as Record<string, number> | undefined)?.total_count) ?? molecules.length,
      query,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/drugs/targets/search", async (req, res, next) => {
  const { query, limit = "10" } = req.query as Record<string, string>;
  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }
  try {
    const data = await chemblGet(`/target/search?q=${encodeURIComponent(query)}&limit=${Math.min(30, parseInt(limit, 10) || 10)}&offset=0`);
    interface ChEmblTarget {
      target_chembl_id: string;
      pref_name: string | null;
      target_type: string | null;
      organism: string | null;
      target_components?: Array<{
        target_component_synonyms?: Array<{ syn_type: string; component_synonym: string }>;
      }> | null;
    }
    const targets = (data.targets as unknown as ChEmblTarget[]) ?? [];
    const mapped = targets.map((t) => {
      const comps = t.target_components ?? [];
      const geneNames = comps
        .flatMap((tc) => (tc.target_component_synonyms ?? []).filter((s) => s.syn_type === "GENE_SYMBOL").map((s) => s.component_synonym))
        .filter(Boolean);
      const uniprotId =
        comps
          .flatMap((tc) => (tc.target_component_synonyms ?? []).filter((s) => s.syn_type === "UNIPROT").map((s) => s.component_synonym))[0] ?? null;
      return {
        targetChemblId: t.target_chembl_id,
        targetName: t.pref_name ?? "",
        targetType: t.target_type ?? "",
        organism: t.organism ?? "",
        geneNames,
        uniprotId,
        chemblUrl: `https://www.ebi.ac.uk/chembl/target_report_card/${t.target_chembl_id}/`,
        uniprotUrl: uniprotId ? `https://www.uniprot.org/uniprotkb/${uniprotId}/entry` : null,
      };
    });
    res.json({ targets: mapped, total: ((data.page_meta as Record<string, number> | undefined)?.total_count) ?? mapped.length });
  } catch (err) {
    next(err);
  }
});

router.get("/drugs/dashboard/stats", async (_req, res, next) => {
  try {
    const [approvedRes, targetRes, indications] = await Promise.all([
      chemblGet("/molecule?max_phase=4&limit=1").catch(() => null),
      chemblGet("/target?limit=1").catch(() => null),
      // Aggregate real top indications across all ChEMBL drug indications.
      chemblGet("/drug_indication?max_phase_for_ind=4&limit=1000", 25000).catch(() => null),
    ]);

    const indicationRows = (indications?.drug_indications as Array<Record<string, unknown>> | undefined) ?? [];
    const counts = new Map<string, number>();
    for (const ind of indicationRows) {
      const term = String(ind.efo_term ?? "").trim();
      if (!term) continue;
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
    const topIndications = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([indication, count]) => ({ indication, count }));

    res.json({
      approvedDrugs: (approvedRes?.page_meta as Record<string, number> | undefined)?.total_count ?? 0,
      uniqueTargets: (targetRes?.page_meta as Record<string, number> | undefined)?.total_count ?? 0,
      totalIndications: indicationRows.length,
      phase4Indications: topIndications.reduce((acc, t) => acc + t.count, 0),
      topIndications,
      recentSearches: [],
    });
  } catch (err) {
    next(err);
  }
});

router.get("/drugs/:chemblId/activities", async (req, res, next) => {
  const { chemblId } = req.params;
  const { limit = "20", standardType } = req.query as Record<string, string>;
  try {
    const typeParam = standardType ? `&standard_type=${encodeURIComponent(standardType)}` : "";
    const data = await chemblGet(`/activity?molecule_chembl_id=${chemblId.toUpperCase()}&limit=${Math.min(100, parseInt(limit, 10) || 20)}&offset=0${typeParam}`);
    const activities = (data.activities as Array<Record<string, unknown>>) ?? [];
    const mapped = activities.map((a) => ({
      activityId: a.activity_id as string,
      targetName: (a.target_pref_name as string) ?? "",
      targetChemblId: (a.target_chembl_id as string) ?? "",
      standardType: (a.standard_type as string) ?? "",
      standardValue: (a.standard_value as number) ?? null,
      standardUnits: (a.standard_units as string) ?? "",
      relation: (a.standard_relation as string) ?? "=",
      assayType: (a.assay_type as string) ?? "",
      assayDescription: (a.assay_description as string) ?? "",
      pchembl: (a.pchembl_value as number) ?? null,
      activityComment: (a.activity_comment as string) ?? "",
      documentYear: (a.document_year as number) ?? null,
      targetChemblUrl: a.target_chembl_id ? `https://www.ebi.ac.uk/chembl/target_report_card/${a.target_chembl_id as string}/` : null,
    }));
    const byTarget = new Map<string, number>();
    for (const a of mapped) byTarget.set(a.targetName, (byTarget.get(a.targetName) ?? 0) + 1);
    res.json({
      chemblId: chemblId.toUpperCase(),
      activities: mapped,
      total: (data.page_meta as Record<string, number> | undefined)?.total_count ?? mapped.length,
      topTargets: [...byTarget.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([target, count]) => ({ target, count })),
    });
  } catch (err) {
    next(err);
  }
});

router.get("/drugs/:chemblId", async (req, res, next) => {
  const { chemblId } = req.params;
  try {
    const data = await chemblGet(`/molecule/${chemblId.toUpperCase()}`);
    const molecule = mapMolecule(data as unknown as ChembloMolecule);

    // Indications come from the dedicated drug_indication resource.
    const inds = await fetchJsonOrNull<{ drug_indications?: Array<{ efo_term: string; max_phase_for_ind: number; ind_ref: string }> }>(
      `${CHEMBL_BASE}/drug_indication?molecule_chembl_id=${chemblId.toUpperCase()}&limit=50`,
      { timeoutMs: 15000 },
    );
    const indications = (inds?.drug_indications ?? []).map((i) => ({
      term: i.efo_term,
      maxPhase: i.max_phase_for_ind,
    }));

    res.json({ ...molecule, indications, totalIndications: indications.length });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Real 3D conformer from PubChem. Resolves ChEMBL id -> PubChem CID via name
// or InChIKey lookup, then downloads the computed 3D SDF and parses it into
// atoms + bonds so the frontend can render a geometrically accurate molecule.
// ---------------------------------------------------------------------------

interface SdfAtom {
  x: number;
  y: number;
  z: number;
  element: string;
}
interface SdfBond {
  a: number; // 0-based atom index
  b: number;
  order: number; // 1 single, 2 double, 3 triple
}

function parseSdf(text: string): { atoms: SdfAtom[]; bonds: SdfBond[]; name: string } | null {
  const lines = text.split(/\r?\n/);
  if (lines.length < 4) return null;
  const counts = lines[3];
  if (!counts || counts.length < 9) return null;
  const atomCount = parseInt(counts.slice(0, 3).trim(), 10);
  const bondCount = parseInt(counts.slice(3, 6).trim(), 10);
  if (!Number.isFinite(atomCount) || atomCount <= 0 || atomCount > 500) return null;
  const atoms: SdfAtom[] = [];
  for (let i = 0; i < atomCount; i++) {
    const l = lines[4 + i];
    if (!l) return null;
    const x = parseFloat(l.slice(0, 10));
    const y = parseFloat(l.slice(10, 20));
    const z = parseFloat(l.slice(20, 30));
    const element = l.slice(31, 34).trim();
    if (![x, y, z].every(Number.isFinite) || !element) return null;
    atoms.push({ x, y, z, element });
  }
  const bonds: SdfBond[] = [];
  for (let i = 0; i < bondCount; i++) {
    const l = lines[4 + atomCount + i];
    if (!l) return null;
    const a = parseInt(l.slice(0, 3).trim(), 10) - 1;
    const b = parseInt(l.slice(3, 6).trim(), 10) - 1;
    const order = parseInt(l.slice(6, 9).trim(), 10) || 1;
    if (a < 0 || b < 0 || a >= atomCount || b >= atomCount) continue;
    bonds.push({ a, b, order: Math.min(3, Math.max(1, order)) });
  }
  return { atoms, bonds, name: (lines[0] ?? "").trim() };
}

async function resolvePubChemCid(chemblId: string, name: string, smiles: string | null): Promise<string | null> {
  // 1. Preferred: PubChem name lookup by ChEMBL id (many drugs alias their ChEMBL id).
  const tryResolve = async (q: string): Promise<string | null> => {
    const data = await fetchJsonOrNull<{ IdentifierList?: { CID?: string[] } }>(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(q)}/cids/JSON`,
      { timeoutMs: 10000 },
    );
    return data?.IdentifierList?.CID?.[0] ?? null;
  };
  if (name) {
    const cid = await tryResolve(name);
    if (cid) return cid;
  }
  // 2. Fallback: synonym search restricted to the ChEMBL id.
  const synData = await fetchJsonOrNull<{ IdentifierList?: { CID?: string[] } }>(
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(chemblId)}/synonyms/cids/JSON`,
    { timeoutMs: 10000 },
  );
  if (synData?.IdentifierList?.CID?.length) return synData.IdentifierList.CID[0];
  // 3. Last resort: structure search from canonical SMILES.
  if (smiles) {
    const smiData = await fetchJsonOrNull<{ IdentifierList?: { CID?: string[] } }>(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(smiles)}/cids/JSON`,
      { timeoutMs: 12000 },
    );
    if (smiData?.IdentifierList?.CID?.length) return smiData.IdentifierList.CID[0];
  }
  return null;
}

router.get("/drugs/:chemblId/conformer3d", async (req, res, next) => {
  const { chemblId } = req.params;
  try {
    const data = await chemblGet(`/molecule/${chemblId.toUpperCase()}`);
    const molecule = mapMolecule(data as unknown as ChembloMolecule);
    const cid = await resolvePubChemCid(chemblId.toUpperCase(), molecule.name, molecule.smiles);
    if (!cid) {
      res.status(404).json({ error: "No PubChem compound found for this molecule" });
      return;
    }
    // 3D conformer record (computed geometry, not a flat depiction).
    const sdf = await fetchTextOrNull(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/SDF?record_type=3d`, 25000);
    const parsed = sdf ? parseSdf(sdf) : null;
    if (!parsed) {
      res.status(404).json({ error: "No 3D conformer available for this compound", cid });
      return;
    }
    // Basic molecule properties from PubChem.
    const props = await fetchJsonOrNull<{ PropertyTable?: { Properties?: Array<Record<string, unknown>> } }>(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,InChIKey/JSON`,
      { timeoutMs: 10000 },
    );
    const propTable = props?.PropertyTable?.Properties?.[0];
    res.json({
      chemblId: chemblId.toUpperCase(),
      cid,
      name: parsed.name || molecule.name,
      atoms: parsed.atoms,
      bonds: parsed.bonds,
      atomCount: parsed.atoms.length,
      bondCount: parsed.bonds.length,
      pubchemUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
      molecularFormula: (propTable?.MolecularFormula as string) ?? molecule.molecularFormula,
      molecularWeight: (propTable?.MolecularWeight as string) ?? (molecule.molecularWeight != null ? String(molecule.molecularWeight) : null),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
