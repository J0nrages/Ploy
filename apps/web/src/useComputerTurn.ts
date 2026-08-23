import { useEffect, useRef, useState } from "react";
import {
  createPloyBot,
  searchOptionsForProfile,
  type OpponentProfile,
  type PloyBot,
  type SearchResult,
} from "@ploy/ai";
import type { Color, Move, Snapshot } from "@ploy/rules";
import {
  isStaleTurnError,
  searchComputerMove,
  submitPendingComputerMove,
  type ComputerMoveOperation,
  type ComputerTurnStatus,
  type PendingComputerMove,
} from "./computerTurn";
import { newRequestId } from "./session";

export function useComputerTurn(args: {
  snapshot: Snapshot | null;
  acting: Color | null;
  enabled: boolean;
  turnKey: string | null;
  profile: OpponentProfile;
  gameSeed: number;
  profileRevision: number;
  onMove: (move: Move, operation: ComputerMoveOperation) => Promise<void>;
  onError: (message: string) => void;
}): {
  status: ComputerTurnStatus;
  thinking: boolean;
  canRetry: boolean;
  cancel: () => void;
  retry: () => void;
  lastResult: SearchResult | null;
} {
  const [status, setStatus] = useState<ComputerTurnStatus>("idle");
  const [retryNonce, setRetryNonce] = useState(0);
  const [lastResult, setLastResult] = useState<SearchResult | null>(null);
  const botRef = useRef<PloyBot | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<PendingComputerMove | null>(null);
  const onMoveRef = useRef(args.onMove);
  const onErrorRef = useRef(args.onError);
  onMoveRef.current = args.onMove;
  onErrorRef.current = args.onError;

  useEffect(() => {
    const bot = createPloyBot();
    botRef.current = bot;
    return () => {
      botRef.current = null;
      bot.terminate();
    };
  }, []);

  useEffect(() => {
    if (
      !args.enabled ||
      !args.snapshot ||
      !args.acting ||
      !args.turnKey ||
      args.snapshot.winner
    ) {
      pendingRef.current = null;
      setStatus("idle");
      return;
    }
    const snapshot = args.snapshot;
    const acting = args.acting;
    const turnKey = args.turnKey;
    const controller = new AbortController();
    abortRef.current = controller;
    let disposed = false;
    const bot = botRef.current;
    if (!bot) {
      setStatus("failed");
      return;
    }

    const run = async (): Promise<void> => {
      try {
        let pending = pendingRef.current;
        if (!pending || pending.operation.turnKey !== turnKey) {
          pendingRef.current = null;
          setStatus("thinking");
          const result = await searchComputerMove({
            bot,
            snapshot,
            color: acting,
            options: searchOptionsForProfile(
              args.profile,
              args.gameSeed,
              snapshot.ply,
              args.profileRevision,
            ),
            signal: controller.signal,
          });
          if (disposed || controller.signal.aborted) {
            return;
          }
          setLastResult(result);
          pending = {
            move: result.move,
            operation: {
              requestId: newRequestId(),
              expectedPly: snapshot.ply,
              turnKey,
              profileRevision: args.profileRevision,
            },
          };
          pendingRef.current = pending;
        }
        setStatus("submitting");
        await submitPendingComputerMove(pending, onMoveRef.current);
        if (disposed || controller.signal.aborted) {
          return;
        }
        pendingRef.current = null;
        setStatus("idle");
      } catch (cause) {
        if (disposed) {
          return;
        }
        if (controller.signal.aborted) {
          setStatus("cancelled");
          return;
        }
        if (isStaleTurnError(cause)) {
          pendingRef.current = null;
        }
        setStatus("failed");
        onErrorRef.current(cause instanceof Error ? cause.message : "computer failed");
      }
    };
    void run();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [
    args.acting,
    args.enabled,
    args.gameSeed,
    args.profile.strength,
    args.profile.style,
    args.profileRevision,
    args.turnKey,
    retryNonce,
  ]);

  return {
    status,
    thinking: status === "thinking" || status === "submitting",
    canRetry: status === "cancelled" || status === "failed",
    lastResult,
    cancel: () => {
      abortRef.current?.abort();
      setStatus("cancelled");
    },
    retry: () => setRetryNonce((value) => value + 1),
  };
}
