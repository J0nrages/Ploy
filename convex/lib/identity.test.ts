import { expect, test } from "bun:test";
import {
  canClaimComputerLease,
  CODE_ALPHABET,
  canClaimSeat,
  colorAllowed,
  computerDisplayName,
  neededColors,
  pickNextHost,
  publicSeat,
  randomCode,
  validateDisplayName,
} from "./identity";

test("needed colors match each mode", () => {
  expect(neededColors("twoPlayer")).toEqual(["green", "coral"]);
  expect(neededColors("fourPlayerFfa")).toEqual(["green", "coral", "yellow", "blue"]);
  expect(neededColors("partnership")).toEqual(["green", "coral", "yellow", "blue"]);
  expect(colorAllowed("twoPlayer", "yellow")).toBe(false);
});

test("display names reject empty and overlong strings", () => {
  expect(validateDisplayName("  Ada  ")).toBe("Ada");
  expect(() => validateDisplayName("   ")).toThrow();
  expect(() => validateDisplayName("x".repeat(25))).toThrow();
});

test("room codes use the public alphabet", () => {
  const code = randomCode();
  expect(code).toHaveLength(6);
  expect([...code].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
});

test("public seats never expose session ids", () => {
  const seat = publicSeat({
    color: "green",
    displayName: "Host",
    kind: "human",
    sessionId: "secret-session",
    lastSeen: 1_000,
    roomStatus: "lobby",
    now: 50_000,
  });
  expect(seat.occupied).toBe(true);
  expect(seat.stale).toBe(true);
  expect(JSON.stringify(seat)).not.toContain("secret");
});

test("stale lobby seats can be claimed and computer seats cannot", () => {
  expect(
    canClaimSeat({
      roomStatus: "lobby",
      existingSessionId: "other",
      claimantSessionId: "me",
      lastSeen: 0,
      now: 50_000,
      kind: "human",
    }).ok,
  ).toBe(true);
  expect(
    canClaimSeat({
      roomStatus: "active",
      existingSessionId: "other",
      claimantSessionId: "me",
      lastSeen: 0,
      now: 50_000,
      kind: "human",
    }).ok,
  ).toBe(false);
  expect(
    canClaimSeat({
      roomStatus: "active",
      existingSessionId: null,
      claimantSessionId: "me",
      lastSeen: 0,
      now: 50_000,
      kind: "human",
    }).ok,
  ).toBe(true);
  expect(
    canClaimSeat({
      roomStatus: "lobby",
      existingSessionId: "bot",
      claimantSessionId: "me",
      lastSeen: 0,
      now: 50_000,
      kind: "computer",
    }).ok,
  ).toBe(false);
});

test("host transfer prefers earliest human join then document id", () => {
  const next = pickNextHost(
    [
      { id: "b", sessionId: "later", kind: "human", joinedAt: 20 },
      { id: "a", sessionId: "earlier", kind: "human", joinedAt: 10 },
      { id: "c", sessionId: "bot", kind: "computer", joinedAt: 1 },
      { id: "d", sessionId: "gone", kind: "human", joinedAt: 1 },
    ],
    "gone",
  );
  expect(next?.sessionId).toBe("earlier");
  expect(computerDisplayName("navigator")).toBe("Navigator");
});

test("computer leases can only be renewed by the owner or claimed after expiry", () => {
  expect(
    canClaimComputerLease({
      claimantIsHumanParticipant: true,
      claimantSessionId: "owner",
      ownerSessionId: "owner",
      leaseExpiresAt: 200,
      now: 100,
    }),
  ).toEqual({ ok: true });
  expect(
    canClaimComputerLease({
      claimantIsHumanParticipant: true,
      claimantSessionId: "guest",
      ownerSessionId: "owner",
      leaseExpiresAt: 200,
      now: 100,
    }),
  ).toEqual({ ok: false, reason: "Computer lease is active" });
  expect(
    canClaimComputerLease({
      claimantIsHumanParticipant: true,
      claimantSessionId: "guest",
      ownerSessionId: "owner",
      leaseExpiresAt: 200,
      now: 200,
    }),
  ).toEqual({ ok: true });
  expect(
    canClaimComputerLease({
      claimantIsHumanParticipant: false,
      claimantSessionId: "stranger",
      ownerSessionId: null,
      leaseExpiresAt: 0,
      now: 200,
    }),
  ).toEqual({ ok: false, reason: "Only a seated human may control the computer" });
});
