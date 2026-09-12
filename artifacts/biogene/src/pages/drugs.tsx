import { useState, useMemo, useEffect } from "react";
import {
  getSearchCompoundsQueryOptions, getGetCompoundQueryOptions, getGetCompoundActivitiesQueryOptions,
  getSearchTargetsQueryOptions, getGetDrugDashboardStatsQueryOptions, getGetCompoundConformer3dQueryOptions,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useQueryParams } from "@/lib/api-url";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChartCard, CountBarChart, HistogramChart, type Count } from "@/components/charts";
import Molecule3D, { type ConformerAtom, type ConformerBond } from "@/components/molecule-3d";
import { ExternalLink } from "lucide-react";

const DEFAULT_COMPOUND_QUERY = "imatinib";
const DEFAULT_TARGET_QUERY = "EGFR";

interface CompoundRow {
  chemblId: string;
  name?: string;
  maxPhase?: number;
  molecularFormula?: string;
  molecularWeight?: number | string;
  qedScore?: number | string;
  alogp?: number | string;
  firstApproval?: number | string;
  indication?: string;
  hbondDonors?: number | string;
  hbondAcceptors?: number | string;
  rotatableBonds?: number | string;
  aromaticRings?: number | string;
}
interface ActivityRow {
  activityId: string;
  targetName: string;
  assayType: string;
  standardType: string;
  relation: string;
  standardValue: number | string | null;
  standardUnits: string;
  pchembl?: number | string | null;
}

export default function Drugs() {
  const urlParams = useQueryParams();
  const [query, setQuery] = useState(urlParams["q"] ?? DEFAULT_COMPOUND_QUERY);
  const [searchTerm, setSearchTerm] = useState(urlParams["q"] ?? DEFAULT_COMPOUND_QUERY);
  const [targetQuery, setTargetQuery] = useState(urlParams["target"] ?? DEFAULT_TARGET_QUERY);
  const [targetSearchTerm, setTargetSearchTerm] = useState(urlParams["target"] ?? DEFAULT_TARGET_QUERY);
  const [selectedChemblId, setSelectedChemblId] = useState<string | null>(urlParams["chembl"] ?? null);

  const { data: statsData } = useQuery(getGetDrugDashboardStatsQueryOptions());
  const { data: searchData, isLoading: searchLoading } = useQuery(
    getSearchCompoundsQueryOptions(
      { query: searchTerm },
      { query: { enabled: !!searchTerm, queryKey: ["compounds", searchTerm] } },
    ),
  );
  const { data: targetData, isLoading: targetLoading } = useQuery(
    getSearchTargetsQueryOptions(
      { query: targetSearchTerm },
      { query: { enabled: !!targetSearchTerm, queryKey: ["targets", targetSearchTerm] } },
    ),
  );
  const { data: compoundData, isLoading: compoundLoading } = useQuery(
    getGetCompoundQueryOptions(
      selectedChemblId ?? "",
      { query: { enabled: !!selectedChemblId, queryKey: ["compound", selectedChemblId] } },
    ),
  );
  const { data: activitiesData, isLoading: activitiesLoading } = useQuery(
    getGetCompoundActivitiesQueryOptions(
      selectedChemblId ?? "",
      { limit: 20 },
      { query: { enabled: !!selectedChemblId, queryKey: ["compound-activities", selectedChemblId] } },
    ),
  );
  // Real 3D conformer (PubChem computed geometry) for the selected compound.
  const { data: conformerData, isLoading: conformerLoading } = useQuery(
    getGetCompoundConformer3dQueryOptions(selectedChemblId ?? "", {
      query: { enabled: !!selectedChemblId, retry: false, queryKey: ["compound-conformer", selectedChemblId] },
    }),
  );
  const conformer = conformerData as
    | { cid?: string; atoms?: ConformerAtom[]; bonds?: ConformerBond[]; pubchemUrl?: string; molecularFormula?: string; atomCount?: number }
    | undefined;

  useEffect(() => {
    if (searchData?.compounds && searchData.compounds.length > 0 && !selectedChemblId) {
      const first = searchData.compounds[0];
      if (first?.chemblId) setSelectedChemblId(first.chemblId);
    }
  }, [searchData, selectedChemblId]);

  const compounds = (searchData?.compounds ?? []) as unknown as CompoundRow[];
  const activities = (activitiesData as { activities?: ActivityRow[] } | undefined)?.activities ?? [];
  const compound = compoundData as CompoundRow & { smiles?: string; synonyms?: string[]; atcClasses?: string[]; targets?: string[] } | undefined;

  // Charts
  const phaseChart: Count[] = useMemo(() => {
    const byPhase = new Map<string, number>();
    for (const c of compounds) {
      const k = c.maxPhase == null ? "unknown" : c.maxPhase === 0 ? "early" : `phase ${c.maxPhase}`;
      byPhase.set(k, (byPhase.get(k) ?? 0) + 1);
    }
    return [...byPhase.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  }, [compounds]);

  const mwHistogram = useMemo(() => {
    const mws = compounds
      .map((c) => Number(c.molecularWeight))
      .filter((v) => v != null && Number.isFinite(v));
    if (mws.length < 3) return [];
    const buckets = [
      { bucket: "<200", min: 0, max: 200, count: 0 },
      { bucket: "200-300", min: 200, max: 300, count: 0 },
      { bucket: "300-400", min: 300, max: 400, count: 0 },
      { bucket: "400-500", min: 400, max: 500, count: 0 },
      { bucket: "500-600", min: 500, max: 600, count: 0 },
      { bucket: "600+", min: 600, max: Infinity, count: 0 },
    ];
    for (const mw of mws) {
      const b = buckets.find((b) => mw >= b.min && mw < b.max);
      if (b) b.count++;
    }
    return buckets;
  }, [compounds]);

  const pchemblChart: Count[] = useMemo(
    () =>
      activities
        .filter((a) => a.pchembl != null && a.pchembl !== "" && Number.isFinite(Number(a.pchembl)))
        .slice(0, 12)
        .map((a) => {
          const p = Number(a.pchembl);
          return { key: `${(a.targetName ?? "").slice(0, 20)} (p=${p.toFixed(1)})`, count: Number(p.toFixed(1)) };
        }),
    [activities],
  );

  const chemblUrl = selectedChemblId ? `https://www.ebi.ac.uk/chembl/compound_report_card/${selectedChemblId}/` : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight">Drug Discovery</h1>
        <p className="text-muted-foreground font-mono mt-1 text-sm">
          ChEMBL REST API — compounds, targets, bioactivities, indications
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Approved Drugs", (statsData as { approvedDrugs?: string | number } | undefined)?.approvedDrugs ?? "—"],
          ["Unique Targets", (statsData as { uniqueTargets?: string | number } | undefined)?.uniqueTargets ?? "—"],
          ["Top Indications", (statsData as { topIndications?: unknown[] } | undefined)?.topIndications?.length ?? 0],
          ["Compounds Searched", (statsData as { totalCompoundsSearched?: number } | undefined)?.totalCompoundsSearched ?? 0],
        ].map(([label, value]) => (
          <Card key={String(label)} className="rounded-none border-border bg-card">
            <CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold font-mono">{String(value)}</p></CardContent>
          </Card>
        ))}
      </div>

      {(statsData as { topIndications?: Array<{ indication: string; count: number }> } | undefined)?.topIndications?.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Top Indications (ChEMBL drug_indication)" subtitle="live">
            <CountBarChart
              data={((statsData as { topIndications: Array<{ indication: string; count: number }> }).topIndications ?? []).map((i) => ({ key: i.indication, count: i.count })) as Count[]}
              layout="horizontal"
            />
          </ChartCard>
          <ChartCard title="Molecular Weight Distribution" subtitle="compounds in current search">
            <HistogramChart data={mwHistogram} />
          </ChartCard>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs uppercase text-muted-foreground font-mono">Compound Search</p>
          <div className="flex gap-2">
            <Input
              placeholder="Search compound (e.g. aspirin, imatinib, gefitinib)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setSearchTerm(query); setSelectedChemblId(null); } }}
              className="rounded-none font-mono text-sm bg-black border-border"
            />
            <Button onClick={() => { setSearchTerm(query); setSelectedChemblId(null); }} disabled={!query || searchLoading} className="rounded-none uppercase text-xs">
              {searchLoading ? "..." : "Search"}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs uppercase text-muted-foreground font-mono">Target Search</p>
          <div className="flex gap-2">
            <Input
              placeholder="Search target (e.g. EGFR, BCR-ABL, VEGFR)..."
              value={targetQuery}
              onChange={(e) => setTargetQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setTargetSearchTerm(targetQuery); }}
              className="rounded-none font-mono text-sm bg-black border-border"
            />
            <Button onClick={() => setTargetSearchTerm(targetQuery)} disabled={!targetQuery || targetLoading} className="rounded-none uppercase text-xs">
              {targetLoading ? "..." : "Search"}
            </Button>
          </div>
        </div>
      </div>

      {searchLoading && <Skeleton className="h-40 rounded-none" />}

      {compounds.length > 0 && (
        <div>
          <h2 className="text-sm font-bold uppercase text-muted-foreground mb-3">
            Compounds — "{searchTerm}" ({searchData?.total ?? 0} results)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {compounds.map((c) => (
              <button
                key={c.chemblId}
                onClick={() => setSelectedChemblId(c.chemblId)}
                className={`text-left border p-3 transition-colors ${selectedChemblId === c.chemblId ? "border-white bg-white/10" : "border-border bg-card hover:bg-white/5"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="font-mono font-bold text-sm">{c.chemblId}</p>
                  <div className="flex items-center gap-1">
                    {c.maxPhase != null && c.maxPhase > 0 && (
                      <Badge className="rounded-none bg-white text-black text-xs">Phase {c.maxPhase}</Badge>
                    )}
                    <a
                      href={`https://www.ebi.ac.uk/chembl/compound_report_card/${c.chemblId}/`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted-foreground hover:text-white"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
                <p className="text-xs text-white/80 line-clamp-1">{c.name || "—"}</p>
                {c.molecularFormula && <p className="text-xs font-mono text-muted-foreground mt-1">{c.molecularFormula}</p>}
                <div className="flex gap-3 mt-1 text-xs font-mono text-muted-foreground flex-wrap">
                  {c.molecularWeight && <span>MW: {c.molecularWeight}</span>}
                  {c.qedScore != null && <span>QED: {Number(c.qedScore).toFixed(2)}</span>}
                  {c.firstApproval != null && <span>Approved: {c.firstApproval}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {phaseChart.length > 1 && (
        <ChartCard title="Development Phase Distribution" subtitle="compounds in current search">
          <CountBarChart data={phaseChart} />
        </ChartCard>
      )}

      {selectedChemblId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="rounded-none border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm uppercase flex items-center justify-between flex-wrap gap-2">
                <span>3D Conformer — {selectedChemblId}</span>
                <div className="flex items-center gap-3">
                  {conformer?.pubchemUrl && (
                    <a href={conformer.pubchemUrl} target="_blank" rel="noreferrer" className="text-xs font-mono text-muted-foreground hover:text-white flex items-center gap-0.5">
                      PubChem CID {conformer.cid} <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setSelectedChemblId(null)} className="rounded-none text-xs text-muted-foreground h-6">
                    Close
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {conformerLoading || (conformerLoading == null && !conformer) ? (
                <div className="h-64 flex items-center justify-center bg-black">
                  <p className="text-xs font-mono text-muted-foreground uppercase animate-pulse">Resolving PubChem CID + 3D conformer…</p>
                </div>
              ) : conformer?.atoms?.length ? (
                <div className="h-64 bg-black">
                  <Molecule3D atoms={conformer.atoms} bonds={conformer.bonds ?? []} />
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center bg-black/50 gap-2">
                  <p className="text-xs font-mono text-muted-foreground">No 3D conformer available for this compound</p>
                  {compound?.smiles && <p className="text-[10px] font-mono text-muted-foreground/60">SMILES: {compound.smiles.slice(0, 60)}…</p>}
                </div>
              )}
              {conformer?.atoms?.length ? (
                <div className="flex gap-3 px-3 py-2 font-mono text-[10px] text-muted-foreground border-t border-border flex-wrap">
                  <span>{conformer.atomCount ?? conformer.atoms.length} atoms (computed 3D geometry)</span>
                  {conformer.molecularFormula && <span>· {conformer.molecularFormula}</span>}
                  <span className="ml-auto">drag to rotate · scroll to zoom</span>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-none border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm uppercase flex items-center justify-between">
                <span>Compound Properties</span>
                {chemblUrl && (
                  <a href={chemblUrl} target="_blank" rel="noreferrer" className="text-xs font-mono text-muted-foreground hover:text-white flex items-center gap-0.5 uppercase">
                    ChEMBL report card <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="font-mono text-xs space-y-2">
              {compoundLoading ? <Skeleton className="h-40 rounded-none" /> : compound && (
                <>
                  <div className="flex gap-2 flex-wrap mb-2">
                    {compound.maxPhase != null && compound.maxPhase > 0 && (
                      <Badge className="rounded-none bg-white text-black text-xs">Phase {compound.maxPhase}</Badge>
                    )}
                    {compound.indication && (
                      <Badge className="rounded-none bg-white/20 text-white text-xs">{compound.indication}</Badge>
                    )}
                    {(compound.atcClasses ?? []).slice(0, 4).map((a) => (
                      <Badge key={a} className="rounded-none bg-white/10 text-white/80 text-xs">ATC {a}</Badge>
                    ))}
                  </div>
                  <p className="font-bold text-sm">{compound.name}</p>
                  {(compound.synonyms ?? []).slice(0, 3).map((s, i) => (
                    <p key={i} className="text-muted-foreground">{s}</p>
                  ))}
                  {compound.targets && compound.targets.length > 0 && (
                    <div className="flex gap-2 flex-wrap pt-1">
                      <span className="text-muted-foreground uppercase">Targets:</span>
                      {compound.targets.map((t) => (
                        <a key={t} href={`https://www.ebi.ac.uk/chembl/target_report_card/${t}/`} target="_blank" rel="noreferrer" className="underline hover:text-white">
                          {t}
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-1 mt-2">
                    {[
                      ["Formula", compound.molecularFormula],
                      ["MW", compound.molecularWeight ? `${compound.molecularWeight} Da` : null],
                      ["ALogP", compound.alogp],
                      ["QED", compound.qedScore != null ? Number(compound.qedScore).toFixed(3) : null],
                      ["HBD", compound.hbondDonors],
                      ["HBA", compound.hbondAcceptors],
                      ["Rotatable Bonds", compound.rotatableBonds],
                      ["Aromatic Rings", compound.aromaticRings],
                      ["First Approval", compound.firstApproval],
                    ].map(([k, v]) => v != null && (
                      <div key={String(k)} className="flex justify-between border-b border-border py-1">
                        <span className="text-muted-foreground">{k}</span>
                        <span>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activities.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="pChEMBL Potency by Target" subtitle="higher = more potent">
            <CountBarChart data={pchemblChart} layout="horizontal" />
          </ChartCard>
          <Card className="rounded-none border-border bg-card">
            <CardHeader><CardTitle className="text-sm uppercase">Bioactivities — {selectedChemblId}</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-[260px]">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground uppercase">
                      <th className="text-left py-2 pr-4">Target</th>
                      <th className="text-left py-2 pr-4">Type</th>
                      <th className="text-left py-2 pr-4">Value</th>
                      <th className="text-left py-2 pr-4">pChEMBL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.slice(0, 15).map((a) => (
                      <tr key={a.activityId} className="border-b border-border hover:bg-white/5">
                        <td className="py-2 pr-4 max-w-[200px] truncate">{a.targetName}</td>
                        <td className="py-2 pr-4">{a.standardType}</td>
                        <td className="py-2 pr-4">{a.relation} {a.standardValue} {a.standardUnits}</td>
                        <td className="py-2 pr-4">{a.pchembl ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {((targetData as { targets?: unknown[] } | undefined)?.targets ?? []).length > 0 && (
        <Card className="rounded-none border-border bg-card">
          <CardHeader><CardTitle className="text-sm uppercase">Targets — "{targetSearchTerm}"</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase">
                    <th className="text-left py-2 pr-4">ChEMBL ID</th>
                    <th className="text-left py-2 pr-4">Name</th>
                    <th className="text-left py-2 pr-4">Type</th>
                    <th className="text-left py-2 pr-4">Organism</th>
                    <th className="text-left py-2 pr-4">Gene</th>
                    <th className="text-left py-2 pr-4">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {((targetData as { targets: Array<{ targetChemblId: string; targetName: string; targetType: string; organism: string; geneNames?: string[] }> }).targets ?? []).map((t) => (
                    <tr key={t.targetChemblId} className="border-b border-border hover:bg-white/5">
                      <td className="py-2 pr-4 font-mono">{t.targetChemblId}</td>
                      <td className="py-2 pr-4 max-w-[200px] truncate">{t.targetName}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{t.targetType}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{t.organism}</td>
                      <td className="py-2 pr-4">{(t.geneNames ?? []).join(", ") || "-"}</td>
                      <td className="py-2 pr-4">
                        <a href={`https://www.ebi.ac.uk/chembl/target_report_card/${t.targetChemblId}/`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-white flex items-center gap-0.5">
                          ChEMBL <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
