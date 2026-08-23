import { expect, test } from "bun:test";
import {
  directionYaw,
  fileRank,
  inFacingHoverRange,
  mixHex,
  projectedRoutes,
  rotationStepsToward,
  squareAfterArrow,
  worldToSquare,
  moveRange,
} from "./catalog";
import {
  destinationHover,
  isSelectablePiece,
  motionWithoutRotation,
  movesFrom,
  pieceAt,
  shouldStageShield,
} from "./interaction";
import { createGame, initializeRules, legalMoves, type Move, type Piece } from "@ploy/rules";

test("renderer maps clockwise engine directions onto board coordinates", () => {
  expect(directionYaw(0)).toBeCloseTo(0);
  expect(directionYaw(1)).toBeCloseTo(-Math.PI / 4);
  expect(directionYaw(2)).toBeCloseTo(-Math.PI / 2);
  expect(directionYaw(4)).toBeCloseTo(-Math.PI);
  expect(directionYaw(6)).toBeCloseTo((-3 * Math.PI) / 2);

  const engineDeltas = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  for (const [direction, expected] of engineDeltas.entries()) {
    const yaw = directionYaw(direction);
    const rendered = [
      Math.round(Math.cos(yaw)) || 0,
      Math.round(-Math.sin(yaw)) || 0,
    ];
    expect(rendered).toEqual(expected);
  }
});

test("rendered rays point toward authoritative legal destinations", async () => {
  await initializeRules();
  const snapshot = createGame("twoPlayer");
  const motions = legalMoves(snapshot, "green").filter(
    (move): move is Extract<Move, { type: "motion" }> => move.type === "motion",
  );
  const directionByDelta = new Map([
    ["1,0", 0],
    ["1,1", 1],
    ["0,1", 2],
    ["-1,1", 3],
    ["-1,0", 4],
    ["-1,-1", 5],
    ["0,-1", 6],
    ["1,-1", 7],
  ]);

  for (const move of motions) {
    const rankDelta = Math.sign(Math.floor(move.to / 9) - Math.floor(move.from / 9));
    const fileDelta = Math.sign((move.to % 9) - (move.from % 9));
    const direction = directionByDelta.get(`${rankDelta},${fileDelta}`);
    expect(direction).toBeDefined();
    const yaw = directionYaw(direction ?? 0);
    const renderedWorldDelta = [
      Math.round(-Math.sin(yaw)) || 0,
      Math.round(-Math.cos(yaw)) || 0,
    ];
    const legalWorldDelta = [fileDelta || 0, -rankDelta || 0];
    expect(renderedWorldDelta).toEqual(legalWorldDelta);
  }
});

test("fileRank maps e3", () => {
  expect(fileRank(22)).toBe("e3");
});

test("mixHex blends army paint toward a second hex", () => {
  expect(mixHex("#3ad67a", "#ffffff", 0)).toBe("#3ad67a");
  expect(mixHex("#3ad67a", "#000000", 1)).toBe("#000000");
  expect(mixHex("#ff0000", "#0000ff", 0.5)).toBe("#800080");
});

test("rotation projections show the resulting movement lanes at piece range", async () => {
  await initializeRules();
  const snapshot = createGame("twoPlayer");
  const lance = snapshot.board
    .flat()
    .find((piece): piece is Extract<Piece, { kind: "lance" }> => piece?.kind === "lance");
  if (!lance) {
    throw new Error("Opening position is missing a Lance");
  }
  const board = snapshot.board.map((row, rank) =>
    row.map((_, file) => (rank === 4 && file === 4 ? lance : null)),
  );
  const isolated = { ...snapshot, board };
  const routes = projectedRoutes(isolated, 40, lance, 1);

  expect(routes).toHaveLength(3);
  expect(routes.every((route) => route.squares.length === 3)).toBe(true);
});

test("arrow keys stay on the 9x9 graph", () => {
  expect(squareAfterArrow(40, "ArrowUp")).toBe(49);
  expect(squareAfterArrow(40, "ArrowLeft")).toBe(39);
  expect(squareAfterArrow(0, "ArrowDown")).toBeNull();
  expect(squareAfterArrow(8, "ArrowRight")).toBeNull();
});

test("only the acting controller's pieces open action controls", async () => {
  await initializeRules();
  const snapshot = createGame("twoPlayer");
  const greenSquare = snapshot.board
    .flat()
    .findIndex((piece) => piece?.controller === "green");
  const coralSquare = snapshot.board
    .flat()
    .findIndex((piece) => piece?.controller === "coral");

  expect(isSelectablePiece(snapshot, "green", greenSquare)).toBe(true);
  expect(isSelectablePiece(snapshot, "green", coralSquare)).toBe(false);
  expect(isSelectablePiece(snapshot, "green", 40)).toBe(false);
});

test("shield staging is required when a post-move rotation exists", () => {
  const shield: Piece = {
    id: "green:shield1",
    color: "green",
    controller: "green",
    kind: "shield",
    rot: 0,
  };
  const motions: Extract<Move, { type: "motion" }>[] = [
    { type: "motion", from: 21, to: 30 },
    { type: "motion", from: 21, to: 30, postMoveSteps: 1 },
  ];
  expect(shouldStageShield(shield, motions)).toBe(true);
  expect(motionWithoutRotation(motions)?.postMoveSteps).toBeUndefined();
});

test("worldToSquare snaps nearby pointers onto the 9x9 graph", () => {
  expect(worldToSquare(0, 0)).toBe(40);
  expect(worldToSquare(0.4, 0)).toBe(40);
  expect(worldToSquare(1, 0)).toBe(41);
  expect(worldToSquare(-4, 4)).toBe(0);
  expect(worldToSquare(10, 0)).toBeNull();
});

test("destination hover only previews legal moves and nearby reachable squares", async () => {
  await initializeRules();
  const snapshot = createGame("twoPlayer");
  const motion = legalMoves(snapshot, "green").find(
    (move): move is Extract<Move, { type: "motion" }> => move.type === "motion",
  );
  if (!motion) {
    throw new Error("Opening green position has no motion");
  }
  const selectedMoves = movesFrom(snapshot, "green", motion.from);
  const destinations = new Set(
    selectedMoves.flatMap((move) => (move.type === "motion" ? [move.to] : [])),
  );
  const piece = pieceAt(snapshot, motion.from);
  if (!piece) {
    throw new Error("Opening motion is missing a piece");
  }
  const reach = Math.min(2, moveRange(piece));
  const nearbyIllegal = [...Array(81).keys()].find((square) => {
    const rankDelta = Math.abs(Math.floor(square / 9) - Math.floor(motion.from / 9));
    const fileDelta = Math.abs((square % 9) - (motion.from % 9));
    const distance = Math.max(rankDelta, fileDelta);
    return (
      square !== motion.from &&
      !destinations.has(square) &&
      pieceAt(snapshot, square) === null &&
      distance >= 1 &&
      distance <= reach &&
      (rankDelta === 0 || fileDelta === 0 || rankDelta === fileDelta)
    );
  });
  const farEmpty = [...Array(81).keys()].find((square) => {
    const rankDelta = Math.abs(Math.floor(square / 9) - Math.floor(motion.from / 9));
    const fileDelta = Math.abs((square % 9) - (motion.from % 9));
    return (
      pieceAt(snapshot, square) === null &&
      !destinations.has(square) &&
      Math.max(rankDelta, fileDelta) > 2
    );
  });
  const otherGreen = snapshot.board
    .flat()
    .findIndex((item, square) => item?.controller === "green" && square !== motion.from);
  if (nearbyIllegal === undefined || farEmpty === undefined || otherGreen < 0) {
    throw new Error("Opening position is missing hover fixtures");
  }

  expect(
    destinationHover({
      snapshot,
      actingColor: "green",
      selected: null,
      staging: null,
      selectedMoves,
      hovered: motion.to,
    }),
  ).toBeNull();
  expect(
    destinationHover({
      snapshot,
      actingColor: "green",
      selected: motion.from,
      staging: null,
      selectedMoves,
      hovered: motion.to,
    }),
  ).toBe("legal");
  expect(
    destinationHover({
      snapshot,
      actingColor: "green",
      selected: motion.from,
      staging: null,
      selectedMoves,
      hovered: nearbyIllegal,
    }),
  ).toBe("illegal");
  expect(
    destinationHover({
      snapshot,
      actingColor: "green",
      selected: motion.from,
      staging: null,
      selectedMoves,
      hovered: farEmpty,
    }),
  ).toBeNull();
  expect(
    destinationHover({
      snapshot,
      actingColor: "green",
      selected: motion.from,
      staging: null,
      selectedMoves,
      hovered: otherGreen,
    }),
  ).toBeNull();
  expect(
    destinationHover({
      snapshot,
      actingColor: "green",
      selected: motion.from,
      staging: null,
      selectedMoves,
      hovered: motion.from,
    }),
  ).toBeNull();
});

test("rotation preview turns the piece toward a hovered square", () => {
  expect(rotationStepsToward(40, 49, 0)).toBe(0);
  expect(rotationStepsToward(40, 41, 0)).toBe(2);
  expect(rotationStepsToward(40, 41, 2)).toBe(0);
  expect(rotationStepsToward(40, 40, 0)).toBeNull();
});

test("facing hover stays within two spaces of the acting piece", () => {
  const shield: Piece = {
    id: "green:shield1",
    color: "green",
    controller: "green",
    kind: "shield",
    rot: 0,
  };
  expect(inFacingHoverRange(40, 49, shield)).toBe(true);
  expect(inFacingHoverRange(40, 58, shield)).toBe(false);
  expect(inFacingHoverRange(40, 40, shield)).toBe(false);
});

test("destination hover is idle while a Shield move is staged", async () => {
  await initializeRules();
  const snapshot = createGame("twoPlayer");
  const motion = legalMoves(snapshot, "green").find(
    (move): move is Extract<Move, { type: "motion" }> => move.type === "motion",
  );
  if (!motion) {
    throw new Error("Opening green position has no motion");
  }
  const selectedMoves = movesFrom(snapshot, "green", motion.from);
  expect(
    destinationHover({
      snapshot,
      actingColor: "green",
      selected: motion.from,
      staging: { from: motion.from, to: motion.to, motions: [motion] },
      selectedMoves,
      hovered: motion.to,
    }),
  ).toBeNull();
});
