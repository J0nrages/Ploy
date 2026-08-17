import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { SPIKE_MOVE, wrapInstance } from "../packages/rules/src/index.ts";

test("Convex-style instantiate(module, {}) matches the rules adapter JSON", async () => {
  const bytes = readFileSync(new URL("./generated/ploy_core.wasm", import.meta.url));
  const module = await WebAssembly.compile(bytes);
  expect(WebAssembly.Module.imports(module)).toEqual([]);
  const instance = await WebAssembly.instantiate(module, {});
  const api = wrapInstance(instance);
  const json = api.applyMoveRaw(api.createGame("twoPlayer"), SPIKE_MOVE, "green");
  expect(json.startsWith('{"ok":true')).toBe(true);
  expect(json).toContain('"ply":1');
});
