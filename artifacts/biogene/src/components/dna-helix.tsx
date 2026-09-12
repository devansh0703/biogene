import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";

export const BASE_COLORS: Record<string, string> = {
  A: "#ff6b6b", // adenine — red
  T: "#4ecdc4", // thymine — teal
  G: "#ffd93d", // guanine — yellow
  C: "#6bcb77", // cytosine — green
  N: "#8b8b8b", // unknown — grey
};
const COMPLEMENT: Record<string, string> = { A: "T", T: "A", G: "C", C: "G", N: "N" };

interface HelixProps {
  sequence: string;
  /** 0-based index of the highlighted base (e.g. the variant position). */
  highlightIndex?: number | null;
  /** Optional label rendered above the highlighted bead. */
  highlightLabel?: string;
  turnsPerBase?: number;
  risePerBase?: number;
}

function BasePair({
  base,
  index,
  total,
  highlight,
  label,
  turnsPerBase,
  risePerBase,
}: {
  base: string;
  index: number;
  total: number;
  highlight: boolean;
  label?: string;
  turnsPerBase: number;
  risePerBase: number;
}) {
  const t = index / Math.max(total - 1, 1);
  const angle = t * total * turnsPerBase * Math.PI * 2;
  const y = (t - 0.5) * total * risePerBase;
  const r = 1.6;
  const x1 = Math.cos(angle) * r;
  const z1 = Math.sin(angle) * r;
  const x2 = Math.cos(angle + Math.PI) * r;
  const z2 = Math.sin(angle + Math.PI) * r;
  const color = BASE_COLORS[base.toUpperCase()] ?? BASE_COLORS.N;
  const compColor = BASE_COLORS[COMPLEMENT[base.toUpperCase()] ?? "N"];
  const ref = useRef<THREE.Group>(null);
  const pulse = useRef(0);

  useFrame((state) => {
    if (!highlight || !ref.current) return;
    pulse.current += state.clock.getDelta();
    const s = 1.6 + Math.sin(pulse.current * 4) * 0.35;
    ref.current.scale.setScalar(s);
  });

  return (
    <group ref={highlight ? ref : undefined}>
      {/* backbone spheres (sugar-phosphate) */}
      <mesh position={[x1, y, z1]}>
        <sphereGeometry args={[highlight ? 0.3 : 0.16, 16, 16]} />
        <meshStandardMaterial color={highlight ? "#ffffff" : "#5b8def"} emissive={highlight ? "#ff3b3b" : "#000000"} emissiveIntensity={highlight ? 0.9 : 0} />
      </mesh>
      <mesh position={[x2, y, z2]}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial color="#5b8def" />
      </mesh>
      {/* base-pair rung */}
      <mesh position={[0, y, 0]} rotation={[0, -angle, 0]}>
        <cylinderGeometry args={[highlight ? 0.09 : 0.05, highlight ? 0.09 : 0.05, r * 2, 8]} />
        <meshStandardMaterial
          color={highlight ? "#ff3b3b" : color}
          emissive={highlight ? "#ff3b3b" : color}
          emissiveIntensity={highlight ? 0.8 : 0.25}
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* base letters as colored dots at the rung ends */}
      <mesh position={[x1 * 0.55, y, z1 * 0.55]}>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[x2 * 0.55, y, z2 * 0.55]}>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshStandardMaterial color={compColor} />
      </mesh>
      {highlight && label && (
        <Billboard position={[x1 * 0.55 + 1.4, y + 0.5, z1 * 0.55]}>
          <Text fontSize={0.42} color="#ff3b3b" anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000000">
            {label}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

// Minimal billboard label (no drei Text dependency to keep font loading simple).
function Billboard({ position, children }: { position: [number, number, number]; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.lookAt(camera.position);
  });
  return <group ref={ref} position={position}>{children}</group>;
}

/**
 * Real-sequence DNA double helix. Pass the actual reference bases — the
 * geometry (rotation, rise) is parametric, the bases are real.
 */
export default function DnaHelix({ sequence, highlightIndex = null, highlightLabel, turnsPerBase = 0.12, risePerBase = 0.28 }: HelixProps) {
  const bases = useMemo(() => sequence.toUpperCase().replace(/[^ACGTN]/g, "").slice(0, 80).split(""), [sequence]);
  if (bases.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs font-mono text-muted-foreground uppercase">
        No sequence available
      </div>
    );
  }
  return (
    <Canvas camera={{ position: [0, 0, 14], fov: 45 }} dpr={[1, 2]}>
      <ambientLight intensity={0.55} />
      <pointLight position={[8, 8, 8]} intensity={70} />
      <pointLight position={[-8, -4, 6]} intensity={35} color="#88aaff" />
      <group rotation={[0.15, 0, 0]}>
        {bases.map((base, i) => (
          <BasePair
            key={i}
            base={base}
            index={i}
            total={bases.length}
            highlight={i === highlightIndex}
            label={highlightLabel}
            turnsPerBase={turnsPerBase}
            risePerBase={risePerBase}
          />
        ))}
      </group>
      <OrbitControls enablePan autoRotate autoRotateSpeed={0.8} minDistance={5} maxDistance={30} />
    </Canvas>
  );
}
