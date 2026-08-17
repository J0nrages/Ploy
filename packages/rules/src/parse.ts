import { RulesError } from "./errors";
import type { Color, Mode, Move, Piece, Rotation, Snapshot, Team, Winner } from "./types";

const COLORS: ReadonlySet<Color> = new Set(["green", "coral", "yellow", "blue"]);
const MODES: ReadonlySet<Mode> = new Set(["twoPlayer", "fourPlayerFfa", "partnership"]);
const TEAMS: ReadonlySet<Team> = new Set(["green-yellow", "coral-blue"]);
const VARIANTS = new Set(["heavy", "medium", "light"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isColor(value: unknown): value is Color {
  return typeof value === "string" && COLORS.has(value as Color);
}

function isMode(value: unknown): value is Mode {
  return typeof value === "string" && MODES.has(value as Mode);
}

function isRotation(value: unknown): value is Rotation {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 7
  );
}

function isSquare(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 80;
}

function isStep(value: unknown): value is 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7;
}

function parsePiece(value: unknown, rank: number, file: number): Piece {
  if (!isRecord(value)) {
    throw new RulesError("invalidSnapshot", `piece at ${rank},${file} is not an object`);
  }
  const { id, color, controller, kind, rot } = value;
  if (typeof id !== "string" || id.length === 0) {
    throw new RulesError("invalidSnapshot", `piece at ${rank},${file} has an invalid id`);
  }
  if (!isColor(color) || !isColor(controller) || !isRotation(rot)) {
    throw new RulesError("invalidSnapshot", `piece ${id} has an invalid color, controller, or rot`);
  }
  if (kind === "commander" || kind === "shield") {
    return { id, color, controller, kind, rot };
  }
  if ((kind === "lance" || kind === "probe") && typeof value.variant === "string" && VARIANTS.has(value.variant)) {
    return {
      id,
      color,
      controller,
      kind,
      variant: value.variant as "heavy" | "medium" | "light",
      rot,
    };
  }
  throw new RulesError("invalidSnapshot", `piece ${id} has an invalid kind or variant`);
}

function parseWinner(value: unknown): Winner {
  if (value === null) {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new RulesError("invalidSnapshot", "winner is invalid");
  }
  if (value.type === "color" && isColor(value.color)) {
    return { type: "color", color: value.color };
  }
  if (value.type === "team" && typeof value.team === "string" && TEAMS.has(value.team as Team)) {
    return { type: "team", team: value.team as Team };
  }
  throw new RulesError("invalidSnapshot", "winner is invalid");
}

export function parseMove(value: unknown): Move {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new RulesError("invalidMove", "move is not an object");
  }
  if (value.type === "motion") {
    if (!isSquare(value.from) || !isSquare(value.to)) {
      throw new RulesError("invalidMove", "motion squares are out of bounds");
    }
    if (value.postMoveSteps === undefined) {
      return { type: "motion", from: value.from, to: value.to };
    }
    if (!isStep(value.postMoveSteps)) {
      throw new RulesError("invalidMove", "postMoveSteps must be 1..=7");
    }
    return { type: "motion", from: value.from, to: value.to, postMoveSteps: value.postMoveSteps };
  }
  if (value.type === "rotate") {
    if (!isSquare(value.at) || !isStep(value.steps)) {
      throw new RulesError("invalidMove", "rotation is invalid");
    }
    return { type: "rotate", at: value.at, steps: value.steps };
  }
  throw new RulesError("invalidMove", "unknown move type");
}

export function parseSnapshot(data: unknown): Snapshot {
  if (!isRecord(data)) {
    throw new RulesError("invalidSnapshot", "snapshot is not an object");
  }
  if (!isMode(data.mode)) {
    throw new RulesError("invalidSnapshot", "mode is invalid");
  }
  if (!isColor(data.turnSeat)) {
    throw new RulesError("invalidSnapshot", "turnSeat is invalid");
  }
  if (typeof data.ply !== "number" || !Number.isInteger(data.ply) || data.ply < 0) {
    throw new RulesError("invalidSnapshot", "ply is invalid");
  }
  if (!Array.isArray(data.inactiveSeats) || !data.inactiveSeats.every(isColor)) {
    throw new RulesError("invalidSnapshot", "inactiveSeats is invalid");
  }
  if (!Array.isArray(data.board) || data.board.length !== 9) {
    throw new RulesError("invalidSnapshot", "board must be 9 ranks");
  }
  const board: (Piece | null)[][] = [];
  const ids = new Set<string>();
  for (const [rank, row] of data.board.entries()) {
    if (!Array.isArray(row) || row.length !== 9) {
      throw new RulesError("invalidSnapshot", `rank ${rank} must have 9 files`);
    }
    const parsedRow: (Piece | null)[] = [];
    for (const [file, cell] of row.entries()) {
      if (cell === null) {
        parsedRow.push(null);
        continue;
      }
      const piece = parsePiece(cell, rank, file);
      if (ids.has(piece.id)) {
        throw new RulesError("invalidSnapshot", `duplicate piece id ${piece.id}`);
      }
      ids.add(piece.id);
      parsedRow.push(piece);
    }
    board.push(parsedRow);
  }
  return {
    mode: data.mode,
    board,
    turnSeat: data.turnSeat,
    inactiveSeats: data.inactiveSeats.filter((color, index, all) => all.indexOf(color) === index),
    winner: parseWinner(data.winner),
    ply: data.ply,
  };
}
