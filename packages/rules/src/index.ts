export type {
  Color,
  Mode,
  Move,
  Piece,
  Rotation,
  RulesErrorCode,
  Snapshot,
  Square,
  Team,
  WasmResponse,
  Winner,
} from "./types";

export { RulesError } from "./errors";
export {
  wrapInstance,
  type MoveReview,
  type MoveReviewRequest,
  type RulesAdapter,
  type SearchResult,
} from "./runtime";
export { SPIKE_MOVE } from "./spike-fixture";

import { RulesError } from "./errors";
import { parseSnapshot as parseSnapshotImpl } from "./parse";
import { wrapInstance, type RulesAdapter } from "./runtime";
import type { Color, Mode, Move, Snapshot } from "./types";

let adapter: RulesAdapter | null = null;

async function loadWasmBytes(): Promise<ArrayBuffer> {
  const url = new URL("../wasm/ploy_core.wasm", import.meta.url);
  const bun = (globalThis as { Bun?: { file: (path: URL) => { arrayBuffer: () => Promise<ArrayBuffer> } } })
    .Bun;
  if (bun) {
    return bun.file(url).arrayBuffer();
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new RulesError("rulesNotInitialized", `failed to fetch wasm (${response.status})`);
  }
  return response.arrayBuffer();
}

export async function initializeRules(): Promise<void> {
  if (adapter) {
    return;
  }
  const bytes = await loadWasmBytes();
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module, {});
  adapter = wrapInstance(instance);
}

function requireAdapter(): RulesAdapter {
  if (!adapter) {
    throw new RulesError("rulesNotInitialized");
  }
  return adapter;
}

export function createGame(mode: Mode): Snapshot {
  return requireAdapter().createGame(mode);
}

export function controllerForTurn(snapshot: Snapshot): Color | null {
  return requireAdapter().controllerForTurn(snapshot);
}

export function sameSide(mode: Mode, a: Color, b: Color): boolean {
  return requireAdapter().sameSide(mode, a, b);
}

export function legalMoves(snapshot: Snapshot, color: Color): Move[] {
  return requireAdapter().legalMoves(snapshot, color);
}

export function isLegal(snapshot: Snapshot, move: Move, color: Color): boolean {
  return requireAdapter().isLegal(snapshot, move, color);
}

export function applyMove(snapshot: Snapshot, move: Move, color: Color): Snapshot {
  return requireAdapter().applyMove(snapshot, move, color);
}

export function parseSnapshot(data: unknown): Snapshot {
  return parseSnapshotImpl(data);
}
