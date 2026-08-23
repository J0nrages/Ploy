import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  BufferAttribute,
  ExtrudeGeometry,
  LatheGeometry,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Shape,
  SplineCurve,
  Vector2,
  Vector3,
} from "three";
import type { Group } from "three";
import type { Piece } from "@ploy/rules";
import { baseMask, directionYaw, toWorld } from "./catalog";

type RotationSteps = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const BODY_APEX = 0.625;
const FIN_PEAK = 0.925;
const FIN_WIDTH = 0.16;
const FIN_TAPER = 0.5;
const PIECE_SCALE = 0.4;

/*
 * Approved molded-piece build from ploy-pieces.html. The body and blade
 * geometry are shared by every piece; the rules-owned direction mask decides
 * how many blades are mounted and the rotation state turns the blade group.
 */
const BODY_GEOMETRY = createBodyGeometry();
const FIN_GEOMETRY = createFinGeometry();
const PIECE_MATERIALS: Record<Piece["color"], MeshPhysicalMaterial> = {
  green: createPieceMaterial(0x2ea44f),
  coral: createPieceMaterial(0xd23b16),
  blue: createPieceMaterial(0x4da7c8),
  yellow: createPieceMaterial(0xd8d32c),
};

function createPieceMaterial(color: number): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: 0.32,
    clearcoat: 0.7,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.55,
  });
}

function createBodyGeometry(): LatheGeometry {
  const profile = [
    new Vector2(0, 0.05),
    new Vector2(0.55, 0.05),
    new Vector2(0.66, 0.044),
    new Vector2(0.7, 0),
    new Vector2(0.81, 0),
    new Vector2(0.99, 0.14),
    new Vector2(0.993, 0.144),
    new Vector2(1.004, 0.23),
    new Vector2(1.008, 0.3),
    new Vector2(1, 0.398),
    new Vector2(0.998, 0.402),
  ];
  const cone = new SplineCurve([
    new Vector2(0.995, 0.404),
    new Vector2(0.85, 0.472),
    new Vector2(0.62, 0.535),
    new Vector2(0.4, 0.578),
    new Vector2(0.2, 0.607),
    new Vector2(0, BODY_APEX),
  ]).getPoints(40);
  return new LatheGeometry(profile.concat(cone), 128);
}

function createFinGeometry(): ExtrudeGeometry {
  const edgeFillet = 0.022;
  const coreWidth = FIN_WIDTH - edgeFillet * 2;
  const shape = new Shape();
  shape.moveTo(0.05, 0.18);
  shape.lineTo(0.9, 0.18);
  shape.lineTo(0.95, 0.3);
  shape.lineTo(0.974, 0.404);
  shape.lineTo(0.9145, 0.845);
  shape.quadraticCurveTo(0.904, FIN_PEAK, 0.87, FIN_PEAK);
  shape.bezierCurveTo(0.62, FIN_PEAK, 0.35, 0.62, 0.05, BODY_APEX - 0.05);
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, {
    depth: coreWidth,
    steps: 1,
    curveSegments: 24,
    bevelEnabled: true,
    bevelThickness: edgeFillet,
    bevelSize: edgeFillet,
    bevelSegments: 5,
  });
  geometry.translate(0, 0, -coreWidth / 2);

  const positions = geometry.getAttribute("position");
  if (!(positions instanceof BufferAttribute)) {
    throw new Error("Piece fin geometry requires a position buffer");
  }
  for (let index = 0; index < positions.count; index += 1) {
    const taper =
      FIN_TAPER +
      (1 - FIN_TAPER) * Math.min(1, Math.max(0, positions.getX(index) / 0.955));
    positions.setZ(index, positions.getZ(index) * taper);
  }
  positions.needsUpdate = true;
  smoothNormals(geometry, 42);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function smoothNormals(geometry: ExtrudeGeometry, angleDegrees: number): void {
  const threshold = Math.cos((angleDegrees * Math.PI) / 180);
  const positions = geometry.getAttribute("position");
  if (!(positions instanceof BufferAttribute)) {
    throw new Error("Piece fin geometry requires a position buffer");
  }
  const faceNormals: Vector3[] = [];
  const capFaces: boolean[] = [];
  const facesByVertex = new Map<string, number[]>();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const cb = new Vector3();
  const ab = new Vector3();
  const vertexKey = (index: number): string =>
    `${Math.round(positions.getX(index) * 1e4)}_${Math.round(
      positions.getY(index) * 1e4,
    )}_${Math.round(positions.getZ(index) * 1e4)}`;

  for (let offset = 0; offset < positions.count; offset += 3) {
    a.fromBufferAttribute(positions, offset);
    b.fromBufferAttribute(positions, offset + 1);
    c.fromBufferAttribute(positions, offset + 2);
    cb.subVectors(c, b);
    ab.subVectors(a, b);
    cb.cross(ab).normalize();
    faceNormals.push(cb.clone());
    capFaces.push(Math.abs(cb.z) > 0.995);

    for (let corner = 0; corner < 3; corner += 1) {
      const key = vertexKey(offset + corner);
      const faceIndex = offset / 3;
      const matchingFaces = facesByVertex.get(key);
      if (matchingFaces) {
        matchingFaces.push(faceIndex);
      } else {
        facesByVertex.set(key, [faceIndex]);
      }
    }
  }

  const normalAttribute = new BufferAttribute(new Float32Array(positions.count * 3), 3);
  const blended = new Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    const ownFaceIndex = Math.floor(index / 3);
    const ownNormal = faceNormals[ownFaceIndex];
    const ownIsCap = capFaces[ownFaceIndex];
    if (!ownNormal || ownIsCap === undefined) {
      continue;
    }

    blended.set(0, 0, 0);
    const matchingFaces = facesByVertex.get(vertexKey(index)) ?? [];
    for (const faceIndex of matchingFaces) {
      const candidate = faceNormals[faceIndex];
      if (
        candidate &&
        capFaces[faceIndex] === ownIsCap &&
        candidate.dot(ownNormal) > threshold
      ) {
        blended.add(candidate);
      }
    }
    if (blended.lengthSq() < 1e-8) {
      blended.copy(ownNormal);
    }
    blended.normalize();
    normalAttribute.setXYZ(index, blended.x, blended.y, blended.z);
  }
  geometry.setAttribute("normal", normalAttribute);
}

function DirectionBlade({
  direction,
  material,
}: {
  direction: number;
  material: MeshPhysicalMaterial;
}) {
  return (
    <mesh
      castShadow
      rotation={[0, directionYaw(direction) + Math.PI / 2, 0]}
    >
      <primitive object={FIN_GEOMETRY} attach="geometry" />
      <primitive object={material} attach="material" />
    </mesh>
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
  previewRotationSteps?: RotationSteps | null;
  onSelect: () => void;
}) {
  const flags = baseMask(piece);
  const position = toWorld(rank, file);
  const material = PIECE_MATERIALS[piece.color];
  const group = useRef<Group>(null);
  const blades = useRef<Group>(null);
  const selectionHalo = useRef<MeshBasicMaterial>(null);
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
    const hoverY = selected ? 0.08 : 0.018;
    displayedPosition.current[0] +=
      (position[0] - displayedPosition.current[0]) * positionAlpha;
    displayedPosition.current[1] +=
      (position[1] + hoverY - displayedPosition.current[1]) * positionAlpha;
    displayedPosition.current[2] +=
      (position[2] - displayedPosition.current[2]) * positionAlpha;
    shakeRemaining.current = Math.max(0, shakeRemaining.current - delta);
    const shakeProgress = 0.34 - shakeRemaining.current;
    const shakeOffset =
      shakeRemaining.current > 0
        ? Math.sin(shakeProgress * 75) * 0.12 * (shakeRemaining.current / 0.34)
        : 0;
    node.position.set(
      displayedPosition.current[0] + shakeOffset,
      displayedPosition.current[1],
      displayedPosition.current[2],
    );
    const scaleTarget = PIECE_SCALE * (selected ? 1.08 : 1);
    const scale = node.scale.x + (scaleTarget - node.scale.x) * positionAlpha;
    node.scale.setScalar(scale);

    if (blades.current) {
      const rotationAlpha = 1 - Math.exp(-delta * 9);
      displayedYaw.current += (targetYaw.current - displayedYaw.current) * rotationAlpha;
      blades.current.rotation.y = displayedYaw.current;
    }
    if (selectionHalo.current) {
      selectionHalo.current.opacity = selected
        ? 0.55 + Math.sin(state.clock.elapsedTime * 4) * 0.16
        : 0;
    }
  });

  return (
    <group
      ref={group}
      scale={PIECE_SCALE}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.08, 48]} />
        <meshStandardMaterial color="#050208" transparent opacity={0.48} roughness={1} />
      </mesh>
      <mesh castShadow receiveShadow>
        <primitive object={BODY_GEOMETRY} attach="geometry" />
        <primitive object={material} attach="material" />
      </mesh>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.04, 1.14, 64]} />
        <meshBasicMaterial
          ref={selectionHalo}
          color="#f4d35e"
          transparent
          opacity={selected ? 0.65 : 0}
          depthWrite={false}
        />
      </mesh>
      <group ref={blades} rotation={[0, directionYaw(piece.rot), 0]}>
        {Array.from({ length: 8 }, (_, direction) =>
          flags & (1 << direction) ? (
            <DirectionBlade
              key={direction}
              direction={direction}
              material={material}
            />
          ) : null,
        )}
      </group>
    </group>
  );
}

function nearestEquivalentAngle(angle: number, reference: number): number {
  const fullTurn = Math.PI * 2;
  return angle + Math.round((reference - angle) / fullTurn) * fullTurn;
}
