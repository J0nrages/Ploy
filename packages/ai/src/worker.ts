/// <reference lib="webworker" />
import { wrapInstance, type SearchResult } from "@ploy/rules";
import type { Color, Snapshot } from "@ploy/rules";
import type { OpponentStyle } from "./index";

const wasmUrl = new URL("../../rules/wasm/ploy_core.wasm", import.meta.url);

type ChooseRequest = {
  type: "choose";
  requestId: number;
  snapshot: Snapshot;
  color: Color;
  maxDepth?: number;
  maxNodes: number;
  randomSeed: number;
  style?: OpponentStyle;
  maxScoreLoss?: number;
};

const ready = (async () => {
  const response = await fetch(wasmUrl);
  const bytes = await response.arrayBuffer();
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module, {});
  return wrapInstance(instance);
})();

void ready
  .then(() => postMessage({ type: "ready" }))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "failed to initialize engine";
    postMessage({ type: "fatal", message });
  });

onmessage = async (event: MessageEvent<ChooseRequest>) => {
  if (event.data.type !== "choose") {
    return;
  }
  try {
    const api = await ready;
    const result: SearchResult = api.chooseMove({
      snapshot: event.data.snapshot,
      color: event.data.color,
      maxDepth: event.data.maxDepth,
      maxNodes: event.data.maxNodes,
      randomSeed: event.data.randomSeed,
      style: event.data.style,
      maxScoreLoss: event.data.maxScoreLoss,
    });
    postMessage({ type: "result", requestId: event.data.requestId, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "engineFailure";
    postMessage({ type: "error", requestId: event.data.requestId, message });
  }
};
