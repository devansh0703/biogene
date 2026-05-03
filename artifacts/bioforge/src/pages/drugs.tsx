import { useState, useMemo } from "react";
import {
  useSearchCompounds, useGetCompound, useGetCompoundActivities,
  useSearchTargets, useGetDrugDashboardStats,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

interface Atom {
  element: string;
  x: number;
  y: number;
  z: number;
  index: number;
}

interface Bond {
  from: number;
  to: number;
  order: number;
}

const ATOM_COLORS: Record<string, string> = {
  C: "#cccccc", N: "#8888ff", O: "#ff8888", S: "#ffff44",
  F: "#88ff88", Cl: "#44cc44", Br: "#994400", I: "#660066",
  P: "#ff8800", H: "#eeeeee",
};
const ATOM_RADII: Record<string, number> = {
  C: 0.15, N: 0.14, O: 0.13, S: 0.18, F: 0.11, Cl: 0.17, Br: 0.19, I: 0.22, P: 0.18, H: 0.09,
};

function parseSmilesRough(smiles: string): { atoms: Atom[]; bonds: Bond[] } {
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const elements = ["Cl", "Br", "Si", "Se", "C", "N", "O", "S", "F", "I", "P", "H"];
  let i = 0;
  const angleStep = (2 * Math.PI) / Math.max(1, smiles.replace(/[^A-Z]/g, "").length);
  let angle = 0;
  let lastAtomIdx = -1;
  const stack: number[] = [];
  let bondStack: number | null = null;

  while (i < smiles.length) {
    if (smiles[i] === "(") { stack.push(lastAtomIdx); i++; continue; }
    if (smiles[i] === ")") { lastAtomIdx = stack.pop() ?? -1; i++; continue; }
    if (smiles[i] === "=" || smiles[i] === "#") { i++; continue; }
    if (smiles[i] === "[") {
      const end = smiles.indexOf("]", i);
      const inner = smiles.slice(i + 1, end);
      const el = inner.match(/[A-Z][a-z]?/)?.[0] ?? "C";
      const r = 1.5 + (atoms.length / 10) * 0.2;
      atoms.push({ element: el.toUpperCase(), x: Math.cos(angle) * r, y: Math.sin(angle) * r, z: (Math.random() - 0.5) * 0.5, index: atoms.length });
      if (lastAtomIdx >= 0) bonds.push({ from: lastAtomIdx, to: atoms.length - 1, order: 1 });
      lastAtomIdx = atoms.length - 1;
      angle += angleStep;
      i = end + 1;
      continue;
    }

    const twoChar = smiles.slice(i, i + 2);
    const oneChar = smiles[i];
    const element = (elements.includes(twoChar) ? twoChar : elements.includes(oneChar!.toUpperCase()) ? oneChar!.toUpperCase() : null);
    if (element) {
      const r = 1.5 + (atoms.length / 10) * 0.2;
      atoms.push({ element, x: Math.cos(angle) * r, y: Math.sin(angle) * r, z: (Math.random() - 0.5) * 0.5, index: atoms.length });
      if (lastAtomIdx >= 0) bonds.push({ from: lastAtomIdx, to: atoms.length - 1, order: 1 });
      lastAtomIdx = atoms.length - 1;
      angle += angleStep;
      i += element.length > 1 ? 2 : 1;
    } else {
      i++;
    }
  }

  return { atoms: atoms.slice(0, 60), bonds: bonds.slice(0, 80) };
}

function MoleculeViewer3D({ smiles }: { smiles: string }) {
  const { atoms, bonds } = useMemo(() => parseSmilesRough(smiles), [smiles]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[5, 5, 5]} intensity={0.8} />
      {atoms.map((a, i) => {
        const color = ATOM_COLORS[a.element] ?? "#cccccc";
        const r = ATOM_RADII[a.element] ?? 0.15;
        return (
          <mesh key={i} position={[a.x, a.y, a.z]}>
            <sphereGeometry args={[r, 12, 12]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      })}
      {bonds.map((b, i) => {
        const a = atoms[b.from];
        const c = atoms[b.to];
        if (!a || !c) return null;
        const start = new THREE.Vector3(a.x, a.y, a.z);
        const end = new THREE.Vector3(c.x, c.y, c.z);
        const mid = start.clone().lerp(end, 0.5);
        const dir = end.clone().sub(start);
        const len = dir.length();
        return (
          <mesh key={i} position={[mid.x, mid.y, mid.z]} quaternion={
            new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
          }>
            <cylinderGeometry args={[0.04, 0.04, len, 6]} />
            <meshStandardMaterial color="#666666" />
          </mesh>
        );
      })}
      <OrbitControls enablePan enableZoom enableRotate />
    </>
  );
}

export default function Drugs() {
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [targetQuery, setTargetQuery] = useState("");
  const [targetSearchTerm, setTargetSearchTerm] = useState("");
  const [selectedChemblId, setSelectedChemblId] = useState<string | null>(null);

  const { data: statsData } = useGetDrugDashboardStats();
  const { data: searchData, isLoading: searchLoading } = useSearchCompounds(
    { query: searchTerm },
    { query: { enabled: !!searchTerm } }
  );
  const { data: targetData, isLoading: targetLoading } = useSearchTargets(
    { query: targetSearchTerm },
    { query: { enabled: !!targetSearchTerm } }
  );
  const { data: compoundData, isLoading: compoundLoading } = useGetCompound(
    selectedChemblId ?? "",
    { query: { enabled: !!selectedChemblId } }
  );
  const { data: activitiesData, isLoading: activitiesLoading } = useGetCompoundActivities(
    selectedChemblId ?? "",
    { limit: 20 },
    { query: { enabled: !!selectedChemblId } }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold uppercase tracking-tight">Drug Discovery</h1>
        <p className="text-muted-foreground font-mono mt-1 text-sm">
          ChEMBL REST API — compounds, targets, bioactivities
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          ["Approved Drugs (ChEMBL)", statsData?.approvedDrugs ?? "—"],
          ["Unique Targets", statsData?.uniqueTargets ?? "—"],
          ["Compounds Searched", statsData?.totalCompoundsSearched ?? 0],
        ].map(([label, value]) => (
          <Card key={String(label)} className="rounded-none border-border bg-card">
            <CardHeader className="pb-1"><CardTitle className="text-xs uppercase text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold font-mono">{String(value)}</p></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs uppercase text-muted-foreground font-mono">Compound Search</p>
          <div className="flex gap-2">
            <Input
              placeholder="Search compound (e.g. aspirin, imatinib, gefitinib)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setSearchTerm(query); }}
              className="rounded-none font-mono text-sm bg-black border-border"
              data-testid="compound-search-input"
            />
            <Button onClick={() => setSearchTerm(query)} disabled={!query || searchLoading} className="rounded-none uppercase text-xs" data-testid="compound-search-btn">
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
              data-testid="target-search-input"
            />
            <Button onClick={() => setTargetSearchTerm(targetQuery)} disabled={!targetQuery || targetLoading} className="rounded-none uppercase text-xs" data-testid="target-search-btn">
              {targetLoading ? "..." : "Search"}
            </Button>
          </div>
        </div>
      </div>

      {selectedChemblId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="rounded-none border-border bg-card">
            <CardHeader>
              <CardTitle className="text-sm uppercase flex items-center justify-between">
                <span>3D Molecule — {selectedChemblId}</span>
                <Button variant="ghost" size="sm" onClick={() => setSelectedChemblId(null)} className="rounded-none text-xs text-muted-foreground h-6">
                  Close
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {compoundLoading ? <Skeleton className="h-64 rounded-none" /> : compoundData?.smiles ? (
                <div className="h-64 bg-black">
                  <Canvas camera={{ position: [0, 0, 8], fov: 50 }}>
                    <MoleculeViewer3D smiles={compoundData.smiles} />
                  </Canvas>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center bg-black/50">
                  <p className="text-xs font-mono text-muted-foreground">No SMILES available</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-none border-border bg-card">
            <CardHeader><CardTitle className="text-sm uppercase">Compound Properties</CardTitle></CardHeader>
            <CardContent className="font-mono text-xs space-y-2">
              {compoundLoading ? <Skeleton className="h-40 rounded-none" /> : compoundData && (
                <>
                  <div className="flex gap-2 flex-wrap mb-2">
                    {compoundData.maxPhase != null && (
                      <Badge className="rounded-none bg-white text-black text-xs">Phase {compoundData.maxPhase}</Badge>
                    )}
                    {compoundData.indication && (
                      <Badge className="rounded-none bg-white/20 text-white text-xs">{compoundData.indication}</Badge>
                    )}
                  </div>
                  <p className="font-bold text-sm">{compoundData.name}</p>
                  {(compoundData.synonyms ?? []).slice(0, 3).map((s) => (
                    <p key={s} className="text-muted-foreground">{s}</p>
                  ))}
                  <div className="grid grid-cols-2 gap-1 mt-2">
                    {[
                      ["Formula", compoundData.molecularFormula],
                      ["MW", compoundData.molecularWeight ? `${compoundData.molecularWeight} Da` : null],
                      ["ALogP", compoundData.alogp],
                      ["QED", compoundData.qedScore ? compoundData.qedScore.toFixed(3) : null],
                      ["HBD", compoundData.hbondDonors],
                      ["HBA", compoundData.hbondAcceptors],
                      ["Rotatable Bonds", compoundData.rotatableBonds],
                      ["Aromatic Rings", compoundData.aromaticRings],
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

      {activitiesData && (activitiesData.activities ?? []).length > 0 && (
        <Card className="rounded-none border-border bg-card">
          <CardHeader><CardTitle className="text-sm uppercase">Bioactivities — {selectedChemblId}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border text-muted-foreground uppercase">
                    <th className="text-left py-2 pr-4">Target</th>
                    <th className="text-left py-2 pr-4">Assay</th>
                    <th className="text-left py-2 pr-4">Type</th>
                    <th className="text-left py-2 pr-4">Value</th>
                    <th className="text-left py-2 pr-4">pChEMBL</th>
                  </tr>
                </thead>
                <tbody>
                  {activitiesData.activities!.slice(0, 15).map((a) => (
                    <tr key={a.activityId} className="border-b border-border hover:bg-white/5">
                      <td className="py-2 pr-4 max-w-[200px] truncate">{a.targetName}</td>
                      <td className="py-2 pr-4">{a.assayType}</td>
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
      )}

      {(searchData?.compounds ?? []).length > 0 && (
        <div>
          <h2 className="text-sm font-bold uppercase text-muted-foreground mb-3">
            Compounds — "{searchTerm}" ({searchData?.total ?? 0} results)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {searchData!.compounds.map((c) => (
              <button
                key={c.chemblId}
                onClick={() => setSelectedChemblId(c.chemblId)}
                className={`text-left border p-3 transition-colors ${selectedChemblId === c.chemblId ? "border-white bg-white/10" : "border-border bg-card hover:bg-white/5"}`}
                data-testid="compound-card"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="font-mono font-bold text-sm">{c.chemblId}</p>
                  {c.maxPhase != null && c.maxPhase > 0 && (
                    <Badge className="rounded-none bg-white text-black text-xs">Phase {c.maxPhase}</Badge>
                  )}
                </div>
                <p className="text-xs text-white/80 line-clamp-1">{c.name || "—"}</p>
                {c.molecularFormula && <p className="text-xs font-mono text-muted-foreground mt-1">{c.molecularFormula}</p>}
                <div className="flex gap-3 mt-1 text-xs font-mono text-muted-foreground">
                  {c.molecularWeight && <span>MW: {c.molecularWeight}</span>}
                  {c.qedScore && <span>QED: {c.qedScore.toFixed(2)}</span>}
                  {c.alogp != null && <span>ALogP: {c.alogp}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {(targetData?.targets ?? []).length > 0 && (
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
                  </tr>
                </thead>
                <tbody>
                  {targetData!.targets.map((t) => (
                    <tr key={t.targetChemblId} className="border-b border-border hover:bg-white/5">
                      <td className="py-2 pr-4 font-mono">{t.targetChemblId}</td>
                      <td className="py-2 pr-4 max-w-[200px] truncate">{t.targetName}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{t.targetType}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{t.organism}</td>
                      <td className="py-2 pr-4">{(t.geneNames ?? []).join(", ") || "-"}</td>
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
