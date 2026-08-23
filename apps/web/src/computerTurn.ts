import { AiError, type PloyBot, type SearchOptions, type SearchResult } from "@ploy/ai";
import type { Color, Move, Snapshot } from "@ploy/rules";

export type ComputerMoveOperation = {
  requestId: string;
  expectedPly: number;
  turnKey: string;
  profileRevision: number;
};

export type PendingComputerMove = {
  move: Move;
  operation: ComputerMoveOperation;
};

export async function submitPendingComputerMove(
  pending: PendingComputerMove,
  submit: (move: Move, operation: ComputerMoveOperation) => Promise<void>,
): Promise<void> {
  await submit(pending.move, pending.operation);
}

export type ComputerTurnStatus =
  | "idle"
  | "thinking"
  | "submitting"
  | "cancelled"
  | "failed";

export function snapshotTurnKey(scope: string, snapshot: Snapshot, acting: Color | null): string {
  const pieces = snapshot.board.flatMap((row, rank) =>
    row.flatMap((piece, file) =>
      piece ? [`${rank * 9 + file}:${piece.id}:${piece.controller}:${piece.rot}`] : [],
    ),
  );
  return `${scope}:${snapshot.ply}:${acting ?? "none"}:${pieces.join("|")}`;
}

export function reducedRetryOptions(options: SearchOptions): SearchOptions {
  const reduced: SearchOptions = {
    ...options,
    maxNodes: Math.max(250, Math.floor(options.maxNodes / 2)),
  };
  if (options.maxDepth !== undefined) {
    reduced.maxDepth = Math.max(1, options.maxDepth - 1);
  }
  return reduced;
}

export async function searchComputerMove(args: {
  bot: PloyBot;
  snapshot: Snapshot;
  color: Color;
  options: SearchOptions;
  signal: AbortSignal;
}): Promise<SearchResult> {
  try {
    return await args.bot.chooseMove(args.snapshot, args.color, args.options, args.signal);
  } catch (cause) {
    if (!(cause instanceof AiError) || cause.code !== "timeout" || args.signal.aborted) {
      throw cause;
    }
    return args.bot.chooseMove(
      args.snapshot,
      args.color,
      reducedRetryOptions(args.options),
      args.signal,
    );
  }
}

export function isStaleTurnError(cause: unknown): boolean {
  if (!(cause instanceof Error)) {
    return false;
  }
  const message = cause.message.toLowerCase();
  return (
    message.includes("stale expected ply") ||
    message.includes("computer profile is not current")
  );
}
