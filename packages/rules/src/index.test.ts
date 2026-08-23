import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";
import {
  applyMove,
  createGame,
  initializeRules,
  parseSnapshot,
  RulesError,
  SPIKE_MOVE,
} from "./index";
import { wrapInstance } from "./runtime";

const RULES_WASM = new URL("../wasm/ploy_core.wasm", import.meta.url);

test("RulesError is constructible", () => {
  const error = new RulesError("rulesNotInitialized");
  expect(error.code).toBe("rulesNotInitialized");
});

test("parseSnapshot is available before initialization", () => {
  expect(() => parseSnapshot({})).toThrow(RulesError);
});

test("WASM-backed calls throw before initializeRules", () => {
  const isolated = spawnSync(
    process.execPath,
    [
      "-e",
      `import { createGame, RulesError } from "./packages/rules/src/index.ts";
       try { createGame("twoPlayer"); process.exit(1); }
       catch (error) { process.exit(error instanceof RulesError ? 0 : 2); }`,
    ],
    { cwd: process.cwd() },
  );
  expect(isolated.status).toBe(0);
});

test("compiled module imports nothing", () => {
  const rulesBytes = readFileSync(RULES_WASM);
  const module = new WebAssembly.Module(rulesBytes);
  expect(WebAssembly.Module.imports(module)).toEqual([]);
});

test("initializeRules then apply the opening shield motion", async () => {
  await initializeRules();
  const start = createGame("twoPlayer");
  const parsed = parseSnapshot(start);
  expect(parsed.turnSeat).toBe("green");
  expect(parsed.board.flat().filter((cell) => cell !== null)).toHaveLength(30);
  const next = applyMove(start, SPIKE_MOVE, "green");
  expect(next.ply).toBe(1);
  expect(next.turnSeat).toBe("coral");
  expect(next.board[3]?.[4]?.id).toBe("green:shield2");
});

test("wrapInstance applyMoveRaw is stable JSON", async () => {
  const bytes = readFileSync(RULES_WASM);
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const api = wrapInstance(instance);
  const start = api.createGame("twoPlayer");
  const first = api.applyMoveRaw(start, SPIKE_MOVE, "green");
  const second = api.applyMoveRaw(start, SPIKE_MOVE, "green");
  expect(first).toBe(second);
  expect(first.startsWith('{"ok":true')).toBe(true);
});
