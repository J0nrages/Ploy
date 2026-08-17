import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { Group } from "three";
import type { Piece } from "@ploy/rules";
import { ARMY, baseMask, directionYaw, toWorld } from "./catalog";

function DirectionMark({ dir, selected }: { dir: number; selected: boolean }) {
  return (
    <group rotation={[0, directionYaw(dir), 0]}>
      <mesh position={[0, 0.078, -0.16]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.13, 0.028, 0.28]} />
        <meshStandardMaterial
          color="#14081c"
          metalness={0.15}
          roughness={0.45}
          emissive={selected ? "#2a1244" : "#000000"}
          emissiveIntensity={selected ? 0.2 : 0}
        />
      </mesh>
      <mesh position={[0, 0.09, -0.17]}>
        <boxGeometry args={[0.034, 0.016, 0.26]} />
        <meshStandardMaterial
          color="#f4efe6"
          metalness={0.35}
          roughness={0.25}
          emissive="#fff4d6"
          emissiveIntensity={selected ? 0.45 : 0.18}
        />
      </mesh>
      <mesh position={[0, 0.082, -0.355]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.075, 0.12, 3]} />
        <meshStandardMaterial color="#14081c" metalness={0.2} roughness={0.4} />
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
  const position = toWorld(rank, file);
  const group = useRef<Group>(null);
  const marks = useRef<Group>(null);
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

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) {
      return;
    }
    const positionAlpha = 1 - Math.exp(-delta * 11);
    displayedPosition.current[0] +=
      (position[0] - displayedPosition.current[0]) * positionAlpha;
    displayedPosition.current[1] +=
      (position[1] - displayedPosition.current[1]) * positionAlpha;
    displayedPosition.current[2] +=
      (position[2] - displayedPosition.current[2]) * positionAlpha;
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
    const scaleTarget = selected ? 1.08 : 1;
    const scale = node.scale.x + (scaleTarget - node.scale.x) * positionAlpha;
    node.scale.setScalar(scale);

    const marksNode = marks.current;
    if (marksNode) {
      const rotationAlpha = 1 - Math.exp(-delta * 9);
      displayedYaw.current +=
        (targetYaw.current - displayedYaw.current) * rotationAlpha;
      marksNode.rotation.y = displayedYaw.current;
    }
  });

  return (
    <group
      ref={group}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.4, 28]} />
        <meshStandardMaterial color="#0b0612" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.045, 0]}>
        <cylinderGeometry args={[0.33, 0.38, 0.08, 40]} />
        <meshStandardMaterial
          color={color}
          emissive={selected ? color : "#000000"}
          emissiveIntensity={selected ? 0.28 : 0.04}
          metalness={0.22}
          roughness={0.42}
        />
      </mesh>
      <mesh position={[0, 0.086, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.325, 40]} />
        <meshStandardMaterial
          color={color}
          emissive={selected ? color : color}
          emissiveIntensity={selected ? 0.22 : 0.06}
          metalness={0.18}
          roughness={0.38}
        />
      </mesh>
      <mesh position={[0, 0.09, 0]}>
        <cylinderGeometry args={[0.055, 0.07, 0.03, 16]} />
        <meshStandardMaterial color="#1b1028" metalness={0.4} roughness={0.3} />
      </mesh>
      <group ref={marks} rotation={[0, directionYaw(piece.rot), 0]}>
        {Array.from({ length: 8 }, (_, dir) =>
          flags & (1 << dir) ? <DirectionMark key={dir} dir={dir} selected={selected} /> : null,
        )}
      </group>
    </group>
  );
}

function nearestEquivalentAngle(angle: number, reference: number): number {
  const fullTurn = Math.PI * 2;
  return angle + Math.round((reference - angle) / fullTurn) * fullTurn;
}
