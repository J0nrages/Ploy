/// <reference lib="webworker" />
import { wrapInstance } from "@ploy/rules";
import type { Color, Move, Snapshot } from "@ploy/rules";
import type { MoveReview, OpponentStyle, SearchResult } from "./index";

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

type ReviewRequest = {
  type: "review";
  requestId: number;
  snapshot: Snapshot;
  color: Color;
  playedMove: Move;
  maxDepth?: number;
  maxNodes: number;
  randomSeed: number;
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

onmessage = async (event: MessageEvent<ChooseRequest | ReviewRequest>) => {
  try {
    const api = await ready;
    if (event.data.type === "review") {
      const started = performance.now();
      const coreResult = api.reviewMove({
        snapshot: event.data.snapshot,
        color: event.data.color,
        playedMove: event.data.playedMove,
        maxDepth: event.data.maxDepth,
        maxNodes: event.data.maxNodes,
        randomSeed: event.data.randomSeed,
      });
      const result: MoveReview = {
        ...coreResult,
        elapsedMs: performance.now() - started,
      };
      postMessage({ type: "reviewResult", requestId: event.data.requestId, result });
    } else {
      const started = performance.now();
      const coreResult = api.chooseMove({
        snapshot: event.data.snapshot,
        color: event.data.color,
        maxDepth: event.data.maxDepth,
        maxNodes: event.data.maxNodes,
        randomSeed: event.data.randomSeed,
        style: event.data.style,
        maxScoreLoss: event.data.maxScoreLoss,
      });
      const result: SearchResult = {
        ...coreResult,
        elapsedMs: performance.now() - started,
      };
      postMessage({ type: "result", requestId: event.data.requestId, result });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "engineFailure";
    postMessage({ type: "error", requestId: event.data.requestId, message });
  }
};
