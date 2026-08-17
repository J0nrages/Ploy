import { useEffect, useMemo, useState } from "react";
import { legalMoves, type Color, type Move, type Piece, type Snapshot, type Square } from "@ploy/rules";
import { squareAfterArrow } from "./catalog";

export type ShieldStaging = {
  from: Square;
  to: Square;
  motions: Extract<Move, { type: "motion" }>[];
};

export function pieceAt(snapshot: Snapshot, square: Square): Piece | null {
  const rank = Math.floor(square / 9);
  const file = square % 9;
  return snapshot.board[rank]?.[file] ?? null;
}

export function movesFrom(snapshot: Snapshot, color: Color, from: Square): Move[] {
  return legalMoves(snapshot, color).filter(
    (move) =>
      (move.type === "motion" && move.from === from) || (move.type === "rotate" && move.at === from),
  );
}

export function isSelectablePiece(
  snapshot: Snapshot,
  actingColor: Color,
  square: Square,
): boolean {
  return pieceAt(snapshot, square)?.controller === actingColor;
}

export function motionsTo(
  moves: Move[],
  to: Square,
): Extract<Move, { type: "motion" }>[] {
  return moves.filter(
    (move): move is Extract<Move, { type: "motion" }> => move.type === "motion" && move.to === to,
  );
}

export function shouldStageShield(
  piece: Piece | null,
  motions: Extract<Move, { type: "motion" }>[],
): boolean {
  return piece?.kind === "shield" && motions.some((move) => move.postMoveSteps !== undefined);
}

export function motionWithoutRotation(
  motions: Extract<Move, { type: "motion" }>[],
): Extract<Move, { type: "motion" }> | undefined {
  return motions.find((move) => move.postMoveSteps === undefined) ?? motions[0];
}

export type BoardInteraction = {
  selected: Square | null;
  staging: ShieldStaging | null;
  invalidAttempt: number;
  legal: Move[];
  selectedMoves: Move[];
  onSelectSquare: (square: Square) => void;
  commitRotation: (steps: 1 | 2 | 3 | 4 | 5 | 6 | 7) => void;
  commitStaging: (postMoveSteps?: 1 | 2 | 3 | 4 | 5 | 6 | 7) => void;
  cancel: () => void;
};

export function useBoardInteraction(args: {
  snapshot: Snapshot | null;
  actingColor: Color | null;
  disabled: boolean;
  onCommit: (move: Move) => void;
}): BoardInteraction {
  const [selected, setSelected] = useState<Square | null>(null);
  const [staging, setStaging] = useState<ShieldStaging | null>(null);
  const [invalidAttempt, setInvalidAttempt] = useState(0);

  useEffect(() => {
    setSelected(null);
    setStaging(null);
    setInvalidAttempt(0);
  }, [args.snapshot?.ply, args.snapshot?.mode]);

  const legal = useMemo(
    () => (args.snapshot && args.actingColor ? legalMoves(args.snapshot, args.actingColor) : []),
    [args.snapshot, args.actingColor],
  );
  const selectedMoves = useMemo(() => {
    if (!args.snapshot || !args.actingColor || selected === null) {
      return [];
    }
    return movesFrom(args.snapshot, args.actingColor, selected);
  }, [args.snapshot, args.actingColor, selected]);

  const cancel = (): void => {
    setStaging(null);
    setSelected(null);
    setInvalidAttempt(0);
  };

  const onSelectSquare = (square: Square): void => {
    if (args.disabled || !args.snapshot || !args.actingColor || args.snapshot.winner) {
      return;
    }
    if (staging) {
      setInvalidAttempt((attempt) => attempt + 1);
      return;
    }
    const motions = motionsTo(selectedMoves, square);
    if (motions[0]) {
      const piece = pieceAt(args.snapshot, motions[0].from);
      if (shouldStageShield(piece, motions)) {
        setStaging({ from: motions[0].from, to: square, motions });
        return;
      }
      args.onCommit(motions[0]);
      cancel();
      return;
    }
    if (!isSelectablePiece(args.snapshot, args.actingColor, square)) {
      setInvalidAttempt((attempt) => attempt + 1);
      return;
    }
    setInvalidAttempt(0);
    setSelected(square);
  };

  const commitRotation = (steps: 1 | 2 | 3 | 4 | 5 | 6 | 7): void => {
    const move = selectedMoves.find((item) => item.type === "rotate" && item.steps === steps);
    if (move) {
      args.onCommit(move);
      cancel();
    }
  };

  const commitStaging = (postMoveSteps?: 1 | 2 | 3 | 4 | 5 | 6 | 7): void => {
    if (!staging) {
      return;
    }
    const move =
      postMoveSteps === undefined
        ? motionWithoutRotation(staging.motions)
        : staging.motions.find((item) => item.postMoveSteps === postMoveSteps);
    if (move) {
      args.onCommit(move);
    }
    cancel();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (args.disabled) {
        return;
      }
      if (event.key === "Escape") {
        cancel();
        return;
      }
      if (staging) {
        if (event.key === "n" || event.key === "N" || event.key === "Enter") {
          event.preventDefault();
          commitStaging();
        }
        const stagedSteps = Number(event.key);
        if (stagedSteps >= 1 && stagedSteps <= 7) {
          event.preventDefault();
          commitStaging(stagedSteps as 1 | 2 | 3 | 4 | 5 | 6 | 7);
        }
        return;
      }
      if (selected !== null) {
        const next = squareAfterArrow(selected, event.key);
        if (next !== null) {
          event.preventDefault();
          setSelected(next);
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectSquare(selected);
          return;
        }
        const steps = Number(event.key);
        if (steps >= 1 && steps <= 7) {
          event.preventDefault();
          commitRotation(steps as 1 | 2 | 3 | 4 | 5 | 6 | 7);
        }
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setSelected(40);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return {
    selected,
    staging,
    invalidAttempt,
    legal,
    selectedMoves,
    onSelectSquare,
    commitRotation,
    commitStaging,
    cancel,
  };
}
