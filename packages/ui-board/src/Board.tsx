import { OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import type { Color, Move, Piece, Snapshot, Square } from "@ploy/rules";
import {
  ARMY,
  baseMask,
  mixHex,
  projectedRoutes,
  toWorld,
  worldToSquare,
} from "./catalog";
import { Disc } from "./Disc";
import {
  destinationHover,
  stagedShieldRotationSteps,
  type DestinationHover,
  type ShieldStaging,
} from "./interaction";
import { Starfield } from "./Starfield";
import { cameraPositionForColor } from "./viewpoint";

export type ControlsPlacement = "top" | "bottom";
type RotationSteps = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const CONTROLS_PLACEMENT_KEY = "ploy.boardControlsPlacement";

export type BoardProps = {
  snapshot: Snapshot;
  selected: Square | null;
  legal: Move[];
  staging?: ShieldStaging | null;
  invalidAttempt?: number;
  actingColor: Color | null;
  perspectiveColor?: Color | null;
  controlsPlacement?: ControlsPlacement;
  onControlsPlacementChange?: (placement: ControlsPlacement) => void;
  showPlacementControls?: boolean;
  onSelectSquare: (square: Square) => void;
  onCommitRotation: (steps: 1 | 2 | 3 | 4 | 5 | 6 | 7) => void;
  onCommitStaging: (postMoveSteps?: 1 | 2 | 3 | 4 | 5 | 6 | 7) => void;
  onCancel: () => void;
};

const HOVER_COLORS = {
  legal: { color: "#4cc9f0", emissive: "#4cc9f0", fill: "#b8f2ff" },
  illegal: { color: "#ec625f", emissive: "#ff4d6d", fill: "#ffd0ce" },
} as const;
function squareFromPointer(event: ThreeEvent<MouseEvent | PointerEvent>): Square | null {
  const directionY = event.ray.direction.y;
  if (Math.abs(directionY) < Number.EPSILON) {
    return null;
  }
  const distance = -event.ray.origin.y / directionY;
  return worldToSquare(
    event.ray.origin.x + event.ray.direction.x * distance,
    event.ray.origin.z + event.ray.direction.z * distance,
  );
}

function PathNetwork({
  targets,
  hoveredSquare,
  hoverKind,
  onSelectSquare,
}: {
  targets: Set<Square>;
  hoveredSquare: Square | null;
  hoverKind: DestinationHover | null;
  onSelectSquare: (square: Square) => void;
}) {
  return (
    <group>
      {Array.from({ length: 9 }, (_, rank) =>
        Array.from({ length: 9 }, (_, file) => {
          const square = rank * 9 + file;
          const [x, , z] = toWorld(rank, file);
          const hot = targets.has(square);
          const hover = hoveredSquare === square ? hoverKind : null;
          const radius = hover || hot ? 0.11 : 0.075;
          const palette =
            hover === "legal"
              ? { color: HOVER_COLORS.legal.color, emissive: HOVER_COLORS.legal.emissive, intensity: 1.15 }
              : hover === "illegal"
                ? { color: HOVER_COLORS.illegal.color, emissive: HOVER_COLORS.illegal.emissive, intensity: 1.05 }
                : hot
                  ? { color: "#c77dff", emissive: "#9b5de5", intensity: 0.85 }
                  : { color: "#5c4d7a", emissive: "#2a1244", intensity: 0.15 };
          return (
            <mesh key={`v-${square}`} position={[x, 0, z]} onClick={() => onSelectSquare(square)}>
              <cylinderGeometry args={[radius, radius, 0.045, 16]} />
              <meshStandardMaterial
                color={palette.color}
                emissive={palette.emissive}
                emissiveIntensity={palette.intensity}
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
  hoveredSquare,
  onSelectSquare,
  onHoverSquare,
}: {
  legal: Move[];
  hoveredSquare: Square | null;
  onSelectSquare: (square: Square) => void;
  onHoverSquare: (square: Square | null) => void;
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
        if (square === hoveredSquare) {
          return null;
        }
        const rank = Math.floor(square / 9);
        const file = square % 9;
        const [x, , z] = toWorld(rank, file);
        return (
          <group
            key={`move-${square}`}
            position={[x, 0.09, z]}
            onPointerOver={(event) => {
              event.stopPropagation();
              onHoverSquare(square);
            }}
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

function HoverDestination({
  from,
  to,
  kind,
}: {
  from: Square;
  to: Square;
  kind: DestinationHover;
}) {
  const fromRank = Math.floor(from / 9);
  const fromFile = from % 9;
  const toRank = Math.floor(to / 9);
  const toFile = to % 9;
  const [x1, , z1] = toWorld(fromRank, fromFile);
  const [x2, , z2] = toWorld(toRank, toFile);
  const palette = HOVER_COLORS[kind];

  return (
    <group key={`${from}-${to}-${kind}`}>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([x1, 0.2, z1, x2, 0.2, z2]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={palette.color} transparent opacity={0.92} />
      </line>
      <group position={[x2, 0.09, z2]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.13, 0.24, 24]} />
          <meshStandardMaterial
            color={palette.color}
            emissive={palette.emissive}
            emissiveIntensity={1.2}
          />
        </mesh>
        <mesh position={[0, 0.015, 0]}>
          <sphereGeometry args={[0.07, 16, 8]} />
          <meshStandardMaterial
            color={palette.fill}
            emissive={palette.emissive}
            emissiveIntensity={1.25}
          />
        </mesh>
      </group>
    </group>
  );
}

function BoardHoverSensor({
  enabled,
  onHoverSquare,
  onSelectSquare,
}: {
  enabled: boolean;
  onHoverSquare: (square: Square | null) => void;
  onSelectSquare: (square: Square) => void;
}) {
  const squareFromEvent = (
    event: ThreeEvent<MouseEvent | PointerEvent>,
  ): Square | null =>
    squareFromPointer(event);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.55, 0]}
      onPointerMove={(event) => {
        if (!enabled) {
          onHoverSquare(null);
          return;
        }
        onHoverSquare(squareFromEvent(event));
      }}
      onClick={(event) => {
        event.stopPropagation();
        const square = squareFromEvent(event);
        if (square !== null) {
          onSelectSquare(square);
        }
      }}
    >
      <planeGeometry args={[10.5, 10.5]} />
      <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
    </mesh>
  );
}

function OrientationProjection(props: {
  snapshot: Snapshot;
  origin: Square;
  piece: Piece;
  steps: RotationSteps;
  vacatedSquare?: Square | undefined;
}) {
  const routes = useMemo(
    () =>
      projectedRoutes(
        props.snapshot,
        props.origin,
        props.piece,
        props.steps,
        props.vacatedSquare,
      ),
    [props.snapshot, props.origin, props.piece, props.steps, props.vacatedSquare],
  );
  const originRank = Math.floor(props.origin / 9);
  const originFile = props.origin % 9;
  const [originX, , originZ] = toWorld(originRank, originFile);

  return (
    <group>
      {routes.map((route) => {
        const destination = route.squares.at(-1);
        if (destination === undefined) {
          return null;
        }
        const destinationRank = Math.floor(destination / 9);
        const destinationFile = destination % 9;
        const [destinationX, , destinationZ] = toWorld(
          destinationRank,
          destinationFile,
        );
        return (
          <group key={`projection-${route.direction}`}>
            <line>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[
                    new Float32Array([
                      originX,
                      0.24,
                      originZ,
                      destinationX,
                      0.24,
                      destinationZ,
                    ]),
                    3,
                  ]}
                />
              </bufferGeometry>
              <lineBasicMaterial
                color="#4cc9f0"
                transparent
                opacity={0.72}
              />
            </line>
            {route.squares.map((square) => {
              const rank = Math.floor(square / 9);
              const file = square % 9;
              const [x, , z] = toWorld(rank, file);
              return (
                <mesh
                  key={`projection-point-${square}`}
                  position={[x, 0.2, z]}
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  <ringGeometry args={[0.11, 0.18, 24]} />
                  <meshStandardMaterial
                    color="#b8f2ff"
                    emissive="#4cc9f0"
                    emissiveIntensity={1.25}
                    transparent
                    opacity={0.95}
                  />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

function PieceControls(props: {
  piece: Piece;
  legal: Move[];
  staging: ShieldStaging | null;
  invalidAttempt: number;
  placement: ControlsPlacement;
  showPlacementControls: boolean;
  previewRotationSteps: RotationSteps | null;
  projectedMoveCount: number | null;
  hoverKind: DestinationHover | null;
  facingKeep: boolean;
  onPlacementChange: (placement: ControlsPlacement) => void;
  onCommitRotation: (steps: RotationSteps) => void;
  onCommitStaging: (postMoveSteps?: RotationSteps) => void;
  onPreviewRotation: (steps: RotationSteps | null) => void;
  onCancel: () => void;
}) {
  const rotationSteps = props.legal.flatMap((move) =>
    move.type === "rotate" ? [move.steps] : [],
  );
  const hasMotion = props.legal.some((move) => move.type === "motion");
  const stagedSteps =
    props.staging?.motions.flatMap((move) =>
      move.postMoveSteps === undefined ? [] : [move.postMoveSteps],
    ) ?? [];

  return (
    <section className={`piece-controls piece-controls-${props.placement}`} aria-label="Piece actions">
      <div className="piece-controls-copy">
        <div className="piece-controls-heading">
          <strong>{pieceName(props.piece)}</strong>
          <button type="button" aria-label="Close piece controls" onClick={props.onCancel}>
            ×
          </button>
        </div>
        <div className="piece-control-messages">
          {props.invalidAttempt > 0 && !props.staging && props.hoverKind !== "illegal" ? (
            <p className="piece-control-error">That piece cannot move there. Choose a gold point.</p>
          ) : null}
          {props.staging && (props.previewRotationSteps || props.facingKeep) ? (
            <p className="orientation-guidance is-previewing">
              {props.facingKeep
                ? "Blue: keep this facing. Click the point or Keep facing to finish the turn."
                : "Facing follows the cursor. Click the point or the highlighted rotation to finish."}
            </p>
          ) : props.hoverKind === "legal" ? (
            <p className="orientation-guidance is-previewing">
              Blue: this is a legal destination this turn. Click to move.
            </p>
          ) : props.hoverKind === "illegal" ? (
            <p className="piece-control-error">
              Red: this piece cannot move there this turn. Choose a rotation explicitly to change facing.
            </p>
          ) : props.staging ? (
            <p>Move selected. Keep the current facing or choose the resulting ray pattern.</p>
          ) : (
            <p>
              {props.piece.kind === "shield"
                ? "Move to a gold point and optionally rotate, or rotate here without moving."
                : hasMotion
                  ? "Choose one action: move to a gold point OR rotate here."
                  : "This piece cannot move from here. You can rotate it in place."}
            </p>
          )}
          {props.hoverKind || (props.staging && (props.previewRotationSteps || props.facingKeep)) ? null : (
            <p className={props.previewRotationSteps ? "orientation-guidance is-previewing" : "orientation-guidance"}>
              {props.previewRotationSteps
                ? props.projectedMoveCount === 0
                  ? "No projected move in this facing: its lane is blocked or points off the board."
                  : "Blue points are projected next-turn moves if the board stays unchanged."
                : "Hover a nearby reachable point to preview a move, or a rotation to preview its next-turn lanes."}
            </p>
          )}
        </div>
      </div>
      <div className="piece-control-actions">
        {props.staging ? (
          <button
            type="button"
            className={
              props.facingKeep
                ? "orientation-choice keep-facing is-previewing"
                : "orientation-choice keep-facing"
            }
            onPointerEnter={() => props.onPreviewRotation(null)}
            onFocus={() => props.onPreviewRotation(null)}
            onClick={() => props.onCommitStaging()}
          >
            <OrientationPreview piece={props.piece} steps={0} />
            <span>
              <strong>Keep facing</strong>
              <small>Current rays</small>
            </span>
          </button>
        ) : null}
        {(props.staging ? stagedSteps : rotationSteps).map((steps) => (
          <button
            type="button"
            className={
              steps === props.previewRotationSteps
                ? "orientation-choice is-previewing"
                : "orientation-choice"
            }
            key={steps}
            aria-label={rotationAriaLabel(props.piece, steps)}
            onPointerEnter={() => props.onPreviewRotation(steps)}
            onPointerLeave={() => props.onPreviewRotation(null)}
            onFocus={() => props.onPreviewRotation(steps)}
            onBlur={() => props.onPreviewRotation(null)}
            onClick={() =>
              props.staging
                ? props.onCommitStaging(steps)
                : props.onCommitRotation(steps)
            }
          >
            <OrientationPreview piece={props.piece} steps={steps} />
            <span>
              <strong>{rotationPrimaryLabel(props.piece, steps)}</strong>
              <small>+{steps * 45}°</small>
            </span>
          </button>
        ))}
      </div>
      {props.showPlacementControls ? (
        <div className="controls-placement" aria-label="Action controls position">
          <span>Panel</span>
          <button
            type="button"
            className={props.placement === "top" ? "is-selected" : ""}
            aria-pressed={props.placement === "top"}
            onClick={() => props.onPlacementChange("top")}
          >
            Top
          </button>
          <button
            type="button"
            className={props.placement === "bottom" ? "is-selected" : ""}
            aria-pressed={props.placement === "bottom"}
            onClick={() => props.onPlacementChange("bottom")}
          >
            Bottom
          </button>
        </div>
      ) : null}
    </section>
  );
}

function OrientationPreview(props: { piece: Piece; steps: 0 | RotationSteps }) {
  const rotation = (props.piece.rot + props.steps) % 8;
  const base = baseMask(props.piece);
  const mask = ((base << rotation) | (base >> (8 - rotation))) & 0xff;
  const color = ARMY[props.piece.color] ?? "#ffffff";
  const hull = mixHex(color, "#1a1024", 0.18);
  const highlight = mixHex(color, "#fff6d8", 0.38);
  const uid = `${props.piece.id}-${props.steps}`.replace(/[^a-zA-Z0-9_-]/g, "");

  return (
    <svg className="orientation-preview" viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <radialGradient id={`hull-${uid}`} cx="36%" cy="30%" r="72%">
          <stop offset="0%" stopColor={highlight} />
          <stop offset="52%" stopColor={color} />
          <stop offset="100%" stopColor={hull} />
        </radialGradient>
        <radialGradient id={`core-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff8e4" />
          <stop offset="100%" stopColor={highlight} />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill={color} opacity="0.22" />
      <circle
        cx="20"
        cy="20"
        r="16.4"
        fill={`url(#hull-${uid})`}
        stroke="rgba(255,255,255,.38)"
        strokeWidth="1.2"
      />
      <circle cx="20" cy="20" r="10.6" fill="none" stroke="rgba(12,6,18,.28)" strokeWidth="0.7" />
      {Array.from({ length: 8 }, (_, direction) => {
        if ((mask & (1 << direction)) === 0) {
          return null;
        }
        const angle = (direction * Math.PI) / 4;
        const left = angle - 0.17;
        const right = angle + 0.17;
        const inner = 3.4;
        const outer = 15.6;
        const tipX = 20 + Math.sin(angle) * outer;
        const tipY = 20 - Math.cos(angle) * outer;
        const vane = [
          `M ${20 + Math.sin(left) * inner} ${20 - Math.cos(left) * inner}`,
          `L ${20 + Math.sin(left) * (outer - 1.1)} ${20 - Math.cos(left) * (outer - 1.1)}`,
          `L ${tipX} ${tipY}`,
          `L ${20 + Math.sin(right) * (outer - 1.1)} ${20 - Math.cos(right) * (outer - 1.1)}`,
          `L ${20 + Math.sin(right) * inner} ${20 - Math.cos(right) * inner}`,
          "Z",
        ].join(" ");
        const pipe = [
          `M ${20 + Math.sin(angle) * 4.2} ${20 - Math.cos(angle) * 4.2}`,
          `L ${20 + Math.sin(left) * (outer - 1.6)} ${20 - Math.cos(left) * (outer - 1.6)}`,
          `L ${tipX} ${tipY}`,
          `L ${20 + Math.sin(right) * (outer - 1.6)} ${20 - Math.cos(right) * (outer - 1.6)}`,
          "Z",
        ].join(" ");
        return (
          <g key={direction}>
            <path d={vane} fill="#160c22" />
            <path d={pipe} fill="#fff4d2" />
            <circle cx={tipX} cy={tipY} r="1.55" fill={highlight} />
          </g>
        );
      })}
      <circle cx="20" cy="20" r="3.15" fill="#140c1c" />
      <circle cx="20" cy="20" r="1.55" fill={`url(#core-${uid})`} />
    </svg>
  );
}

export function PloyBoard({
  snapshot,
  selected,
  legal,
  staging = null,
  invalidAttempt = 0,
  actingColor,
  perspectiveColor = null,
  controlsPlacement: controlledControlsPlacement,
  onControlsPlacementChange,
  showPlacementControls = true,
  onSelectSquare,
  onCommitRotation,
  onCommitStaging,
  onCancel,
}: BoardProps) {
  const [trayRotationSteps, setTrayRotationSteps] = useState<
    1 | 2 | 3 | 4 | 5 | 6 | 7 | null
  >(null);
  const [hoveredSquare, setHoveredSquare] = useState<Square | null>(null);
  const [storedControlsPlacement, setStoredControlsPlacement] =
    useState<ControlsPlacement>(loadControlsPlacement);
  const controlsPlacement =
    controlledControlsPlacement ?? storedControlsPlacement;

  useEffect(() => {
    setTrayRotationSteps(null);
    setHoveredSquare(null);
  }, [selected, snapshot.ply]);

  const targets = useMemo(() => {
    const set = new Set<Square>();
    if (staging) {
      set.add(staging.to);
      return set;
    }
    for (const move of legal) {
      if (move.type === "motion") {
        set.add(move.to);
      }
    }
    return set;
  }, [legal, staging]);
  const actionSquare = staging?.to ?? selected;
  const sourceSquare = staging?.from ?? selected;
  const selectedActionPiece =
    sourceSquare === null
      ? null
      : snapshot.board[Math.floor(sourceSquare / 9)]?.[sourceSquare % 9] ?? null;
  const actionPiece =
    selectedActionPiece?.controller === actingColor ? selectedActionPiece : null;
  const hoverKind =
    actingColor === null
      ? null
      : destinationHover({
          snapshot,
          actingColor,
          selected,
          staging,
          selectedMoves: legal,
          hovered: hoveredSquare,
        });
  const boardRotationSteps = stagedShieldRotationSteps(
    staging,
    hoveredSquare,
    actionPiece,
  );
  const facingHover = boardRotationSteps !== null;
  const facingKeep = Boolean(
    staging &&
      trayRotationSteps === null &&
      facingHover &&
      (boardRotationSteps === 0 || boardRotationSteps === null),
  );
  const pathHoverKind =
    hoverKind ?? (staging && facingHover ? "legal" : null);
  const previewRotationSteps =
    trayRotationSteps ??
    (boardRotationSteps && boardRotationSteps > 0 ? boardRotationSteps : null);
  const projectedMoveCount =
    previewRotationSteps && actionSquare !== null && actionPiece
      ? projectedRoutes(
          snapshot,
          actionSquare,
          actionPiece,
          previewRotationSteps,
          staging?.from,
        ).reduce((total, route) => total + route.squares.length, 0)
      : null;
  const changeControlsPlacement = (placement: ControlsPlacement): void => {
    setStoredControlsPlacement(placement);
    storeControlsPlacement(placement);
    onControlsPlacementChange?.(placement);
  };
  const cameraPosition = cameraPositionForColor(snapshot.mode, perspectiveColor);

  const controls = actionPiece ? (
    <PieceControls
      piece={actionPiece}
      legal={legal}
      staging={staging}
      invalidAttempt={invalidAttempt}
      placement={controlsPlacement}
      showPlacementControls={showPlacementControls}
      previewRotationSteps={previewRotationSteps}
      projectedMoveCount={projectedMoveCount}
      hoverKind={hoverKind}
      facingKeep={facingKeep}
      onPlacementChange={changeControlsPlacement}
      onCommitRotation={onCommitRotation}
      onCommitStaging={onCommitStaging}
      onPreviewRotation={setTrayRotationSteps}
      onCancel={onCancel}
    />
  ) : null;

  return (
    <div className={`board-shell controls-${controlsPlacement}`}>
      {controlsPlacement === "top" ? controls : null}
      <div className="board-canvas">
        <Canvas
          camera={{ position: cameraPosition, fov: 38 }}
          onPointerLeave={() => setHoveredSquare(null)}
          onPointerMissed={() => setHoveredSquare(null)}
        >
      <color attach="background" args={["#070314"]} />
      <fog attach="fog" args={["#070314", 22, 55]} />
      <Starfield />
      <hemisphereLight args={["#9eb8ff", "#1a0c2c", 0.42]} />
      <ambientLight intensity={0.34} />
      <directionalLight position={[4, 16, 2]} intensity={1.35} color="#fff4e6" />
      <directionalLight position={[-6, 8, -4]} intensity={0.32} color="#7ab8ff" />
      <pointLight position={[-8, 6, -6]} intensity={0.4} color="#9b5de5" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
        <circleGeometry args={[7.4, 64]} />
        <meshStandardMaterial color="#1a0c2c" metalness={0.15} roughness={0.7} />
      </mesh>
      <PathNetwork
        targets={targets}
        hoveredSquare={hoveredSquare}
        hoverKind={pathHoverKind}
        onSelectSquare={onSelectSquare}
      />
      <BoardHoverSensor
        enabled={selected !== null}
        onHoverSquare={setHoveredSquare}
        onSelectSquare={onSelectSquare}
      />
      {staging ? null : <LegalRays legal={legal} selected={selected} />}
      {staging ? null : (
        <MoveTargets
          legal={legal}
          hoveredSquare={hoverKind ? hoveredSquare : null}
          onSelectSquare={onSelectSquare}
          onHoverSquare={setHoveredSquare}
        />
      )}
      {hoverKind && selected !== null && hoveredSquare !== null ? (
        <HoverDestination from={selected} to={hoveredSquare} kind={hoverKind} />
      ) : staging &&
        facingHover &&
        trayRotationSteps === null &&
        actionSquare !== null &&
        hoveredSquare !== null ? (
        <HoverDestination from={actionSquare} to={hoveredSquare} kind="legal" />
      ) : null}
      {previewRotationSteps && actionSquare !== null && actionPiece ? (
        <OrientationProjection
          snapshot={snapshot}
          origin={actionSquare}
          piece={actionPiece}
          steps={previewRotationSteps}
          vacatedSquare={staging?.from}
        />
      ) : null}
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
              onHover={() =>
                setHoveredSquare(staging?.from === square ? staging.to : square)
              }
            />,
          ];
        }),
      )}
      <OrbitControls
        enablePan={false}
        minDistance={9}
        maxDistance={20}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.2}
      />
        </Canvas>
      </div>
      {controlsPlacement === "bottom" ? controls : null}
    </div>
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

function rotationPrimaryLabel(piece: Piece, steps: RotationSteps): string {
  if (piece.kind === "shield") {
    return DIRECTION_NAMES[(piece.rot + steps) % 8] ?? "Rotate";
  }
  return "Rotate";
}

function rotationAriaLabel(piece: Piece, steps: RotationSteps): string {
  const degrees = steps * 45;
  if (piece.kind === "shield") {
    const direction = DIRECTION_NAMES[(piece.rot + steps) % 8] ?? "new direction";
    return `Rotate to ${direction}, ${degrees} degrees clockwise`;
  }
  return `Rotate ${degrees} degrees clockwise to the shown ray pattern`;
}

export function loadControlsPlacement(): ControlsPlacement {
  try {
    if (typeof window === "undefined") {
      return "bottom";
    }
    return window.localStorage.getItem(CONTROLS_PLACEMENT_KEY) === "top"
      ? "top"
      : "bottom";
  } catch {
    return "bottom";
  }
}

export function storeControlsPlacement(placement: ControlsPlacement): void {
  try {
    window.localStorage.setItem(CONTROLS_PLACEMENT_KEY, placement);
  } catch {
    // The in-memory preference still works when browser storage is unavailable.
  }
}
