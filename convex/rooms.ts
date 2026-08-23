/**
 * Anonymous room seats.
 *
 * Session IDs are bearer secrets. Public queries never return them.
 * Display names are 1–24 Unicode code points. Room codes are six characters
 * from ABCDEFGHJKLMNPQRSTUVWXYZ23456789; creation rejects by_code collisions.
 *
 * Lobby: leaving deletes the seat. A occupied lobby seat may be claimed after
 * 45s without a heartbeat. After start, leaving nulls sessionId and keeps
 * color/name; only a null in-game human seat may be claimed.
 *
 * Computer seats exist only in two-player rooms. A seated human client owns a
 * renewable 45-second lease and runs the Worker; Convex never calls
 * choose_move. When the lease expires, another seated human may claim it.
 *
 * If the host leaves, host transfers to the occupied human seat with the
 * lowest joinedAt, then lowest document id. Computer seats move with the host.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { parseSnapshot } from "../packages/rules/src/parse.ts";
import {
  COMPUTER_LEASE_MS,
  canClaimComputerLease,
  canClaimSeat,
  colorAllowed,
  computerDisplayName,
  neededColors,
  nextProfileRevision,
  pickNextHost,
  publicSeat,
  randomCode,
  validateDisplayName,
} from "./lib/identity";
import {
  colorValidator,
  modeValidator,
  opponentStyleValidator,
  publicRoomValidator,
  roomStateValidator,
  strengthValidator,
} from "./validators";

function publicRoom(room: Doc<"rooms">) {
  return {
    id: room._id,
    code: room.code,
    mode: room.mode,
    status: room.status,
    activeGameId: room.activeGameId ?? null,
  };
}

export const createRoom = mutation({
  args: {
    mode: modeValidator,
    hostSessionId: v.string(),
    displayName: v.string(),
  },
  returns: publicRoomValidator,
  handler: async (ctx, args) => {
    const name = validateDisplayName(args.displayName);
    let code = randomCode();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const existing = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique();
      if (!existing) {
        break;
      }
      code = randomCode();
    }
    const collision = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (collision) {
      throw new Error("Room code collision");
    }
    const now = Date.now();
    const roomId = await ctx.db.insert("rooms", {
      code,
      mode: args.mode,
      status: "lobby",
      hostSessionId: args.hostSessionId,
      createdAt: now,
    });
    await ctx.db.insert("seats", {
      roomId,
      color: "green",
      sessionId: args.hostSessionId,
      displayName: name,
      kind: "human",
      joinedAt: now,
      lastSeen: now,
    });
    return {
      id: roomId,
      code,
      mode: args.mode,
      status: "lobby" as const,
      activeGameId: null,
    };
  },
});

export const joinSeat = mutation({
  args: {
    code: v.string(),
    sessionId: v.string(),
    color: colorValidator,
    displayName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const name = validateDisplayName(args.displayName);
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!room) {
      throw new Error("Room not found");
    }
    if (!colorAllowed(room.mode, args.color)) {
      throw new Error("Color is not used in this mode");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("seats")
      .withIndex("by_room_and_color", (q) => q.eq("roomId", room._id).eq("color", args.color))
      .unique();
    if (!existing) {
      await ctx.db.insert("seats", {
        roomId: room._id,
        color: args.color,
        sessionId: args.sessionId,
        displayName: name,
        kind: "human",
        joinedAt: now,
        lastSeen: now,
      });
      return null;
    }
    const claim = canClaimSeat({
      roomStatus: room.status,
      existingSessionId: existing.sessionId,
      claimantSessionId: args.sessionId,
      lastSeen: existing.lastSeen,
      now,
      kind: existing.kind,
    });
    if (!claim.ok) {
      throw new Error(claim.reason);
    }
    await ctx.db.patch(existing._id, {
      sessionId: args.sessionId,
      displayName: name,
      lastSeen: now,
    });
    return null;
  },
});

export const assignComputerSeat = mutation({
  args: {
    code: v.string(),
    hostSessionId: v.string(),
    color: colorValidator,
    strength: strengthValidator,
    style: opponentStyleValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!room) {
      throw new Error("Room not found");
    }
    if (room.hostSessionId !== args.hostSessionId) {
      throw new Error("Only the host may assign a computer seat");
    }
    if (room.mode !== "twoPlayer") {
      throw new Error("Computer seats are only available in two-player rooms");
    }
    if (room.status !== "lobby") {
      throw new Error("Computer seats can only be assigned in the lobby");
    }
    if (!colorAllowed(room.mode, args.color)) {
      throw new Error("Color is not used in this mode");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("seats")
      .withIndex("by_room_and_color", (q) => q.eq("roomId", room._id).eq("color", args.color))
      .unique();
    const displayName = computerDisplayName(args.strength);
    if (!existing) {
      await ctx.db.insert("seats", {
        roomId: room._id,
        color: args.color,
        sessionId: args.hostSessionId,
        displayName,
        kind: "computer",
        strength: args.strength,
        style: args.style,
        profileRevision: 0,
        leaseOwnerSessionId: args.hostSessionId,
        leaseExpiresAt: now + COMPUTER_LEASE_MS,
        leaseEpoch: 1,
        joinedAt: now,
        lastSeen: now,
      });
      return null;
    }
    if (existing.kind === "human" && existing.sessionId && existing.sessionId !== args.hostSessionId) {
      throw new Error("Seat is occupied");
    }
    await ctx.db.patch(existing._id, {
      sessionId: args.hostSessionId,
      displayName,
      kind: "computer",
      strength: args.strength,
      style: args.style,
      profileRevision: (existing.profileRevision ?? 0) + 1,
      leaseOwnerSessionId: args.hostSessionId,
      leaseExpiresAt: now + COMPUTER_LEASE_MS,
      leaseEpoch: (existing.leaseEpoch ?? 0) + 1,
      lastSeen: now,
    });
    return null;
  },
});

export const updateComputerProfile = mutation({
  args: {
    code: v.string(),
    hostSessionId: v.string(),
    color: colorValidator,
    strength: strengthValidator,
    style: opponentStyleValidator,
    expectedRevision: v.number(),
  },
  returns: v.object({ revision: v.number() }),
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!room) {
      throw new Error("Room not found");
    }
    if (room.hostSessionId !== args.hostSessionId) {
      throw new Error("Only the host may change the computer profile");
    }
    const computer = await ctx.db
      .query("seats")
      .withIndex("by_room_and_color", (q) =>
        q.eq("roomId", room._id).eq("color", args.color),
      )
      .unique();
    if (!computer || computer.kind !== "computer") {
      throw new Error("Computer seat not found");
    }
    const revision = nextProfileRevision(computer.profileRevision, args.expectedRevision);
    await ctx.db.patch(computer._id, {
      displayName: computerDisplayName(args.strength),
      strength: args.strength,
      style: args.style,
      profileRevision: revision,
      lastSeen: Date.now(),
    });
    return { revision };
  },
});

export const leaveSeat = mutation({
  args: { code: v.string(), sessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!room) {
      throw new Error("Room not found");
    }
    const seats = await ctx.db
      .query("seats")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    const now = Date.now();
    const mine = seats.filter((seat) => seat.sessionId === args.sessionId);
    for (const seat of mine) {
      if (seat.kind === "computer" && room.hostSessionId !== args.sessionId) {
        continue;
      }
      if (room.status === "lobby") {
        await ctx.db.delete(seat._id);
      } else if (seat.kind === "human") {
        await ctx.db.patch(seat._id, { sessionId: null, lastSeen: now });
      }
    }
    if (room.hostSessionId === args.sessionId) {
      const remaining = await ctx.db
        .query("seats")
        .withIndex("by_room", (q) => q.eq("roomId", room._id))
        .collect();
      const next = pickNextHost(
        remaining.map((seat) => ({
          sessionId: seat.sessionId,
          kind: seat.kind,
          joinedAt: seat.joinedAt,
          id: seat._id,
        })),
        args.sessionId,
      );
      if (next) {
        const nextSeat = remaining.find((seat) => seat._id === (next.id as Id<"seats">));
        if (nextSeat?.sessionId) {
          await ctx.db.patch(room._id, { hostSessionId: nextSeat.sessionId });
          for (const seat of remaining) {
            if (seat.kind === "computer") {
              await ctx.db.patch(seat._id, {
                sessionId: nextSeat.sessionId,
                leaseOwnerSessionId: nextSeat.sessionId,
                leaseExpiresAt: now + COMPUTER_LEASE_MS,
                leaseEpoch: (seat.leaseEpoch ?? 0) + 1,
                lastSeen: now,
              });
            }
          }
        }
      }
    }
    return null;
  },
});

export const heartbeat = mutation({
  args: { code: v.string(), sessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!room) {
      return null;
    }
    const seats = await ctx.db
      .query("seats")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    const now = Date.now();
    for (const seat of seats) {
      if (seat.sessionId === args.sessionId) {
        if (seat.kind === "computer" && seat.leaseOwnerSessionId === args.sessionId) {
          await ctx.db.patch(seat._id, {
            lastSeen: now,
            leaseExpiresAt: now + COMPUTER_LEASE_MS,
          });
        } else {
          await ctx.db.patch(seat._id, { lastSeen: now });
        }
      }
    }
    return null;
  },
});

export const claimComputerLease = mutation({
  args: {
    code: v.string(),
    sessionId: v.string(),
    color: colorValidator,
  },
  returns: v.object({ epoch: v.number(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!room || room.status !== "active" || room.mode !== "twoPlayer") {
      throw new Error("No active two-player room");
    }
    const seats = await ctx.db
      .query("seats")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    const claimantIsHumanParticipant = seats.some(
      (seat) => seat.kind === "human" && seat.sessionId === args.sessionId,
    );
    const computer = seats.find(
      (seat) => seat.kind === "computer" && seat.color === args.color,
    );
    if (!computer) {
      throw new Error("Computer seat not found");
    }
    const now = Date.now();
    const claim = canClaimComputerLease({
      claimantIsHumanParticipant,
      claimantSessionId: args.sessionId,
      ownerSessionId: computer.leaseOwnerSessionId ?? computer.sessionId,
      leaseExpiresAt: computer.leaseExpiresAt ?? 0,
      now,
    });
    if (!claim.ok) {
      throw new Error(claim.reason);
    }
    const epoch =
      computer.leaseOwnerSessionId === args.sessionId
        ? (computer.leaseEpoch ?? 1)
        : (computer.leaseEpoch ?? 0) + 1;
    const expiresAt = now + COMPUTER_LEASE_MS;
    await ctx.db.patch(computer._id, {
      sessionId: args.sessionId,
      leaseOwnerSessionId: args.sessionId,
      leaseExpiresAt: expiresAt,
      leaseEpoch: epoch,
      lastSeen: now,
    });
    return { epoch, expiresAt };
  },
});

export const getRoomState = query({
  args: {
    code: v.string(),
    sessionId: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  returns: v.union(roomStateValidator, v.null()),
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!room) {
      return null;
    }
    const seats = await ctx.db
      .query("seats")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    const needed = neededColors(room.mode);
    const publicSeats = needed.map((color) => {
      const seat = seats.find((row) => row.color === color);
      if (!seat) {
        return {
          color,
          displayName: "",
          kind: "human" as const,
          strength: null,
          style: null,
          profileRevision: 0,
          occupied: false,
          stale: false,
        };
      }
      return publicSeat({
        color: seat.color,
        displayName: seat.displayName,
        kind: seat.kind,
        difficulty: seat.difficulty,
        strength: seat.strength,
        style: seat.style,
        profileRevision: seat.profileRevision,
        sessionId: seat.sessionId,
        lastSeen: seat.lastSeen,
        roomStatus: room.status,
        now: args.now ?? 0,
      });
    });
    const game = room.activeGameId ? await ctx.db.get(room.activeGameId) : null;
    const snapshot = game ? parseSnapshot(game.snapshot) : null;
    const sessionId = args.sessionId;
    const yourColors = sessionId
      ? seats.filter((seat) => seat.sessionId === sessionId).map((seat) => seat.color)
      : [];
    const computerColors = seats
      .filter((seat) => seat.kind === "computer")
      .map((seat) => seat.color);
    const computer = seats.find((seat) => seat.kind === "computer") ?? null;
    const computerLease = computer
      ? {
          color: computer.color,
          ownedByYou:
            sessionId !== undefined &&
            (computer.leaseOwnerSessionId ?? computer.sessionId) === sessionId &&
            (computer.leaseExpiresAt ?? 0) > (args.now ?? 0),
          claimable:
            sessionId !== undefined &&
            seats.some((seat) => seat.kind === "human" && seat.sessionId === sessionId) &&
            ((computer.leaseOwnerSessionId ?? computer.sessionId) === sessionId ||
              (computer.leaseExpiresAt ?? 0) <= (args.now ?? 0)),
          epoch: computer.leaseEpoch ?? 0,
          expiresAt: computer.leaseExpiresAt ?? 0,
        }
      : null;
    return {
      room: publicRoom(room),
      seats: publicSeats,
      snapshot,
      computerGameSeed: game?.computerGameSeed ?? null,
      isHost: sessionId !== undefined && room.hostSessionId === sessionId,
      yourColors,
      computerColors,
      computerLease,
    };
  },
});
