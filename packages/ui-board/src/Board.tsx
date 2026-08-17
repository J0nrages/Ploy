import { Html, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import type { Color, Move, Piece, Snapshot, Square } from "@ploy/rules";
import { toWorld } from "./catalog";
import { Disc } from "./Disc";
import type { ShieldStaging } from "./interaction";
import { Starfield } from "./Starfield";

export type BoardProps = {
  snapshot: Snapshot;
  selected: Square | null;
  legal: Move[];
  staging?: ShieldStaging | null;
  invalidAttempt?: number;
  actingColor: Color | null;
  onSelectSquare: (square: Square) => void;
  onCommitRotation: (steps: 1 | 2 | 3 | 4 | 5 | 6 | 7) => void;
  onCommitStaging: (postMoveSteps?: 1 | 2 | 3 | 4 | 5 | 6 | 7) => void;
  onCancel: () => void;
};

function PathNetwork({
  targets,
  onSelectSquare,
}: {
  targets: Set<Square>;
  onSelectSquare: (square: Square) => void;
}) {
  return (
    <group>
      {Array.from({ length: 9 }, (_, rank) =>
        Array.from({ length: 9 }, (_, file) => {
          const square = rank * 9 + file;
          const [x, , z] = toWorld(rank, file);
          const hot = targets.has(square);
          return (
            <mesh key={`v-${square}`} position={[x, 0, z]} onClick={() => onSelectSquare(square)}>
              <cylinderGeometry args={[hot ? 0.11 : 0.075, hot ? 0.11 : 0.075, 0.045, 16]} />
              <meshStandardMaterial
                color={hot ? "#c77dff" : "#5c4d7a"}
                emissive={hot ? "#9b5de5" : "#2a1244"}
                emissiveIntensity={hot ? 0.85 : 0.15}
              />
            </mesh>
          );
        }),
      )}
      {Array.from({ length: 9 }, (_, rank) =>
        Array.from({ length: 9 }, (_, file) => {
          const neighbors: Array<[number, number]> = [
            [1, 0],
            [1, 1],
            [0, 1],
            [1, -1],
          ];
          return neighbors.map(([dRank, dFile]) => {
            const nextRank = rank + dRank;
            const nextFile = file + dFile;
            if (nextRank < 0 || nextRank > 8 || nextFile < 0 || nextFile > 8) {
              return null;
            }
            const [x1, , z1] = toWorld(rank, file);
            const [x2, , z2] = toWorld(nextRank, nextFile);
            return (
              <line key={`e-${rank}-${file}-${nextRank}-${nextFile}`}>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    args={[new Float32Array([x1, 0.012, z1, x2, 0.012, z2]), 3]}
                  />
                </bufferGeometry>
                <lineBasicMaterial color="#7a54b8" transparent opacity={0.85} />
              </line>
            );
          });
        }),
      )}
    </group>
  );
}

function LegalRays({ legal, selected }: { legal: Move[]; selected: Square | null }) {
  const segments = useMemo(() => {
    return legal.flatMap((move) => {
      if (move.type !== "motion" || (selected !== null && move.from !== selected)) {
        return [];
      }
      const fromRank = Math.floor(move.from / 9);
      const fromFile = move.from % 9;
      const toRank = Math.floor(move.to / 9);
      const toFile = move.to % 9;
      const [x1, , z1] = toWorld(fromRank, fromFile);
      const [x2, , z2] = toWorld(toRank, toFile);
      return [[x1, 0.18, z1, x2, 0.18, z2] as const];
    });
  }, [legal, selected]);

  return (
    <group>
      {segments.map((segment, index) => (
        <line key={`ray-${index}`}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(segment), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#f4d35e" transparent opacity={0.95} />
        </line>
      ))}
    </group>
  );
}

function MoveTargets({
  legal,
  onSelectSquare,
}: {
  legal: Move[];
  onSelectSquare: (square: Square) => void;
}) {
  const targets = useMemo(
    () =>
      Array.from(
        new Set(
          legal.flatMap((move) => (move.type === "motion" ? [move.to] : [])),
        ),
      ),
    [legal],
  );

  return (
    <group>
      {targets.map((square) => {
        const rank = Math.floor(square / 9);
        const file = square % 9;
        const [x, , z] = toWorld(rank, file);
        return (
          <group
            key={`move-${square}`}
            position={[x, 0.09, z]}
            onClick={(event) => {
              event.stopPropagation();
              onSelectSquare(square);
            }}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.13, 0.22, 24]} />
              <meshStandardMaterial
                color="#f4d35e"
                emissive="#f4d35e"
                emissiveIntensity={0.8}
              />
            </mesh>
            <mesh position={[0, 0.015, 0]}>
              <sphereGeometry args={[0.065, 16, 8]} />
              <meshStandardMaterial
                color="#fff4ad"
                emissive="#f4d35e"
                emissiveIntensity={1.1}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function PieceControls(props: {
  piece: Piece;
  square: Square;
  legal: Move[];
  staging: ShieldStaging | null;
  invalidAttempt: number;
  onCommitRotation: (steps: 1 | 2 | 3 | 4 | 5 | 6 | 7) => void;
  onCommitStaging: (postMoveSteps?: 1 | 2 | 3 | 4 | 5 | 6 | 7) => void;
  onPreviewRotation: (steps: 1 | 2 | 3 | 4 | 5 | 6 | 7 | null) => void;
  onCancel: () => void;
}) {
  const rank = Math.floor(props.square / 9);
  const file = props.square % 9;
  const [x, , z] = toWorld(rank, file);
  const controlX = x + (file >= 4 ? -2.3 : 2.3);
  const rotationSteps = props.legal.flatMap((move) =>
    move.type === "rotate" ? [move.steps] : [],
  );
  const hasMotion = props.legal.some((move) => move.type === "motion");
  const stagedSteps =
    props.staging?.motions.flatMap((move) =>
      move.postMoveSteps === undefined ? [] : [move.postMoveSteps],
    ) ?? [];

  return (
    <Html position={[controlX, 0.68, z]} center zIndexRange={[100, 0]}>
      <div
        className="piece-controls"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="piece-controls-heading">
          <strong>{pieceName(props.piece)}</strong>
          <button type="button" aria-label="Close piece controls" onClick={props.onCancel}>
            ×
          </button>
        </div>
        {props.invalidAttempt > 0 ? (
          <p className="piece-control-error">That piece cannot move there. Choose a gold point.</p>
        ) : null}
        {props.staging ? (
          <>
            <p>
              Move selected. Finish this turn by keeping the facing or rotating the Shield.
            </p>
            <div className="piece-control-actions">
              <button type="button" className="primary" onClick={() => props.onCommitStaging()}>
                Keep facing
              </button>
              {stagedSteps.map((steps) => (
                <button
                  type="button"
                  key={steps}
                  onPointerEnter={() => props.onPreviewRotation(steps)}
                  onPointerLeave={() => props.onPreviewRotation(null)}
                  onFocus={() => props.onPreviewRotation(steps)}
                  onBlur={() => props.onPreviewRotation(null)}
                  onClick={() => props.onCommitStaging(steps)}
                >
                  {rotationLabel(props.piece, steps)}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p>
              {props.piece.kind === "shield"
                ? "Move to a gold point, then optionally rotate. Or rotate here without moving."
                : hasMotion
                  ? "Choose one action: move to a gold point OR rotate here."
                  : "This piece cannot move from here. You can rotate it in place."}
            </p>
            {rotationSteps.length > 0 ? (
              <div className="piece-control-actions">
                {rotationSteps.map((steps) => (
                  <button
                    type="button"
                    key={steps}
                    onPointerEnter={() => props.onPreviewRotation(steps)}
                    onPointerLeave={() => props.onPreviewRotation(null)}
                    onFocus={() => props.onPreviewRotation(steps)}
                    onBlur={() => props.onPreviewRotation(null)}
                    onClick={() => props.onCommitRotation(steps)}
                  >
                    {rotationLabel(props.piece, steps)}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </Html>
  );
}

export function PloyBoard({
  snapshot,
  selected,
  legal,
  staging = null,
  invalidAttempt = 0,
  onSelectSquare,
  onCommitRotation,
  onCommitStaging,
  onCancel,
}: BoardProps) {
  const [previewRotationSteps, setPreviewRotationSteps] = useState<
    1 | 2 | 3 | 4 | 5 | 6 | 7 | null
  >(null);

  useEffect(() => {
    setPreviewRotationSteps(null);
  }, [selected, staging?.to, snapshot.ply]);

  const targets = useMemo(() => {
    const set = new Set<Square>();
    for (const move of legal) {
      if (move.type === "motion") {
        set.add(move.to);
      }
    }
    if (staging) {
      set.add(staging.to);
    }
    return set;
  }, [legal, staging]);
  const actionSquare = staging?.to ?? selected;
  const sourceSquare = staging?.from ?? selected;
  const actionPiece =
    sourceSquare === null
      ? null
      : snapshot.board[Math.floor(sourceSquare / 9)]?.[sourceSquare % 9] ?? null;

  return (
    <Canvas camera={{ position: [0, 12.5, 12.5], fov: 38 }} style={{ width: "100%", height: "100%" }}>
      <color attach="background" args={["#070314"]} />
      <fog attach="fog" args={["#070314", 22, 55]} />
      <Starfield />
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 16, 2]} intensity={1.55} color="#fff4e6" />
      <pointLight position={[-8, 6, -6]} intensity={0.55} color="#9b5de5" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
        <circleGeometry args={[7.4, 64]} />
        <meshStandardMaterial color="#1a0c2c" metalness={0.15} roughness={0.7} />
      </mesh>
      <PathNetwork targets={targets} onSelectSquare={onSelectSquare} />
      <LegalRays legal={legal} selected={selected} />
      {staging ? null : <MoveTargets legal={legal} onSelectSquare={onSelectSquare} />}
      {snapshot.board.flatMap((row, rank) =>
        row.flatMap((piece, file) => {
          if (!piece) {
            return [];
          }
          const square = rank * 9 + file;
          const displayedRank =
            staging?.from === square ? Math.floor(staging.to / 9) : rank;
          const displayedFile = staging?.from === square ? staging.to % 9 : file;
          return [
            <Disc
              key={piece.id}
              piece={piece}
              rank={displayedRank}
              file={displayedFile}
              selected={selected === square}
              invalidAttempt={selected === square ? invalidAttempt : 0}
              previewRotationSteps={
                selected === square ? previewRotationSteps : null
              }
              onSelect={() => onSelectSquare(square)}
            />,
          ];
        }),
      )}
      {actionSquare !== null && actionPiece ? (
        <PieceControls
          piece={actionPiece}
          square={actionSquare}
          legal={legal}
          staging={staging}
          invalidAttempt={invalidAttempt}
          onCommitRotation={onCommitRotation}
          onCommitStaging={onCommitStaging}
          onPreviewRotation={setPreviewRotationSteps}
          onCancel={onCancel}
        />
      ) : null}
      <OrbitControls
        enablePan={false}
        minDistance={9}
        maxDistance={20}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.2}
      />
    </Canvas>
  );
}

function pieceName(piece: Piece): string {
  return piece.kind.charAt(0).toUpperCase() + piece.kind.slice(1);
}

const DIRECTION_NAMES = [
  "North",
  "Northeast",
  "East",
  "Southeast",
  "South",
  "Southwest",
  "West",
  "Northwest",
] as const;

function rotationLabel(piece: Piece, steps: 1 | 2 | 3 | 4 | 5 | 6 | 7): string {
  const degrees = steps * 45;
  if (piece.kind === "shield") {
    const direction = DIRECTION_NAMES[(piece.rot + steps) % 8];
    return `${direction} · ${degrees}°`;
  }
  return `↻ ${degrees}°`;
}
