import type { Move } from "./types";

/** Green shield e3 -> e4. Shared by browser and downstream host adapters. */
export const SPIKE_MOVE: Move = { type: "motion", from: 22, to: 31 };
