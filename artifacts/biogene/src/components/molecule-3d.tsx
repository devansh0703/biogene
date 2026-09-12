import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

export interface ConformerAtom {
  x: number;
  y: number;
  z: number;
  element: string;
}
export interface ConformerBond {
  a: number;
  b: number;
  order: number;
}

// CPK-ish element colors
const ELEMENT_COLORS: Record<string, string> = {
  H: "#e8e8e8",
  C: "#5a5a5a",
  N: "#3050f0",
  O: "#f03030",
  S: "#ffe135",
  P: "#ff8000",
  F: "#90e050",
  CL: "#1ff01f",
  BR: "#a62929",
  I: "#940094",
};
const ELEMENT_RADII: Record<string, number> = {
  H: 0.22,
  C: 0.32,
  N: 0.3,
  O: 0.29,
  S: 0.38,
  P: 0.36,
  F: 0.26,
  CL: 0.34,
  BR: 0.38,
  I: 0.42,
};

function BondMesh({ a, b, order, atoms }: { a: number; b: number; order: number; atoms: ConformerAtom[] }) {
  const va = new THREE.Vector3(atoms[a].x, atoms[a].y, atoms[a].z);
  const vb = new THREE.Vector3(atoms[b].x, atoms[b].y, atoms[b].z);

  // Hydrogens: one thin cylinder. Heavy-atom double/triple bonds: parallel tubes.
  const strands: Array<[THREE.Vector3, THREE.Vector3]> = [];
  if (order <= 1) {
    strands.push([va, vb]);
  } else {
    const dir = vb.clone().sub(va).normalize();
    const perp = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(dir).normalize() : new THREE.Vector3(1, 0, 0).cross(dir).normalize();
    const off = 0.075;
    if (order === 2) {
      strands.push([va.clone().addScaledVector(perp, off), vb.clone().addScaledVector(perp, off)]);
      strands.push([va.clone().addScaledVector(perp, -off), vb.clone().addScaledVector(perp, -off)]);
    } else {
      strands.push([va.clone().addScaledVector(perp, off * 1.3), vb.clone().addScaledVector(perp, off * 1.3)]);
      strands.push([va.clone().addScaledVector(perp, -off * 1.3), vb.clone().addScaledVector(perp, -off * 1.3)]);
      strands.push([va, vb]);
    }
  }

  return (
    <group>
      {strands.map(([from, to], i) => {
        const segMid = from.clone().add(to).multiplyScalar(0.5);
        const segLen = from.distanceTo(to);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
        return (
          <mesh key={i} position={segMid} quaternion={q}>
            <cylinderGeometry args={[0.045, 0.045, segLen, 8]} />
            <meshStandardMaterial color="#9aa0a6" roughness={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * Geometrically accurate 3D molecule rendered from real computed conformer
 * coordinates (PubChem 3D SDF) — atom positions and bond orders are real data,
 * not a stylized approximation.
 */
export default function Molecule3D({
  atoms,
  bonds,
  showHydrogens = true,
}: {
  atoms: ConformerAtom[];
  bonds: ConformerBond[];
  showHydrogens?: boolean;
}) {
  const { visibleAtoms, visibleBonds } = useMemo(() => {
    const visible = atoms.filter((a) => showHydrogens || a.element.toUpperCase() !== "H");
    const idxMap = new Map<ConformerAtom, number>();
    visible.forEach((a, i) => idxMap.set(a, i));
    const vb = bonds
      .filter((b) => idxMap.has(atoms[b.a]) && idxMap.has(atoms[b.b]))
      .map((b) => ({ ...b, a: idxMap.get(atoms[b.a])!, b: idxMap.get(atoms[b.b])! }));
    // Center and normalize scale to fit the viewport.
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const a of visible) {
      min.x = Math.min(min.x, a.x); min.y = Math.min(min.y, a.y); min.z = Math.min(min.z, a.z);
      max.x = Math.max(max.x, a.x); max.y = Math.max(max.y, a.y); max.z = Math.max(max.z, a.z);
    }
    const c = min.clone().add(max).multiplyScalar(0.5);
    const span = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 1);
    const s = 9 / span;
    return {
      visibleAtoms: visible.map((a) => ({ ...a, x: (a.x - c.x) * s, y: (a.y - c.y) * s, z: (a.z - c.z) * s })),
      visibleBonds: vb,
    };
  }, [atoms, bonds, showHydrogens]);

  if (!atoms.length) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs font-mono text-muted-foreground uppercase">
        No 3D conformer available
      </div>
    );
  }

  return (
    <Canvas camera={{ position: [0, 0, 12], fov: 45 }} dpr={[1, 2]}>
      <ambientLight intensity={0.5} />
      <pointLight position={[8, 8, 8]} intensity={80} />
      <pointLight position={[-8, -6, 4]} intensity={40} color="#aabbff" />
      {visibleBonds.map((b, i) => (
        <BondMesh key={i} a={b.a} b={b.b} order={b.order} atoms={visibleAtoms} />
      ))}
      {visibleAtoms.map((a, i) => {
        const el = a.element.toUpperCase();
        return (
          <mesh key={i} position={[a.x, a.y, a.z]}>
            <sphereGeometry args={[ELEMENT_RADII[el] ?? 0.3, 20, 20]} />
            <meshStandardMaterial color={ELEMENT_COLORS[el] ?? "#cccccc"} roughness={0.35} metalness={0.1} />
          </mesh>
        );
      })}
      <OrbitControls enablePan autoRotate autoRotateSpeed={1.1} minDistance={4} maxDistance={28} />
    </Canvas>
  );
}
