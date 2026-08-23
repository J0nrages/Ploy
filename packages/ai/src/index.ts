import type {
  Color,
  Move,
  MoveReview as CoreMoveReview,
  Snapshot,
} from "@ploy/rules";

export type Strength = "cadet" | "navigator" | "commander" | "strategist";
export type Difficulty = Strength;
export type OpponentStyle =
  | "balanced"
  | "aggressor"
  | "guardian"
  | "maneuverer"
  | "trickster";

export type OpponentProfile = {
  strength: Strength;
  style: OpponentStyle;
};

export const STRENGTHS: readonly Strength[] = [
  "cadet",
  "navigator",
  "commander",
  "strategist",
];

export const OPPONENT_STYLES: readonly OpponentStyle[] = [
  "balanced",
  "aggressor",
  "guardian",
  "maneuverer",
  "trickster",
];

export type SearchOptions = {
  maxTimeMs: number;
  maxDepth?: number;
  maxNodes: number;
  randomSeed: number;
  style?: OpponentStyle;
  maxScoreLoss?: number;
};

export type ReviewOptions = {
  maxTimeMs: number;
  maxDepth?: number;
  maxNodes: number;
  randomSeed: number;
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
  elapsedMs: number;
};

export type MoveReview = CoreMoveReview & {
  elapsedMs: number;
};

export type AiErrorCode =
  | "unsupportedMode"
  | "noLegalMove"
  | "aborted"
  | "timeout"
  | "engineFailure";

export class AiError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AiError";
    this.code = code;
  }
}

export interface PloyBot {
  chooseMove(
    snapshot: Snapshot,
    color: Color,
    options: SearchOptions,
    signal: AbortSignal,
  ): Promise<SearchResult>;
  reviewMove(
    snapshot: Snapshot,
    color: Color,
    playedMove: Move,
    options: ReviewOptions,
    signal: AbortSignal,
  ): Promise<MoveReview>;
  terminate(): void;
}

export const REFEREE_BUDGET: ReviewOptions = {
  maxTimeMs: 1_500,
  maxDepth: 4,
  maxNodes: 75_000,
  randomSeed: 0,
};

export const STRENGTH_BUDGETS: Record<Strength, SearchOptions> = {
  cadet: {
    maxTimeMs: 200,
    maxDepth: 1,
    maxNodes: 250,
    randomSeed: 1,
    style: "balanced",
    maxScoreLoss: 160,
  },
  navigator: {
    maxTimeMs: 500,
    maxDepth: 3,
    maxNodes: 30_000,
    randomSeed: 2,
    style: "balanced",
    maxScoreLoss: 40,
  },
  commander: {
    maxTimeMs: 2_000,
    maxDepth: 5,
    maxNodes: 100_000,
    randomSeed: 3,
    style: "balanced",
    maxScoreLoss: 12,
  },
  strategist: {
    maxTimeMs: 5_000,
    maxDepth: 6,
    maxNodes: 300_000,
    randomSeed: 4,
    style: "balanced",
    maxScoreLoss: 0,
  },
};

export const DIFFICULTY_BUDGETS = STRENGTH_BUDGETS;

export function searchOptionsForProfile(
  profile: OpponentProfile,
  gameSeed: number,
  ply: number,
  profileRevision = 0,
): SearchOptions {
  const budget = STRENGTH_BUDGETS[profile.strength];
  return {
    ...budget,
    randomSeed: deriveTurnSeed(gameSeed, ply, profileRevision),
    style: profile.style,
  };
}

export function reviewOptionsForTurn(gameSeed: number, ply: number): ReviewOptions {
  return {
    ...REFEREE_BUDGET,
    randomSeed: deriveTurnSeed(gameSeed ^ 0x52454645, ply, 0),
  };
}

function deriveTurnSeed(gameSeed: number, ply: number, profileRevision: number): number {
  let value = gameSeed >>> 0;
  value ^= Math.imul((ply + 1) >>> 0, 0x9e3779b1);
  value ^= Math.imul((profileRevision + 1) >>> 0, 0x85ebca6b);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return value >>> 0;
}

type WorkerResponse =
  | { type: "ready" }
  | { type: "result"; requestId: number; result: SearchResult }
  | { type: "reviewResult"; requestId: number; result: MoveReview }
  | { type: "error"; requestId: number; message: string }
  | { type: "fatal"; message: string };

function createWorker(): Worker {
  return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
}

export function createPloyBot(): PloyBot {
  let worker = createWorker();
  let nextId = 1;
  let ready = waitForReady(worker);
  void ready.catch(() => undefined);
  let inFlight = false;
  let terminated = false;

  const recreate = (): void => {
    worker.terminate();
    if (terminated) {
      return;
    }
    worker = createWorker();
    ready = waitForReady(worker);
    void ready.catch(() => undefined);
  };

  return {
    async chooseMove(snapshot, color, options, signal) {
      if (terminated) {
        throw new AiError("engineFailure", "computer opponent is terminated");
      }
      if (inFlight) {
        throw new AiError("engineFailure", "computer opponent is already thinking");
      }
      inFlight = true;
      try {
        await ready;
        if (signal.aborted) {
          throw new AiError("aborted");
        }
        const requestId = nextId;
        nextId += 1;
        const delay =
          snapshot.mode === "twoPlayer" && options.maxNodes <= 250
            ? 100 + (options.randomSeed % 100)
            : 0;
        const result = await requestMove(
          worker,
          requestId,
          snapshot,
          color,
          options,
          signal,
          recreate,
        );
        await abortableDelay(delay, signal);
        return result;
      } finally {
        inFlight = false;
      }
    },
    async reviewMove(snapshot, color, playedMove, options, signal) {
      if (terminated) {
        throw new AiError("engineFailure", "computer opponent is terminated");
      }
      if (inFlight) {
        throw new AiError("engineFailure", "computer opponent is already thinking");
      }
      inFlight = true;
      try {
        await ready;
        if (signal.aborted) {
          throw new AiError("aborted");
        }
        const requestId = nextId;
        nextId += 1;
        return await requestReview(
          worker,
          requestId,
          snapshot,
          color,
          playedMove,
          options,
          signal,
          recreate,
        );
      } finally {
        inFlight = false;
      }
    },
    terminate() {
      terminated = true;
      worker.terminate();
    },
  };
}

function requestReview(
  requestWorker: Worker,
  requestId: number,
  snapshot: Snapshot,
  color: Color,
  playedMove: Move,
  options: ReviewOptions,
  signal: AbortSignal,
  recreate: () => void,
): Promise<MoveReview> {
  return requestWorkerResult(
    requestWorker,
    requestId,
    {
      type: "review",
      requestId,
      snapshot,
      color,
      playedMove,
      maxDepth: options.maxDepth,
      maxNodes: options.maxNodes,
      randomSeed: options.randomSeed,
    },
    "reviewResult",
    options.maxTimeMs,
    signal,
    recreate,
  );
}

function requestMove(
  requestWorker: Worker,
  requestId: number,
  snapshot: Snapshot,
  color: Color,
  options: SearchOptions,
  signal: AbortSignal,
  recreate: () => void,
): Promise<SearchResult> {
  return requestWorkerResult(
    requestWorker,
    requestId,
    {
      type: "choose",
      requestId,
      snapshot,
      color,
      maxDepth: options.maxDepth,
      maxNodes: options.maxNodes,
      randomSeed: options.randomSeed,
      style: options.style,
      maxScoreLoss: options.maxScoreLoss,
    },
    "result",
    options.maxTimeMs,
    signal,
    recreate,
  );
}

function requestWorkerResult<T>(
  requestWorker: Worker,
  requestId: number,
  message: unknown,
  resultType: "result" | "reviewResult",
  maxTimeMs: number,
  signal: AbortSignal,
  recreate: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => fail(new AiError("timeout"), true), maxTimeMs);

    const cleanup = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      requestWorker.removeEventListener("message", onMessage);
      requestWorker.removeEventListener("error", onError);
    };
    const fail = (error: AiError, restart: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (restart) {
        recreate();
      }
      reject(error);
    };
    const onAbort = (): void => fail(new AiError("aborted"), true);
    const onError = (): void => fail(new AiError("engineFailure"), true);
    const onMessage = (event: MessageEvent<WorkerResponse>): void => {
      if (event.data.type === "fatal") {
        fail(new AiError("engineFailure", event.data.message), true);
        return;
      }
      if (event.data.type === "ready" || event.data.requestId !== requestId) {
        return;
      }
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (event.data.type === "error") {
        reject(mapEngineError(event.data.message));
      } else if (event.data.type === resultType) {
        resolve(event.data.result as T);
      } else {
        reject(new AiError("engineFailure", "worker returned the wrong result type"));
      }
    };

    signal.addEventListener("abort", onAbort, { once: true });
    requestWorker.addEventListener("message", onMessage);
    requestWorker.addEventListener("error", onError);
    requestWorker.postMessage(message);
  });
}

function abortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (delayMs <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new AiError("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForReady(worker: Worker): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
    const onMessage = (event: MessageEvent<WorkerResponse>): void => {
      if (event.data.type === "ready") {
        cleanup();
        resolve();
      } else if (event.data.type === "fatal") {
        cleanup();
        reject(new AiError("engineFailure", event.data.message));
      }
    };
    const onError = (): void => {
      cleanup();
      reject(new AiError("engineFailure", "worker failed during startup"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new AiError("engineFailure", "worker was not ready"));
    }, 10_000);
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
  });
}

function mapEngineError(message: string): AiError {
  if (message.includes("unsupportedMode")) {
    return new AiError("unsupportedMode", message);
  }
  if (message.includes("noLegalMove")) {
    return new AiError("noLegalMove", message);
  }
  return new AiError("engineFailure", message);
}
