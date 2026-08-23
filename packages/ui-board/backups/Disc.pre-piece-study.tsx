import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  AdditiveBlending,
  ExtrudeGeometry,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  Shape,
  Vector2,
} from "three";
import type { Group } from "three";
import type { Piece } from "@ploy/rules";
import { ARMY, baseMask, directionYaw, mixHex, toWorld } from "./catalog";

type PieceKind = Piece["kind"];

const KIND: Record<
  PieceKind,
  { span: number; inner: number; outer: number; innerHeight: number; outerHeight: number }
> = {
  shield: { span: 0.9, inner: 0.05, outer: 0.275, innerHeight: 0.024, outerHeight: 0.07 },
  probe: { span: 0.95, inner: 0.052, outer: 0.292, innerHeight: 0.026, outerHeight: 0.078 },
  lance: { span: 1, inner: 0.055, outer: 0.312, innerHeight: 0.028, outerHeight: 0.086 },
  commander: { span: 1.08, inner: 0.06, outer: 0.338, innerHeight: 0.032, outerHeight: 0.098 },
};

const HULL_GEOMETRY = createHullGeometry();
const FIN_GEOMETRY = {
  shield: createFinGeometry("shield"),
  probe: createFinGeometry("probe"),
  lance: createFinGeometry("lance"),
  commander: createFinGeometry("commander"),
} as const;
const PIPE_GEOMETRY = {
  shield: createPipeGeometry("shield"),
  probe: createPipeGeometry("probe"),
  lance: createPipeGeometry("lance"),
  commander: createPipeGeometry("commander"),
} as const;

function createHullGeometry(): LatheGeometry {
  const points = [
    new Vector2(0, 0.01),
    new Vector2(0.3, 0.01),
    new Vector2(0.33, 0.026),
    new Vector2(0.328, 0.068),
    new Vector2(0.3, 0.086),
    new Vector2(0.08, 0.094),
    new Vector2(0, 0.096),
  ];
  return new LatheGeometry(points, 48);
}

function createFinGeometry(kind: PieceKind): ExtrudeGeometry {
  const spec = KIND[kind];
  const shape = new Shape();
  shape.moveTo(spec.inner, 0.008);
  shape.lineTo(spec.outer, 0.008);
  shape.lineTo(spec.outer, spec.outerHeight);
  shape.lineTo(spec.inner + 0.02, spec.innerHeight);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.07,
    bevelEnabled: true,
    bevelThickness: 0.007,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  geometry.translate(0, 0, -0.035);
  geometry.computeVertexNormals();
  return geometry;
}

function createPipeGeometry(kind: PieceKind): ExtrudeGeometry {
  const spec = KIND[kind];
  const shape = new Shape();
  shape.moveTo(spec.inner + 0.028, spec.innerHeight - 0.002);
  shape.lineTo(spec.outer - 0.012, spec.outerHeight - 0.01);
  shape.lineTo(spec.outer - 0.01, spec.outerHeight + 0.008);
  shape.lineTo(spec.inner + 0.026, spec.innerHeight + 0.012);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.016,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.002,
    bevelSegments: 1,
  });
  geometry.translate(0, 0, -0.008);
  geometry.computeVertexNormals();
  return geometry;
}

function DirectionFin({
  dir,
  kind,
  hullColor,
  finColor,
  glowColor,
}: {
  dir: number;
  kind: PieceKind;
  hullColor: string;
  finColor: string;
  glowColor: string;
}) {
  const spec = KIND[kind];
  const railLength = spec.outer - spec.inner;
  const railCenter = -(spec.inner + spec.outer) / 2;
  return (
    <group rotation={[0, directionYaw(dir), 0]}>
      <mesh position={[0, 0.101, railCenter]}>
        <boxGeometry args={[0.12, 0.018, railLength]} />
        <meshStandardMaterial
          color="#14091c"
          metalness={0.35}
          roughness={0.38}
        />
      </mesh>
      <mesh position={[0, 0.113, railCenter]} userData={{ glow: 0.5 }}>
        <boxGeometry args={[0.026, 0.01, railLength - 0.015]} />
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={0.5}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]} position={[0, 0.086, 0]}>
        <primitive object={FIN_GEOMETRY[kind]} attach="geometry" />
        <meshPhysicalMaterial
          color={finColor}
          metalness={0.48}
          roughness={0.32}
          clearcoat={0.7}
          clearcoatRoughness={0.22}
          sheen={0.28}
          sheenColor={hullColor}
        />
      </mesh>
      <mesh
        rotation={[0, Math.PI / 2, 0]}
        position={[0, 0.086, 0]}
        userData={{ glow: 0.92 }}
      >
        <primitive object={PIPE_GEOMETRY[kind]} attach="geometry" />
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={0.72}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh
        position={[0, 0.086 + spec.outerHeight * 0.78, -spec.outer + 0.012]}
        userData={{ glow: 0.7 }}
      >
        <sphereGeometry args={[0.026, 12, 12]} />
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={0.55}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh
        position={[0, 0.086 + spec.outerHeight * 0.78, -spec.outer + 0.012]}
        userData={{ glow: 0.28 }}
      >
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshBasicMaterial
          color={hullColor}
          transparent
          opacity={0.22}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export function Disc({
  piece,
  rank,
  file,
  selected,
  invalidAttempt = 0,
  previewRotationSteps = null,
  onSelect,
}: {
  piece: Piece;
  rank: number;
  file: number;
  selected: boolean;
  invalidAttempt?: number;
  previewRotationSteps?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;
  onSelect: () => void;
}) {
  const flags = baseMask(piece);
  const color = ARMY[piece.color] ?? "#ffffff";
  const hullColor = mixHex(color, "#1a1024", 0.2);
  const finColor = mixHex(color, "#140c1c", 0.1);
  const glowColor = mixHex(color, "#fff6d8", 0.42);
  const glassColor = mixHex(color, "#12081c", 0.48);
  const spec = KIND[piece.kind];
  const position = toWorld(rank, file);
  const group = useRef<Group>(null);
  const marks = useRef<Group>(null);
  const glow = useRef<Group>(null);
  const core = useRef<MeshBasicMaterial>(null);
  const shakeRemaining = useRef(0);
  const displayedPosition = useRef([...position] as [number, number, number]);
  const displayedYaw = useRef(directionYaw(piece.rot));
  const committedYaw = useRef(displayedYaw.current);
  const targetYaw = useRef(displayedYaw.current);

  useLayoutEffect(() => {
    group.current?.position.set(position[0], position[1], position[2]);
  }, []);

  useEffect(() => {
    if (invalidAttempt > 0) {
      shakeRemaining.current = 0.34;
    }
  }, [invalidAttempt]);

  useEffect(() => {
    const actualYaw = nearestEquivalentAngle(directionYaw(piece.rot), displayedYaw.current);
    committedYaw.current = actualYaw;
    targetYaw.current = actualYaw;
  }, [piece.rot]);

  useEffect(() => {
    targetYaw.current =
      previewRotationSteps === null
        ? committedYaw.current
        : committedYaw.current + directionYaw(previewRotationSteps);
  }, [previewRotationSteps]);

  useFrame((state, delta) => {
    const node = group.current;
    if (!node) {
      return;
    }
    const positionAlpha = 1 - Math.exp(-delta * 11);
    const hoverY = selected ? 0.05 : 0;
    displayedPosition.current[0] += (position[0] - displayedPosition.current[0]) * positionAlpha;
    displayedPosition.current[1] +=
      (position[1] + hoverY - displayedPosition.current[1]) * positionAlpha;
    displayedPosition.current[2] += (position[2] - displayedPosition.current[2]) * positionAlpha;
    shakeRemaining.current = Math.max(0, shakeRemaining.current - delta);
    const progress = 0.34 - shakeRemaining.current;
    const offset =
      shakeRemaining.current > 0
        ? Math.sin(progress * 75) * 0.12 * (shakeRemaining.current / 0.34)
        : 0;
    node.position.set(
      displayedPosition.current[0] + offset,
      displayedPosition.current[1],
      displayedPosition.current[2],
    );
    const scaleTarget = selected ? 1.06 : 1;
    const scale = node.scale.x + (scaleTarget - node.scale.x) * positionAlpha;
    node.scale.setScalar(scale);

    const marksNode = marks.current;
    if (marksNode) {
      const rotationAlpha = 1 - Math.exp(-delta * 9);
      displayedYaw.current += (targetYaw.current - displayedYaw.current) * rotationAlpha;
      marksNode.rotation.y = displayedYaw.current;
    }

    const live = selected ? 0.78 + Math.sin(state.clock.elapsedTime * 3.8) * 0.22 : 0.36;
    if (core.current) {
      core.current.opacity = selected ? 0.95 : 0.55;
    }
    glow.current?.traverse((child) => {
      if (!(child instanceof Mesh) || !(child.material instanceof MeshBasicMaterial)) {
        return;
      }
      const weight = typeof child.userData.glow === "number" ? child.userData.glow : 0;
      if (weight > 0) {
        child.material.opacity = live * weight;
      }
    });
  });

  return (
    <group
      ref={group}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <mesh position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.4 * spec.span, 28]} />
        <meshStandardMaterial color="#07030d" transparent opacity={0.55} roughness={1} />
      </mesh>
      <mesh scale={[spec.span, 1, spec.span]}>
        <primitive object={HULL_GEOMETRY} attach="geometry" />
        <meshPhysicalMaterial
          color={hullColor}
          metalness={0.4}
          roughness={0.36}
          clearcoat={0.62}
          clearcoatRoughness={0.26}
          sheen={0.32}
          sheenColor={color}
          emissive={color}
          emissiveIntensity={selected ? 0.16 : 0.045}
          iridescence={0.07}
          iridescenceIOR={1.22}
        />
      </mesh>
      <mesh position={[0, 0.093, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18 * spec.span, 0.194 * spec.span, 32]} />
        <meshStandardMaterial color="#120816" metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.094, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.248 * spec.span, 0.26 * spec.span, 32]} />
        <meshStandardMaterial color="#120816" metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.094, 0]} scale={[1, 0.46, 1]}>
        <sphereGeometry args={[0.07 * spec.span, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color={glassColor}
          metalness={0.12}
          roughness={0.08}
          transparent
          opacity={0.52}
          clearcoat={1}
          clearcoatRoughness={0.06}
          emissive={color}
          emissiveIntensity={selected ? 0.32 : 0.1}
        />
      </mesh>
      <mesh position={[0, 0.112, 0]}>
        <sphereGeometry args={[0.042, 16, 12]} />
        <meshBasicMaterial ref={core} color={glowColor} transparent opacity={0.55} />
      </mesh>
      {piece.kind === "commander" ? (
        <mesh position={[0, 0.155, 0]}>
          <cylinderGeometry args={[0.012, 0.018, 0.07, 10]} />
          <meshStandardMaterial color="#1b1024" metalness={0.6} roughness={0.28} />
        </mesh>
      ) : null}
      <group ref={glow}>
        {piece.kind === "commander" ? (
          <mesh position={[0, 0.2, 0]} userData={{ glow: 0.85 }}>
            <sphereGeometry args={[0.02, 12, 12]} />
            <meshBasicMaterial
              color={glowColor}
              transparent
              opacity={0.7}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        ) : null}
        <mesh
          position={[0, 0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          userData={{ glow: selected ? 0.42 : 0.16 }}
        >
          <ringGeometry args={[0.2 * spec.span, 0.42 * spec.span, 36]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.18}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <group ref={marks} rotation={[0, directionYaw(piece.rot), 0]}>
          {Array.from({ length: 8 }, (_, dir) =>
            flags & (1 << dir) ? (
              <DirectionFin
                key={dir}
                dir={dir}
                kind={piece.kind}
                hullColor={color}
                finColor={finColor}
                glowColor={glowColor}
              />
            ) : null,
          )}
        </group>
      </group>
    </group>
  );
}

function nearestEquivalentAngle(angle: number, reference: number): number {
  const fullTurn = Math.PI * 2;
  return angle + Math.round((reference - angle) / fullTurn) * fullTurn;
}
