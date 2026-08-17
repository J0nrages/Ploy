import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Move } from "../packages/rules/src/types.ts";
import { parseSnapshot } from "../packages/rules/src/parse.ts";
import { neededColors, sameMove } from "./lib/identity";
import { loadRules } from "./lib/rules";
import { colorValidator, moveValidator, snapshotValidator } from "./validators";

function asMove(move: {
  type: "motion" | "rotate";
  from?: number;
  to?: number;
  at?: number;
  steps?: number;
  postMoveSteps?: number;
}): Move {
  if (move.type === "rotate") {
    const steps = move.steps;
    if (move.at === undefined || steps === undefined || steps < 1 || steps > 7) {
      throw new Error("invalid move");
    }
    return { type: "rotate", at: move.at, steps: steps as 1 | 2 | 3 | 4 | 5 | 6 | 7 };
  }
  if (move.from === undefined || move.to === undefined) {
    throw new Error("invalid move");
  }
  const post = move.postMoveSteps;
  if (post === undefined) {
    return { type: "motion", from: move.from, to: move.to };
  }
  if (post < 1 || post > 7) {
    throw new Error("invalid move");
  }
  return { type: "motion", from: move.from, to: move.to, postMoveSteps: post as 1 | 2 | 3 | 4 | 5 | 6 | 7 };
}

export const getGame = query({
  args: { code: v.string() },
  returns: v.union(snapshotValidator, v.null()),
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!room?.activeGameId) {
      return null;
    }
    const game = await ctx.db.get(room.activeGameId);
    return game ? parseSnapshot(game.snapshot) : null;
  },
});

export const startGame = mutation({
  args: { code: v.string(), hostSessionId: v.string() },
  returns: snapshotValidator,
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!room) {
      throw new Error("Room not found");
    }
    if (room.hostSessionId !== args.hostSessionId) {
      throw new Error("Only the host may start");
    }
    const seats = await ctx.db
      .query("seats")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();
    for (const color of neededColors(room.mode)) {
      const seat = seats.find((row) => row.color === color);
      if (!seat?.sessionId) {
        throw new Error("Not every seat is filled");
      }
    }
    const api = await loadRules();
    const snapshot = api.createGame(room.mode);
    const now = Date.now();
    const gameId = await ctx.db.insert("games", {
      roomId: room._id,
      snapshot,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(room._id, { status: "active", activeGameId: gameId });
    return snapshot;
  },
});

export const rematch = mutation({
  args: { code: v.string(), hostSessionId: v.string() },
  returns: snapshotValidator,
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (!room || room.hostSessionId !== args.hostSessionId) {
      throw new Error("Only the host may rematch");
    }
    const api = await loadRules();
    const snapshot = api.createGame(room.mode);
    const now = Date.now();
    const gameId = await ctx.db.insert("games", {
      roomId: room._id,
      snapshot,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(room._id, { status: "active", activeGameId: gameId });
    return snapshot;
  },
});

export const submitMove = mutation({
  args: {
    code: v.string(),
    sessionId: v.string(),
    requestId: v.string(),
    expectedPly: v.number(),
    move: moveValidator,
    color: colorValidator,
    computerLeaseEpoch: v.optional(v.number()),
  },
  returns: v.object({ ply: v.number() }),
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    const gameId = room?.activeGameId;
    if (!room || !gameId) {
      throw new Error("No active game");
    }
    const prior = await ctx.db
      .query("moves")
      .withIndex("by_game_and_requestId", (q) =>
        q.eq("gameId", gameId).eq("requestId", args.requestId),
      )
      .unique();
    if (prior) {
      if (
        prior.bySessionId !== args.sessionId ||
        prior.ply !== args.expectedPly ||
        !sameMove(prior.move, args.move)
      ) {
        throw new Error("requestId reused with different payload");
      }
      return { ply: prior.resultingPly };
    }
    const game = await ctx.db.get(gameId);
    if (!game) {
      throw new Error("Game not found");
    }
    const snapshot = parseSnapshot(game.snapshot);
    if (snapshot.ply !== args.expectedPly) {
      throw new Error("stale expected ply");
    }
    const api = await loadRules();
    const acting = api.controllerForTurn(snapshot);
    if (acting !== args.color) {
      throw new Error("not the acting color");
    }
    const seat = await ctx.db
      .query("seats")
      .withIndex("by_room_and_color", (q) => q.eq("roomId", room._id).eq("color", args.color))
      .unique();
    if (!seat || seat.sessionId !== args.sessionId) {
      throw new Error("session is not authorized for this seat");
    }
    if (seat.kind === "computer") {
      if (
        seat.leaseOwnerSessionId !== args.sessionId ||
        (seat.leaseExpiresAt ?? 0) <= Date.now() ||
        seat.leaseEpoch !== args.computerLeaseEpoch
      ) {
        throw new Error("computer lease is not current");
      }
    } else if (args.computerLeaseEpoch !== undefined) {
      throw new Error("human moves must not include a computer lease");
    }
    const next = api.applyMove(snapshot, asMove(args.move), args.color);
    await ctx.db.insert("moves", {
      gameId: game._id,
      ply: snapshot.ply,
      resultingPly: next.ply,
      move: args.move,
      byColor: args.color,
      bySessionId: args.sessionId,
      requestId: args.requestId,
    });
    await ctx.db.patch(game._id, { snapshot: next, updatedAt: Date.now() });
    if (next.winner) {
      await ctx.db.patch(room._id, { status: "finished" });
    }
    return { ply: next.ply };
  },
});
