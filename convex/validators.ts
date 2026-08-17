import { v } from "convex/values";

export const colorValidator = v.union(
  v.literal("green"),
  v.literal("coral"),
  v.literal("yellow"),
  v.literal("blue"),
);

export const modeValidator = v.union(
  v.literal("twoPlayer"),
  v.literal("fourPlayerFfa"),
  v.literal("partnership"),
);

export const difficultyValidator = v.union(
  v.literal("cadet"),
  v.literal("navigator"),
  v.literal("commander"),
  v.literal("strategist"),
);

export const seatKindValidator = v.union(v.literal("human"), v.literal("computer"));

export const roomStatusValidator = v.union(
  v.literal("lobby"),
  v.literal("active"),
  v.literal("finished"),
);

export const pieceValidator = v.object({
  id: v.string(),
  color: colorValidator,
  controller: colorValidator,
  kind: v.union(
    v.literal("commander"),
    v.literal("shield"),
    v.literal("lance"),
    v.literal("probe"),
  ),
  variant: v.optional(v.union(v.literal("heavy"), v.literal("medium"), v.literal("light"))),
  rot: v.number(),
});

export const snapshotValidator = v.object({
  mode: modeValidator,
  board: v.array(v.array(v.union(pieceValidator, v.null()))),
  turnSeat: colorValidator,
  inactiveSeats: v.array(colorValidator),
  winner: v.union(
    v.object({ type: v.literal("color"), color: colorValidator }),
    v.object({
      type: v.literal("team"),
      team: v.union(v.literal("green-yellow"), v.literal("coral-blue")),
    }),
    v.null(),
  ),
  ply: v.number(),
});

export const moveValidator = v.union(
  v.object({
    type: v.literal("motion"),
    from: v.number(),
    to: v.number(),
    postMoveSteps: v.optional(v.number()),
  }),
  v.object({
    type: v.literal("rotate"),
    at: v.number(),
    steps: v.number(),
  }),
);

export const publicSeatValidator = v.object({
  color: colorValidator,
  displayName: v.string(),
  kind: seatKindValidator,
  difficulty: v.union(difficultyValidator, v.null()),
  occupied: v.boolean(),
  stale: v.boolean(),
});

export const publicRoomValidator = v.object({
  id: v.string(),
  code: v.string(),
  mode: modeValidator,
  status: roomStatusValidator,
  activeGameId: v.union(v.string(), v.null()),
});

export const roomStateValidator = v.object({
  room: publicRoomValidator,
  seats: v.array(publicSeatValidator),
  snapshot: v.union(snapshotValidator, v.null()),
  isHost: v.boolean(),
  yourColors: v.array(colorValidator),
  computerColors: v.array(colorValidator),
  computerLease: v.union(
    v.object({
      color: colorValidator,
      ownedByYou: v.boolean(),
      claimable: v.boolean(),
      epoch: v.number(),
      expiresAt: v.number(),
    }),
    v.null(),
  ),
});
