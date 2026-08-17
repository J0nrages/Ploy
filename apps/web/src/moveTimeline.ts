import { controllerForTurn, type Color, type Piece, type Snapshot, type Square } from "@ploy/rules";
import { fileRank } from "@ploy/ui-board";

export type TimelineEntry = {
  ply: number;
  color: Color;
  summary: string;
};

type LocatedPiece = {
  piece: Piece;
  square: Square;
};

const DIRECTION_NAMES = [
  "North",
  "Northeast",
  "East",
  "Southeast",
  "South",
  "Southwest",
  "West",
  "Northwest",
] as const;

export function locatePieces(snapshot: Snapshot): LocatedPiece[] {
  const found: LocatedPiece[] = [];
  for (const [rank, row] of snapshot.board.entries()) {
    for (const [file, piece] of row.entries()) {
      if (piece) {
        found.push({ piece, square: rank * 9 + file });
      }
    }
  }
  return found;
}

export function describeTransition(before: Snapshot, after: Snapshot): TimelineEntry | null {
  if (!controllerForTurn(before)) {
    return null;
  }

  const previous = locatePieces(before);
  const next = locatePieces(after);
  const previousById = new Map(previous.map((item) => [item.piece.id, item]));
  const nextById = new Map(next.map((item) => [item.piece.id, item]));
  const mover = next.find((item) => {
    const prior = previousById.get(item.piece.id);
    return prior !== undefined && (prior.square !== item.square || prior.piece.rot !== item.piece.rot);
  });
  if (!mover) {
    return null;
  }
  const prior = previousById.get(mover.piece.id);
  if (!prior) {
    return null;
  }

  const captured = previous.find(
    (item) =>
      item.square === mover.square &&
      item.piece.id !== mover.piece.id &&
      !nextById.has(item.piece.id),
  );
  const kind = pieceName(mover.piece.kind);
  const steps = rotationSteps(prior.piece.rot, mover.piece.rot);
  const parts: string[] = [];

  if (prior.square !== mover.square) {
    parts.push(`${kind} ${fileRank(prior.square)} → ${fileRank(mover.square)}`);
    if (captured) {
      parts.push(`takes ${colorName(captured.piece.color)} ${pieceName(captured.piece.kind)}`);
    }
    if (steps > 0) {
      parts.push(rotationPhrase(mover.piece, steps));
    }
  } else if (steps > 0) {
    parts.push(`${kind} ${rotationPhrase(mover.piece, steps)} at ${fileRank(mover.square)}`);
  } else {
    return null;
  }

  return {
    ply: after.ply,
    color: mover.piece.color,
    summary: parts.join(", "),
  };
}

export function buildMoveTimeline(history: Snapshot[], current: Snapshot): TimelineEntry[] {
  const frames = [...history, current];
  const entries: TimelineEntry[] = [];
  for (let index = 1; index < frames.length; index += 1) {
    const before = frames[index - 1];
    const after = frames[index];
    if (!before || !after) {
      continue;
    }
    const entry = describeTransition(before, after);
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

function rotationSteps(from: Piece["rot"], to: Piece["rot"]): number {
  return (to - from + 8) % 8;
}

function rotationPhrase(piece: Piece, steps: number): string {
  if (piece.kind === "shield") {
    return `faces ${DIRECTION_NAMES[piece.rot] ?? "a new direction"}`;
  }
  return `rotates +${steps * 45}°`;
}

function pieceName(kind: Piece["kind"]): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function colorName(color: Color): string {
  return color.charAt(0).toUpperCase() + color.slice(1);
}
