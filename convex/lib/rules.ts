import wasmModule from "../generated/ploy_core.wasm";
import { wrapInstance } from "../../packages/rules/src/runtime.ts";

export async function loadRules() {
  const instance = await WebAssembly.instantiate(wasmModule, {});
  return wrapInstance(instance);
}
