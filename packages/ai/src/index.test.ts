import { expect, test } from "bun:test";
import { createGame, initializeRules, isLegal, legalMoves } from "@ploy/rules";
import { AiError, createPloyBot, searchOptionsForProfile } from "./index";

test("AiError is constructible", () => {
  const error = new AiError("engineFailure");
  expect(error.code).toBe("engineFailure");
});

test("opponent profile options are stable per game turn and revision", () => {
  const profile = { strength: "navigator", style: "guardian" } as const;
  const first = searchOptionsForProfile(profile, 42, 8, 3);
  const retry = searchOptionsForProfile(profile, 42, 8, 3);
  const nextTurn = searchOptionsForProfile(profile, 42, 10, 3);
  expect(first).toEqual(retry);
  expect(first.randomSeed).not.toBe(nextTurn.randomSeed);
  expect(first.style).toBe("guardian");
  expect(first.maxScoreLoss).toBe(40);
});

test("worker chooses a legal two-player move", async () => {
  await initializeRules();
  const bot = createPloyBot();
  const snapshot = createGame("twoPlayer");
  const result = await bot.chooseMove(
    snapshot,
    "green",
    { maxTimeMs: 5_000, maxDepth: 1, maxNodes: 200, randomSeed: 4 },
    new AbortController().signal,
  );
  expect(result.nodes).toBeGreaterThan(0);
  expect(isLegal(snapshot, result.move, "green")).toBe(true);
  bot.terminate();
});

test("worker referee scores the actual human move with balanced search", async () => {
  await initializeRules();
  const bot = createPloyBot();
  const snapshot = createGame("twoPlayer");
  const moves = legalMoves(snapshot, "green");
  const playedMove = moves.at(-1)!;
  const review = await bot.reviewMove(
    snapshot,
    "green",
    playedMove,
    { maxTimeMs: 5_000, maxDepth: 1, maxNodes: 100_000, randomSeed: 9 },
    new AbortController().signal,
  );
  expect(review.legalMoveCount).toBe(moves.length);
  expect(review.depth).toBe(1);
  expect(review.scoreLoss).toBe(review.bestScore - review.playedScore);
  expect(isLegal(snapshot, review.bestMove, "green")).toBe(true);
  bot.terminate();
});

test("abort rejects and the recreated worker handles the next turn", async () => {
  const bot = createPloyBot();
  const snapshot = createGame("twoPlayer");
  const controller = new AbortController();
  const pending = bot.chooseMove(
    snapshot,
    "green",
    { maxTimeMs: 5_000, maxDepth: 2, maxNodes: 8_000, randomSeed: 1 },
    controller.signal,
  );
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: "aborted" });
  const recovered = await bot.chooseMove(
    snapshot,
    "green",
    { maxTimeMs: 5_000, maxDepth: 1, maxNodes: 200, randomSeed: 2 },
    new AbortController().signal,
  );
  expect(isLegal(snapshot, recovered.move, "green")).toBe(true);
  bot.terminate();
});

test("timeout terminates the search worker and the replacement recovers", async () => {
  const bot = createPloyBot();
  const snapshot = createGame("twoPlayer");
  const timedOut = bot.chooseMove(
    snapshot,
    "green",
    { maxTimeMs: 1, maxDepth: 8, maxNodes: 2_000_000, randomSeed: 5 },
    new AbortController().signal,
  );
  await expect(timedOut).rejects.toMatchObject({ code: "timeout" });
  const recovered = await bot.chooseMove(
    snapshot,
    "green",
    { maxTimeMs: 5_000, maxDepth: 1, maxNodes: 200, randomSeed: 6 },
    new AbortController().signal,
  );
  expect(isLegal(snapshot, recovered.move, "green")).toBe(true);
  bot.terminate();
});
