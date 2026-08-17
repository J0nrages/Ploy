import { expect, test } from "bun:test";
import { directionYaw, fileRank, squareAfterArrow } from "./catalog";
import { motionWithoutRotation, shouldStageShield } from "./interaction";
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

test("arrow keys stay on the 9x9 graph", () => {
  expect(squareAfterArrow(40, "ArrowUp")).toBe(49);
  expect(squareAfterArrow(40, "ArrowLeft")).toBe(39);
  expect(squareAfterArrow(0, "ArrowDown")).toBeNull();
  expect(squareAfterArrow(8, "ArrowRight")).toBeNull();
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
