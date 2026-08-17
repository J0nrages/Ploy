import { expect, test } from "bun:test";
import { applyMove, createGame, initializeRules, legalMoves, SPIKE_MOVE, type Move } from "@ploy/rules";
import { buildMoveTimeline, describeTransition } from "./moveTimeline";

test("timeline describes a shield slide from consecutive snapshots", async () => {
  await initializeRules();
  const start = createGame("twoPlayer");
  const next = applyMove(start, SPIKE_MOVE, "green");
  const entry = describeTransition(start, next);

  expect(entry).toEqual({
    ply: 1,
    color: "green",
    summary: "Shield e3 → e4",
  });
  expect(buildMoveTimeline([start], next)[0]).toEqual(entry);
});

test("timeline describes an in-place rotation", async () => {
  await initializeRules();
  const start = createGame("twoPlayer");
  const rotate = legalMoves(start, "green").find(
    (move): move is Extract<Move, { type: "rotate" }> => move.type === "rotate",
  );
  if (!rotate) {
    throw new Error("Opening Green position is missing a rotation");
  }
  const next = applyMove(start, rotate, "green");
  const entry = describeTransition(start, next);

  expect(entry?.ply).toBe(1);
  expect(entry?.color).toBe("green");
  expect(entry?.summary).toMatch(/rotates \+\d+° at [a-i][1-9]|faces /);
});

test("timeline lists newest completed ply first", async () => {
  await initializeRules();
  const start = createGame("twoPlayer");
  const afterGreen = applyMove(start, SPIKE_MOVE, "green");
  const coralMove = legalMoves(afterGreen, "coral").find(
    (move): move is Extract<Move, { type: "motion" }> => move.type === "motion",
  );
  if (!coralMove) {
    throw new Error("Coral opening is missing a motion");
  }
  const afterCoral = applyMove(afterGreen, coralMove, "coral");
  const timeline = buildMoveTimeline([start, afterGreen], afterCoral);

  expect(timeline).toHaveLength(2);
  expect(timeline[0]?.ply).toBe(2);
  expect(timeline[0]?.color).toBe("coral");
  expect(timeline[1]?.ply).toBe(1);
  expect(timeline[1]?.summary).toBe("Shield e3 → e4");
});
