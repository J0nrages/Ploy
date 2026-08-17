import { v } from "convex/values";
import { action } from "./_generated/server";
import wasmModule from "./generated/ploy_core.wasm";
import { SPIKE_MOVE, wrapInstance } from "../packages/rules/src/index.ts";

export const applyFixture = action({
  args: {},
  returns: v.string(),
  handler: async () => {
    const instance = await WebAssembly.instantiate(wasmModule, {});
    const api = wrapInstance(instance);
    const start = api.createGame("twoPlayer");
    return api.applyMoveRaw(start, SPIKE_MOVE, "green");
  },
});
