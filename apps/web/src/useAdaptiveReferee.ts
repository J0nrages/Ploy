import { useEffect, useRef, useState } from "react";
import {
  createPloyBot,
  reviewOptionsForTurn,
  type MoveReview,
  type PloyBot,
} from "@ploy/ai";
import type { Color, Move, Snapshot } from "@ploy/rules";

export type PendingHumanReview = {
  key: string;
  snapshot: Snapshot;
  color: Color;
  move: Move;
};

export function useAdaptiveReferee(args: {
  pending: PendingHumanReview | null;
  enabled: boolean;
  gameSeed: number;
  onSettled: (pending: PendingHumanReview, review: MoveReview | null) => void;
}): {
  thinking: boolean;
  lastReview: MoveReview | null;
  lastError: string | null;
} {
  const [bot, setBot] = useState<PloyBot | null>(null);
  const [thinking, setThinking] = useState(false);
  const [lastReview, setLastReview] = useState<MoveReview | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const onSettledRef = useRef(args.onSettled);
  onSettledRef.current = args.onSettled;

  useEffect(() => {
    const nextBot = createPloyBot();
    setBot(nextBot);
    return () => nextBot.terminate();
  }, []);

  useEffect(() => {
    if (!bot || !args.enabled || !args.pending) {
      setThinking(false);
      return;
    }
    const pending = args.pending;
    const controller = new AbortController();
    let disposed = false;
    setThinking(true);
    setLastError(null);

    void bot
      .reviewMove(
        pending.snapshot,
        pending.color,
        pending.move,
        reviewOptionsForTurn(args.gameSeed, pending.snapshot.ply),
        controller.signal,
      )
      .then((review) => {
        if (disposed) {
          return;
        }
        setLastReview(review);
        onSettledRef.current(pending, review);
      })
      .catch((cause: unknown) => {
        if (disposed || controller.signal.aborted) {
          return;
        }
        setLastError(cause instanceof Error ? cause.message : "referee analysis failed");
        onSettledRef.current(pending, null);
      })
      .finally(() => {
        if (!disposed) {
          setThinking(false);
        }
      });

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [args.enabled, args.gameSeed, args.pending?.key, bot]);

  return { thinking, lastReview, lastError };
}
