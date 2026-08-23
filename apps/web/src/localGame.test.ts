import { expect, test } from "bun:test";
import { applyMove, createGame, initializeRules, SPIKE_MOVE } from "@ploy/rules";
import { parseLocalGameSave, upsertLocalGame, type LocalGameSave } from "./localGame";
import { createAdaptiveStrengthSettings } from "./adaptiveStrength";

test("local game saves preserve a validated snapshot and undo history", async () => {
  await initializeRules();
  const start = createGame("twoPlayer");
  const next = applyMove(start, SPIKE_MOVE, "green");
  const save: LocalGameSave = {
    version: 4,
    id: "game-1",
    snapshot: next,
    history: [start],
    adaptiveSamples: [
      { ply: 0, depth: 2, scoreLoss: 12, legalMoveCount: 8, fallback: "none" },
    ],
    settings: {
      mode: "twoPlayer",
      playKind: "computer",
      strength: "navigator",
      style: "guardian",
      gameSeed: 42,
      profileRevision: 3,
      humanColor: "green",
      adaptive: {
        ...createAdaptiveStrengthSettings("navigator"),
        enabled: true,
      },
    },
    createdAt: 100,
    updatedAt: 123,
  };

  const parsed = parseLocalGameSave(JSON.parse(JSON.stringify(save)) as unknown);

  expect(parsed?.snapshot.ply).toBe(1);
  expect(parsed?.history[0]?.ply).toBe(0);
  expect(parsed?.settings.playKind).toBe("computer");
  expect(parsed?.settings.style).toBe("guardian");
  expect(parsed?.settings.gameSeed).toBe(42);
  expect(parsed?.settings.adaptive.enabled).toBe(true);
  expect(parsed?.adaptiveSamples).toHaveLength(1);
});

test("version 2 saves migrate difficulty to balanced strength profiles", async () => {
  await initializeRules();
  const snapshot = createGame("twoPlayer");
  const migrated = parseLocalGameSave({
    version: 2,
    id: "old-game",
    snapshot,
    history: [],
    settings: {
      mode: "twoPlayer",
      playKind: "computer",
      difficulty: "commander",
      humanColor: "green",
    },
    createdAt: 100,
    updatedAt: 123,
  });

  expect(migrated?.version).toBe(4);
  expect(migrated?.settings.strength).toBe("commander");
  expect(migrated?.settings.style).toBe("balanced");
  expect(migrated?.settings.profileRevision).toBe(0);
  expect(migrated?.settings.gameSeed).toBeGreaterThanOrEqual(0);
  expect(migrated?.settings.adaptive.enabled).toBe(false);
  expect(migrated?.adaptiveSamples).toEqual([]);
});

test("local game saves reject mismatched or malformed state", async () => {
  await initializeRules();
  const snapshot = createGame("twoPlayer");

  expect(
    parseLocalGameSave({
      version: 2,
      id: "game-1",
      snapshot,
      history: [],
      settings: {
        mode: "partnership",
        playKind: "hotseat",
        strength: "navigator",
        style: "balanced",
        gameSeed: 1,
        profileRevision: 0,
        humanColor: "green",
      },
      createdAt: 100,
      updatedAt: 123,
    }),
  ).toBeNull();
  expect(parseLocalGameSave({ version: 4 })).toBeNull();
});

test("upserting a new game keeps existing saves and sorts newest first", async () => {
  await initializeRules();
  const snapshot = createGame("twoPlayer");
  const first: LocalGameSave = {
    version: 4,
    id: "game-1",
    snapshot,
    history: [],
    adaptiveSamples: [],
    settings: {
      mode: "twoPlayer",
      playKind: "hotseat",
      strength: "navigator",
      style: "balanced",
      gameSeed: 2,
      profileRevision: 0,
      humanColor: "green",
      adaptive: createAdaptiveStrengthSettings("navigator"),
    },
    createdAt: 100,
    updatedAt: 100,
  };
  const second: LocalGameSave = {
    ...first,
    id: "game-2",
    createdAt: 200,
    updatedAt: 200,
  };

  const games = upsertLocalGame(upsertLocalGame([], first), second);
  const updatedFirst = { ...first, updatedAt: 300 };
  const updated = upsertLocalGame(games, updatedFirst);

  expect(updated.map((game) => game.id)).toEqual(["game-1", "game-2"]);
  expect(updated).toHaveLength(2);
});
