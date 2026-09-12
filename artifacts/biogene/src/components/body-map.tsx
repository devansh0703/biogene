import { useMemo, useState, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";

export interface BodyMapOrgan {
  tissue: string;
  tissueName: string;
  tpm: number;
  colorHex: string;
  position: { x: number; y: number; z: number; size: number };
  mapped: boolean;
  intensity: number;
  radius: number;
}

// Body coordinate space: y 0..100 (feet→head). Only *schematic* geometry lives
// here — every expression value comes from the API (live GTEx).
function BodyOutline() {
  return (
    <group>
      {/* head */}
      <mesh position={[0, 95, 0]}>
        <sphereGeometry args={[7, 24, 24]} />
        <meshStandardMaterial color="#1a1a22" transparent opacity={0.18} roughness={0.9} />
      </mesh>
      {/* torso */}
      <mesh position={[0, 55, 0]}>
        <capsuleGeometry args={[13, 34, 8, 24]} />
        <meshStandardMaterial color="#1a1a22" transparent opacity={0.14} roughness={0.9} />
      </mesh>
      {/* pelvis */}
      <mesh position={[0, 34, 0]}>
        <sphereGeometry args={[10, 20, 16]} />
        <meshStandardMaterial color="#1a1a22" transparent opacity={0.12} roughness={0.9} />
      </mesh>
      {/* arms */}
      <mesh position={[-17, 58, 0]} rotation={[0, 0, 0.18]}>
        <capsuleGeometry args={[3.6, 30, 6, 14]} />
        <meshStandardMaterial color="#1a1a22" transparent opacity={0.12} roughness={0.9} />
      </mesh>
      <mesh position={[17, 58, 0]} rotation={[0, 0, -0.18]}>
        <capsuleGeometry args={[3.6, 30, 6, 14]} />
        <meshStandardMaterial color="#1a1a22" transparent opacity={0.12} roughness={0.9} />
      </mesh>
      {/* legs */}
      <mesh position={[-6.5, 16, 0]}>
        <capsuleGeometry args={[4.4, 26, 6, 14]} />
        <meshStandardMaterial color="#1a1a22" transparent opacity={0.12} roughness={0.9} />
      </mesh>
      <mesh position={[6.5, 16, 0]}>
        <capsuleGeometry args={[4.4, 26, 6, 14]} />
        <meshStandardMaterial color="#1a1a22" transparent opacity={0.12} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Organ({
  organ,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  organ: BodyMapOrgan;
  selected: boolean;
  hovered: boolean;
  onSelect: (tissue: string) => void;
  onHover: (tissue: string | null) => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const [scale, setScale] = useState(1);

  useFrame((state) => {
    if (!ref.current) return;
    // Selected organs gently pulse.
    const target = selected ? 1.15 + Math.sin(state.clock.elapsedTime * 3) * 0.1 : hovered ? 1.25 : 1;
    setScale(target);
    ref.current.scale.lerp(new THREE.Vector3(target, target, target), 0.15);
  });

  const p = organ.position;
  const color = selected ? "#ffffff" : organ.colorHex;
  // Expression drives brightness; silent tissues stay dim.
  const emissiveIntensity = 0.15 + organ.intensity * 1.1;

  return (
    <mesh
      ref={ref}
      position={[p.x, p.y, p.z]}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(organ.tissue);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(organ.tissue);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        onHover(null);
        document.body.style.cursor = "auto";
      }}
    >
      <sphereGeometry args={[organ.radius, 20, 20]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={emissiveIntensity}
        transparent
        opacity={organ.tpm <= 0 ? 0.25 : 0.92}
        roughness={0.35}
      />
    </mesh>
  );
}

function HoverLabel({ organ }: { organ: BodyMapOrgan | null }) {
  if (!organ) return null;
  const p = organ.position;
  return (
    <Html position={[p.x + organ.radius + 2, p.y + 2, p.z]} center distanceFactor={40}>
      <div
        style={{
          background: "rgba(0,0,0,0.85)",
          border: "1px solid #444",
          padding: "2px 7px",
          fontSize: 11,
          fontFamily: "monospace",
          color: "#fff",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        {organ.tissueName}: {organ.tpm} TPM
      </div>
    </Html>
  );
}

/**
 * Schematic 3D human body carrying live GTEx expression. Organ positions are
 * anatomical layout constants; TPM values, colors, and radii come from the API.
 * Click an organ to filter the transcriptomics page to that tissue.
 */
export default function BodyMap({
  organs,
  selectedTissue,
  onSelect,
  height = 460,
}: {
  organs: BodyMapOrgan[];
  selectedTissue?: string | null;
  onSelect?: (tissue: string) => void;
  height?: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredOrgan = useMemo(() => organs.find((o) => o.tissue === hovered) ?? null, [organs, hovered]);

  if (!organs.length) {
    return (
      <div className="w-full flex items-center justify-center text-xs font-mono text-muted-foreground uppercase" style={{ height }}>
        No expression data
      </div>
    );
  }

  return (
    <div style={{ height }} className="relative w-full bg-black">
      <Canvas camera={{ position: [0, 60, 150], fov: 42 }} dpr={[1, 2]}>
        <ambientLight intensity={0.6} />
        <pointLight position={[60, 120, 80]} intensity={900} />
        <pointLight position={[-60, 40, 60]} intensity={400} color="#88aaff" />
        <group position={[0, -52, 0]}>
          <BodyOutline />
          {organs.map((o) => (
            <Organ
              key={o.tissue}
              organ={o}
              selected={selectedTissue === o.tissue}
              hovered={hovered === o.tissue}
              onSelect={(t) => onSelect?.(t)}
              onHover={setHovered}
            />
          ))}
          <HoverLabel organ={hoveredOrgan} />
        </group>
        <OrbitControls
          enablePan={false}
          minDistance={80}
          maxDistance={260}
          target={[0, 0, 0]}
        />
      </Canvas>
      <div className="absolute top-2 left-2 text-[10px] font-mono text-muted-foreground pointer-events-none">
        {organs.length} tissues · brightness = TPM · click organ to filter
      </div>
    </div>
  );
}
