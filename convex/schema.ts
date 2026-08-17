import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  colorValidator,
  difficultyValidator,
  modeValidator,
  moveValidator,
  roomStatusValidator,
  seatKindValidator,
  snapshotValidator,
} from "./validators";

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    mode: modeValidator,
    status: roomStatusValidator,
    hostSessionId: v.string(),
    activeGameId: v.optional(v.id("games")),
    createdAt: v.number(),
  }).index("by_code", ["code"]),
  seats: defineTable({
    roomId: v.id("rooms"),
    color: colorValidator,
    sessionId: v.union(v.string(), v.null()),
    displayName: v.string(),
    kind: seatKindValidator,
    difficulty: v.optional(difficultyValidator),
    leaseOwnerSessionId: v.optional(v.union(v.string(), v.null())),
    leaseExpiresAt: v.optional(v.number()),
    leaseEpoch: v.optional(v.number()),
    joinedAt: v.number(),
    lastSeen: v.number(),
  })
    .index("by_room", ["roomId"])
    .index("by_room_and_color", ["roomId", "color"]),
  games: defineTable({
    roomId: v.id("rooms"),
    snapshot: snapshotValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
  moves: defineTable({
    gameId: v.id("games"),
    ply: v.number(),
    resultingPly: v.number(),
    move: moveValidator,
    byColor: colorValidator,
    bySessionId: v.string(),
    requestId: v.string(),
  })
    .index("by_game", ["gameId"])
    .index("by_game_and_requestId", ["gameId", "requestId"]),
});
