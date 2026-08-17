import type { Piece } from "@ploy/rules";

export const FILE_LABELS = ["a", "b", "c", "d", "e", "f", "g", "h", "i"] as const;

export const ARMY: Record<string, string> = {
  green: "#3ad67a",
  coral: "#ff6b6b",
  yellow: "#f4d35e",
  blue: "#4cc9f0",
};

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
