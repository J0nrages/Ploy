import type { Piece, Snapshot, Square } from "@ploy/rules";

export const FILE_LABELS = ["a", "b", "c", "d", "e", "f", "g", "h", "i"] as const;

export const ARMY: Record<string, string> = {
  green: "#3ad67a",
  coral: "#ff6b6b",
  yellow: "#f4d35e",
  blue: "#4cc9f0",
};

export function mixHex(hex: string, into: string, amount: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex) || !/^#[0-9a-fA-F]{6}$/.test(into)) {
    return hex;
  }
  const mix = (offset: number): string => {
    const from = Number.parseInt(hex.slice(offset, offset + 2), 16);
    const to = Number.parseInt(into.slice(offset, offset + 2), 16);
    return Math.round(from + (to - from) * amount)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

export function baseMask(piece: Piece): number {
  if (piece.kind === "commander") {
    return 0x55;
  }
  if (piece.kind === "shield") {
    return 0x01;
  }
  if (piece.kind === "lance") {
    if (piece.variant === "heavy") {
      return 0x83;
    }
    if (piece.variant === "medium") {
      return 0x45;
    }
    return 0x92;
  }
  if (piece.variant === "heavy") {
    return 0x03;
  }
  if (piece.variant === "medium") {
    return 0x05;
  }
  return 0x11;
}

export function effectiveMask(piece: Piece): number {
  const rot = piece.rot % 8;
  const base = baseMask(piece);
  return ((base << rot) | (base >> (8 - rot))) & 0xff;
}

export type ProjectedRoute = {
  direction: number;
  squares: Square[];
};

const DIRECTION_DELTAS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
] as const;

export function projectedRoutes(
  snapshot: Snapshot,
  origin: Square,
  piece: Piece,
  steps: number,
  vacatedSquare?: Square,
): ProjectedRoute[] {
  const rotation = (piece.rot + steps) % 8;
  const base = baseMask(piece);
  const mask = ((base << rotation) | (base >> (8 - rotation))) & 0xff;
  const originRank = Math.floor(origin / 9);
  const originFile = origin % 9;
  const distance =
    piece.kind === "commander" || piece.kind === "shield"
      ? 1
      : piece.kind === "probe"
        ? 2
        : 3;

  return DIRECTION_DELTAS.flatMap(([rankDelta, fileDelta], direction) => {
    if ((mask & (1 << direction)) === 0) {
      return [];
    }
    const squares: Square[] = [];
    for (let step = 1; step <= distance; step += 1) {
      const rank = originRank + rankDelta * step;
      const file = originFile + fileDelta * step;
      if (rank < 0 || rank > 8 || file < 0 || file > 8) {
        break;
      }
      const square = rank * 9 + file;
      const occupant =
        square === vacatedSquare ? null : snapshot.board[rank]?.[file] ?? null;
      if (!occupant) {
        squares.push(square);
        continue;
      }
      if (!isFriendly(snapshot, piece, occupant)) {
        squares.push(square);
      }
      break;
    }
    return squares.length > 0 ? [{ direction, squares }] : [];
  });
}

function isFriendly(snapshot: Snapshot, piece: Piece, other: Piece): boolean {
  if (snapshot.mode !== "partnership") {
    return other.controller === piece.controller;
  }
  return team(piece.controller) === team(other.color);
}

function team(color: Piece["color"]): "green-yellow" | "coral-blue" {
  return color === "green" || color === "yellow"
    ? "green-yellow"
    : "coral-blue";
}

export function fileRank(square: number): string {
  return `${FILE_LABELS[square % 9] ?? "?"}${Math.floor(square / 9) + 1}`;
}

export function toWorld(rank: number, file: number): [number, number, number] {
  return [file - 4, 0, 4 - rank];
}

/**
 * Bit 0 is north (+rank, world -Z) and bits advance clockwise.
 * Three.js positive Y rotation turns local -Z toward world -X, so clockwise
 * Ploy directions require a negative yaw.
 */
export function directionYaw(dir: number): number {
  return (-dir * Math.PI) / 4;
}

export function splitSquare(square: number): { rank: number; file: number } {
  return { rank: Math.floor(square / 9), file: square % 9 };
}

export function squareAfterArrow(square: number, key: string): number | null {
  const { rank, file } = splitSquare(square);
  let nextRank = rank;
  let nextFile = file;
  if (key === "ArrowUp") {
    nextRank += 1;
  } else if (key === "ArrowDown") {
    nextRank -= 1;
  } else if (key === "ArrowLeft") {
    nextFile -= 1;
  } else if (key === "ArrowRight") {
    nextFile += 1;
  } else {
    return null;
  }
  if (nextRank < 0 || nextRank > 8 || nextFile < 0 || nextFile > 8) {
    return null;
  }
  return nextRank * 9 + nextFile;
}
