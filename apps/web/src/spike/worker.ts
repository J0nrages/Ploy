/// <reference lib="webworker" />
import { SPIKE_MOVE, wrapInstance } from "@ploy/rules";

const wasmUrl = new URL("../../../../packages/rules/wasm/ploy_core.wasm", import.meta.url);

type SpikeRequest = { type: "apply-fixture" };

const ready = (async () => {
  const response = await fetch(wasmUrl);
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  return wrapInstance(instance);
})();

void ready.then(() => {
  postMessage({ type: "ready" });
});

onmessage = async (event: MessageEvent<SpikeRequest>) => {
  if (event.data.type !== "apply-fixture") {
    return;
  }
  const api = await ready;
  const start = api.createGame("twoPlayer");
  const json = api.applyMoveRaw(start, SPIKE_MOVE, "green");
  postMessage({ type: "fixture", json });
};
