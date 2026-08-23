import { expect, test } from "bun:test";
import { AiError, createPloyBot, type PloyBot, type SearchResult } from "@ploy/ai";
import { applyMove, createGame, initializeRules, isLegal, SPIKE_MOVE } from "@ploy/rules";
import {
  isStaleTurnError,
  reducedRetryOptions,
  searchComputerMove,
  snapshotTurnKey,
  submitPendingComputerMove,
  type PendingComputerMove,
} from "./computerTurn";

test("human move flows through the Worker and back through authoritative applyMove", async () => {
  await initializeRules();
  const afterHuman = applyMove(createGame("twoPlayer"), SPIKE_MOVE, "green");
  const bot = createPloyBot();
  try {
    const result = await searchComputerMove({
      bot,
      snapshot: afterHuman,
      color: "coral",
      options: { maxTimeMs: 5_000, maxDepth: 1, maxNodes: 200, randomSeed: 13 },
      signal: new AbortController().signal,
    });
    expect(isLegal(afterHuman, result.move, "coral")).toBe(true);
    const afterComputer = applyMove(afterHuman, result.move, "coral");
    expect(afterComputer.ply).toBe(2);
    expect(afterComputer.turnSeat).toBe("green");
  } finally {
    bot.terminate();
  }
});

test("timeout retries once with a smaller deterministic budget", async () => {
  const result: SearchResult = {
    move: { type: "rotate", at: 0, steps: 1 },
    depth: 1,
    nodes: 250,
    score: 0,
    bestScore: 0,
    scoreLoss: 0,
    principalVariation: [{ type: "rotate", at: 0, steps: 1 }],
    fallback: "none",
  };
  const calls: number[] = [];
  const bot: PloyBot = {
    async chooseMove(_snapshot, _color, options) {
      calls.push(options.maxNodes);
      if (calls.length === 1) {
        throw new AiError("timeout");
      }
      return result;
    },
    terminate() {},
  };
  const snapshot = createGame("twoPlayer");
  const selected = await searchComputerMove({
    bot,
    snapshot,
    color: "green",
    options: { maxTimeMs: 500, maxDepth: 3, maxNodes: 40_000, randomSeed: 2 },
    signal: new AbortController().signal,
  });
  expect(selected).toBe(result);
  expect(calls).toEqual([40_000, 20_000]);
});

test("turn keys change for alternative positions at the same ply", () => {
  const start = createGame("twoPlayer");
  const first = applyMove(start, SPIKE_MOVE, "green");
  const alternate = applyMove(
    start,
    { type: "rotate", at: 3, steps: 1 },
    "green",
  );
  expect(first.ply).toBe(alternate.ply);
  expect(snapshotTurnKey("game", first, "coral")).not.toBe(
    snapshotTurnKey("game", alternate, "coral"),
  );
});

test("retry options remain within useful bounds", () => {
  expect(
    reducedRetryOptions({ maxTimeMs: 200, maxDepth: 1, maxNodes: 250, randomSeed: 1 }),
  ).toEqual({ maxTimeMs: 200, maxDepth: 1, maxNodes: 250, randomSeed: 1 });
});

test("a failed acknowledgement retries the exact move and request id", async () => {
  const pending: PendingComputerMove = {
    move: { type: "rotate", at: 3, steps: 1 },
    operation: {
      requestId: "stable-request",
      expectedPly: 0,
      turnKey: "game:0:green",
    },
  };
  const attempts: PendingComputerMove[] = [];
  const submit = async (
    move: PendingComputerMove["move"],
    operation: PendingComputerMove["operation"],
  ): Promise<void> => {
    attempts.push({ move, operation });
    if (attempts.length === 1) {
      throw new Error("network acknowledgement lost");
    }
  };

  await expect(submitPendingComputerMove(pending, submit)).rejects.toThrow(
    "network acknowledgement lost",
  );
  await submitPendingComputerMove(pending, submit);

  expect(attempts).toEqual([pending, pending]);
  expect(attempts[0]?.operation.requestId).toBe(attempts[1]?.operation.requestId);
});

test("only stale-ply failures discard a pending result", () => {
  expect(isStaleTurnError(new Error("stale expected ply"))).toBe(true);
  expect(isStaleTurnError(new Error("computer lease is not current"))).toBe(false);
  expect(isStaleTurnError("stale expected ply")).toBe(false);
});
