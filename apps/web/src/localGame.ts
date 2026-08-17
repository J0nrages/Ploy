import type { Difficulty } from "@ploy/ai";
import { parseSnapshot, type Color, type Mode, type Snapshot } from "@ploy/rules";

export type LocalPlayKind = "hotseat" | "computer";

export type LocalGameSettings = {
  mode: Mode;
  playKind: LocalPlayKind;
  difficulty: Difficulty;
  humanColor: Extract<Color, "green" | "coral">;
};

export type LocalGameSave = {
  version: 2;
  id: string;
  snapshot: Snapshot;
  history: Snapshot[];
  settings: LocalGameSettings;
  createdAt: number;
  updatedAt: number;
};

type LocalGameLibrary = {
  version: 2;
  games: LocalGameSave[];
};

type LegacyLocalGameSave = {
  version: 1;
  snapshot: Snapshot;
  history: Snapshot[];
  settings: LocalGameSettings;
  savedAt: number;
};

const LOCAL_GAMES_KEY = "ploy.localGames.v2";
const LEGACY_LOCAL_GAME_KEY = "ploy.localGame.v1";
const difficulties: Difficulty[] = ["cadet", "navigator", "commander", "strategist"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGameContents(value: Record<string, unknown>): {
  snapshot: Snapshot;
  history: Snapshot[];
  settings: LocalGameSettings;
} | null {
  if (!isRecord(value.settings) || !Array.isArray(value.history)) {
    return null;
  }

  const { settings } = value;
  const playKind =
    settings.playKind === "hotseat" || settings.playKind === "computer"
      ? settings.playKind
      : null;
  const difficulty = difficulties.find((item) => item === settings.difficulty) ?? null;
  const humanColor =
    settings.humanColor === "green" || settings.humanColor === "coral"
      ? settings.humanColor
      : null;

  if (!playKind || !difficulty || !humanColor) {
    return null;
  }

  try {
    const snapshot = parseSnapshot(value.snapshot);
    const history = value.history.map((item) => parseSnapshot(item));
    if (
      settings.mode !== snapshot.mode ||
      history.some((item) => item.mode !== snapshot.mode || item.ply >= snapshot.ply) ||
      (playKind === "computer" && snapshot.mode !== "twoPlayer")
    ) {
      return null;
    }

    return {
      snapshot,
      history,
      settings: {
        mode: snapshot.mode,
        playKind,
        difficulty,
        humanColor,
      },
    };
  } catch {
    return null;
  }
}

export function parseLocalGameSave(value: unknown): LocalGameSave | null {
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.createdAt !== "number" ||
    typeof value.updatedAt !== "number"
  ) {
    return null;
  }

  const contents = parseGameContents(value);
  if (!contents) {
    return null;
  }

  return {
    version: 2,
    id: value.id,
    ...contents,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function parseLegacyLocalGameSave(value: unknown): LegacyLocalGameSave | null {
  if (!isRecord(value) || value.version !== 1) {
    return null;
  }
  const contents = parseGameContents(value);
  if (!contents) {
    return null;
  }
  return {
    version: 1,
    ...contents,
    savedAt: typeof value.savedAt === "number" ? value.savedAt : 0,
  };
}

function parseLocalGameLibrary(value: unknown): LocalGameLibrary | null {
  if (!isRecord(value) || value.version !== 2 || !Array.isArray(value.games)) {
    return null;
  }
  const games = value.games.map(parseLocalGameSave);
  if (games.some((game) => game === null)) {
    return null;
  }
  const validGames = games.filter((game): game is LocalGameSave => game !== null);
  if (new Set(validGames.map((game) => game.id)).size !== validGames.length) {
    return null;
  }
  return { version: 2, games: sortGames(validGames) };
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function createLocalGameId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sortGames(games: LocalGameSave[]): LocalGameSave[] {
  return [...games].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function upsertLocalGame(
  games: LocalGameSave[],
  updatedGame: LocalGameSave,
): LocalGameSave[] {
  return sortGames([
    updatedGame,
    ...games.filter((game) => game.id !== updatedGame.id),
  ]);
}

export function loadLocalGames(): LocalGameSave[] {
  const storage = localStorageOrNull();
  if (!storage) {
    return [];
  }

  try {
    const encoded = storage.getItem(LOCAL_GAMES_KEY);
    if (encoded) {
      const library = parseLocalGameLibrary(JSON.parse(encoded) as unknown);
      if (library) {
        return library.games;
      }
      storage.removeItem(LOCAL_GAMES_KEY);
    }

    const legacyEncoded = storage.getItem(LEGACY_LOCAL_GAME_KEY);
    if (!legacyEncoded) {
      return [];
    }
    const legacy = parseLegacyLocalGameSave(JSON.parse(legacyEncoded) as unknown);
    if (!legacy) {
      storage.removeItem(LEGACY_LOCAL_GAME_KEY);
      return [];
    }
    const migratedAt = legacy.savedAt || Date.now();
    const migrated: LocalGameSave = {
      version: 2,
      id: createLocalGameId(),
      snapshot: legacy.snapshot,
      history: legacy.history,
      settings: legacy.settings,
      createdAt: migratedAt,
      updatedAt: migratedAt,
    };
    storage.setItem(
      LOCAL_GAMES_KEY,
      JSON.stringify({ version: 2, games: [migrated] } satisfies LocalGameLibrary),
    );
    storage.removeItem(LEGACY_LOCAL_GAME_KEY);
    return [migrated];
  } catch {
    return [];
  }
}

export function saveLocalGame(game: LocalGameSave): boolean {
  const storage = localStorageOrNull();
  if (!storage) {
    return false;
  }

  try {
    const encoded = storage.getItem(LOCAL_GAMES_KEY);
    const current = encoded
      ? parseLocalGameLibrary(JSON.parse(encoded) as unknown)?.games ?? []
      : [];
    const library: LocalGameLibrary = {
      version: 2,
      games: upsertLocalGame(current, game),
    };
    storage.setItem(LOCAL_GAMES_KEY, JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}

export function deleteLocalGame(gameId: string): boolean {
  const storage = localStorageOrNull();
  if (!storage) {
    return false;
  }
  try {
    const encoded = storage.getItem(LOCAL_GAMES_KEY);
    if (!encoded) {
      return true;
    }
    const library = parseLocalGameLibrary(JSON.parse(encoded) as unknown);
    if (!library) {
      return false;
    }
    storage.setItem(
      LOCAL_GAMES_KEY,
      JSON.stringify({
        version: 2,
        games: library.games.filter((game) => game.id !== gameId),
      } satisfies LocalGameLibrary),
    );
    return true;
  } catch {
    return false;
  }
}
