import type { Color, Mode } from "../../packages/rules/src/types.ts";

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const STALE_LOBBY_MS = 45_000;
export const COMPUTER_LEASE_MS = 45_000;

export type SeatKind = "human" | "computer";
export type Difficulty = "cadet" | "navigator" | "commander" | "strategist";

export type PublicSeat = {
  color: Color;
  displayName: string;
  kind: SeatKind;
  difficulty: Difficulty | null;
  occupied: boolean;
  stale: boolean;
};

export function neededColors(mode: Mode): Color[] {
  return mode === "twoPlayer" ? ["green", "coral"] : ["green", "coral", "yellow", "blue"];
}

export function colorAllowed(mode: Mode, color: Color): boolean {
  return neededColors(mode).includes(color);
}

export function validateDisplayName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0 || [...trimmed].length > 24) {
    throw new Error("Display name must be 1-24 characters");
  }
  return trimmed;
}

export function computerDisplayName(difficulty: Difficulty): string {
  const label = difficulty[0]?.toUpperCase() + difficulty.slice(1);
  return label;
}

export function randomCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length] ?? "A";
  }
  return code;
}

export function publicSeat(args: {
  color: Color;
  displayName: string;
  kind: SeatKind;
  difficulty?: Difficulty;
  sessionId: string | null;
  lastSeen: number;
  roomStatus: "lobby" | "active" | "finished";
  now: number;
}): PublicSeat {
  const occupied = args.sessionId !== null;
  const stale =
    args.roomStatus === "lobby" && occupied && args.now - args.lastSeen > STALE_LOBBY_MS;
  return {
    color: args.color,
    displayName: args.displayName,
    kind: args.kind,
    difficulty: args.difficulty ?? null,
    occupied,
    stale,
  };
}

export function canClaimSeat(args: {
  roomStatus: "lobby" | "active" | "finished";
  existingSessionId: string | null;
  claimantSessionId: string;
  lastSeen: number;
  now: number;
  kind: SeatKind;
}): { ok: true } | { ok: false; reason: string } {
  if (args.kind === "computer") {
    return { ok: false, reason: "Computer seats cannot be claimed" };
  }
  if (args.existingSessionId === null || args.existingSessionId === args.claimantSessionId) {
    return { ok: true };
  }
  if (args.roomStatus === "lobby" && args.now - args.lastSeen > STALE_LOBBY_MS) {
    return { ok: true };
  }
  if (args.roomStatus !== "lobby") {
    return { ok: false, reason: "In-game seats can only be claimed when empty" };
  }
  return { ok: false, reason: "Seat is occupied" };
}

export function canClaimComputerLease(args: {
  claimantIsHumanParticipant: boolean;
  claimantSessionId: string;
  ownerSessionId: string | null;
  leaseExpiresAt: number;
  now: number;
}): { ok: true } | { ok: false; reason: string } {
  if (!args.claimantIsHumanParticipant) {
    return { ok: false, reason: "Only a seated human may control the computer" };
  }
  if (args.ownerSessionId === args.claimantSessionId || args.leaseExpiresAt <= args.now) {
    return { ok: true };
  }
  return { ok: false, reason: "Computer lease is active" };
}

export function pickNextHost<T extends { sessionId: string | null; kind: SeatKind; joinedAt: number; id: string }>(
  seats: T[],
  departingSessionId: string,
): T | null {
  const candidates = seats
    .filter(
      (seat) =>
        seat.kind === "human" &&
        seat.sessionId !== null &&
        seat.sessionId !== departingSessionId,
    )
    .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
  return candidates[0] ?? null;
}

export function sameMove(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
