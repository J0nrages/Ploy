export type Square = number;

export type Color = "green" | "coral" | "yellow" | "blue";
export type Mode = "twoPlayer" | "fourPlayerFfa" | "partnership";
export type Rotation = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Team = "green-yellow" | "coral-blue";

export type Piece =
  | { id: string; color: Color; controller: Color; kind: "commander"; rot: Rotation }
  | { id: string; color: Color; controller: Color; kind: "shield"; rot: Rotation }
  | {
      id: string;
      color: Color;
      controller: Color;
      kind: "lance" | "probe";
      variant: "heavy" | "medium" | "light";
      rot: Rotation;
    };

export type Move =
  | { type: "motion"; from: Square; to: Square; postMoveSteps?: 1 | 2 | 3 | 4 | 5 | 6 | 7 }
  | { type: "rotate"; at: Square; steps: 1 | 2 | 3 | 4 | 5 | 6 | 7 };

export type Winner = { type: "color"; color: Color } | { type: "team"; team: Team } | null;

export type Snapshot = {
  mode: Mode;
  board: (Piece | null)[][];
  turnSeat: Color;
  inactiveSeats: Color[];
  winner: Winner;
  ply: number;
};

export type RulesErrorCode =
  | "rulesNotInitialized"
  | "invalidSnapshot"
  | "invalidMove"
  | "notYourTurn"
  | "gameOver"
  | "noSuchPiece"
  | "wrongController";

export type WasmResponse<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };
