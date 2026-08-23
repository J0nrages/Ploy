import { RulesError } from "./errors";
import type {
  Color,
  Mode,
  Move,
  RulesErrorCode,
  Snapshot,
  WasmResponse,
} from "./types";

export type SearchRequest = {
  snapshot: Snapshot;
  color: Color;
  maxDepth?: number;
  maxNodes: number;
  randomSeed: number;
  style?: "balanced" | "aggressor" | "guardian" | "maneuverer" | "trickster";
  maxScoreLoss?: number;
};

export type SearchResult = {
  move: Move;
  depth: number;
  nodes: number;
  score: number;
  bestScore: number;
  scoreLoss: number;
  principalVariation: Move[];
  fallback: "none" | "static";
};

export type MoveReviewRequest = {
  snapshot: Snapshot;
  color: Color;
  playedMove: Move;
  maxDepth?: number;
  maxNodes: number;
  randomSeed: number;
};

export type MoveReview = {
  bestMove: Move;
  depth: number;
  nodes: number;
  playedScore: number;
  bestScore: number;
  scoreLoss: number;
  legalMoveCount: number;
  principalVariation: Move[];
  fallback: "none" | "static";
};

export type RulesAdapter = {
  createGame(mode: Mode): Snapshot;
  controllerForTurn(snapshot: Snapshot): Color | null;
  sameSide(mode: Mode, a: Color, b: Color): boolean;
  legalMoves(snapshot: Snapshot, color: Color): Move[];
  isLegal(snapshot: Snapshot, move: Move, color: Color): boolean;
  applyMove(snapshot: Snapshot, move: Move, color: Color): Snapshot;
  applyMoveRaw(snapshot: Snapshot, move: Move, color: Color): string;
  chooseMove(request: SearchRequest): SearchResult;
  reviewMove(request: MoveReviewRequest): MoveReview;
};

type WasmExports = {
  memory: WebAssembly.Memory;
  ploy_alloc(len: number): number;
  ploy_dealloc(ptr: number, len: number): void;
  create_game(ptr: number, len: number): number;
  controller_for_turn(ptr: number, len: number): number;
  same_side(ptr: number, len: number): number;
  legal_moves(ptr: number, len: number): number;
  is_legal(ptr: number, len: number): number;
  apply_move(ptr: number, len: number): number;
  choose_move(ptr: number, len: number): number;
  review_move(ptr: number, len: number): number;
};

const RULES_CODES: ReadonlySet<string> = new Set([
  "rulesNotInitialized",
  "invalidSnapshot",
  "invalidMove",
  "notYourTurn",
  "gameOver",
  "noSuchPiece",
  "wrongController",
]);

function isWasmExports(value: WebAssembly.Exports): value is WasmExports {
  return (
    value.memory instanceof WebAssembly.Memory &&
    typeof value.ploy_alloc === "function" &&
    typeof value.ploy_dealloc === "function" &&
    typeof value.create_game === "function" &&
    typeof value.controller_for_turn === "function" &&
    typeof value.same_side === "function" &&
    typeof value.legal_moves === "function" &&
    typeof value.is_legal === "function" &&
    typeof value.apply_move === "function" &&
    typeof value.choose_move === "function" &&
    typeof value.review_move === "function"
  );
}

function throwRulesError(code: string, message: string): never {
  if (RULES_CODES.has(code)) {
    throw new RulesError(code as RulesErrorCode, message);
  }
  throw new RulesError("invalidSnapshot", `${code}: ${message}`);
}

export function wrapInstance(instance: WebAssembly.Instance): RulesAdapter {
  if (!isWasmExports(instance.exports)) {
    throw new RulesError("rulesNotInitialized", "WASM instance is missing the Ploy ABI");
  }
  const wasm = instance.exports;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const callRaw = (fn: (ptr: number, len: number) => number, payload: unknown): string => {
    const request = encoder.encode(JSON.stringify(payload));
    const requestPtr = wasm.ploy_alloc(request.byteLength);
    if (request.byteLength > 0 && requestPtr === 0) {
      throw new RulesError("invalidSnapshot", "ploy_alloc returned null");
    }
    if (request.byteLength > 0) {
      new Uint8Array(wasm.memory.buffer, requestPtr, request.byteLength).set(request);
    }
    const responsePtr = fn(requestPtr, request.byteLength);
    wasm.ploy_dealloc(requestPtr, request.byteLength);
    if (responsePtr === 0) {
      throw new RulesError("invalidSnapshot", "WASM returned a null response");
    }
    const header = new DataView(wasm.memory.buffer, responsePtr, 4);
    const payloadLength = header.getUint32(0, true);
    const json = decoder.decode(new Uint8Array(wasm.memory.buffer, responsePtr + 4, payloadLength));
    wasm.ploy_dealloc(responsePtr, payloadLength + 4);
    return json;
  };

  const call = <T>(fn: (ptr: number, len: number) => number, payload: unknown): T => {
    const json = callRaw(fn, payload);
    const parsed = JSON.parse(json) as WasmResponse<T>;
    if (!parsed.ok) {
      throwRulesError(parsed.error.code, parsed.error.message);
    }
    return parsed.value;
  };

  return {
    createGame(mode) {
      return call<Snapshot>(wasm.create_game, { mode });
    },
    controllerForTurn(snapshot) {
      return call<Color | null>(wasm.controller_for_turn, { snapshot });
    },
    sameSide(mode, a, b) {
      return call<boolean>(wasm.same_side, { mode, a, b });
    },
    legalMoves(snapshot, color) {
      return call<Move[]>(wasm.legal_moves, { snapshot, color });
    },
    isLegal(snapshot, move, color) {
      return call<boolean>(wasm.is_legal, { snapshot, move, color });
    },
    applyMove(snapshot, move, color) {
      return call<Snapshot>(wasm.apply_move, { snapshot, move, color });
    },
    applyMoveRaw(snapshot, move, color) {
      return callRaw(wasm.apply_move, { snapshot, move, color });
    },
    chooseMove(request) {
      return call<SearchResult>(wasm.choose_move, request);
    },
    reviewMove(request) {
      return call<MoveReview>(wasm.review_move, request);
    },
  };
}
