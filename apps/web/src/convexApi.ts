import type { FunctionReference } from "convex/server";
import { anyApi } from "convex/server";

type RoomsApi = {
  createRoom: FunctionReference<"mutation">;
  joinSeat: FunctionReference<"mutation">;
  assignComputerSeat: FunctionReference<"mutation">;
  leaveSeat: FunctionReference<"mutation">;
  heartbeat: FunctionReference<"mutation">;
  claimComputerLease: FunctionReference<"mutation">;
  getRoomState: FunctionReference<"query">;
};

type GamesApi = {
  startGame: FunctionReference<"mutation">;
  rematch: FunctionReference<"mutation">;
  submitMove: FunctionReference<"mutation">;
  getGame: FunctionReference<"query">;
};

const raw = anyApi as unknown as { rooms: RoomsApi; games: GamesApi };

export const api = {
  rooms: raw.rooms,
  games: raw.games,
};
