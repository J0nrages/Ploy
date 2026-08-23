import {
  OPPONENT_STYLES,
  STRENGTHS,
  type OpponentStyle,
  type Strength,
} from "@ploy/ai";
import { parseSnapshot, type Color, type Mode, type Snapshot } from "@ploy/rules";
import {
  createAdaptiveStrengthSettings,
  strengthIndex,
  type AdaptiveSample,
  type AdaptiveStrengthSettings,
} from "./adaptiveStrength";

export type LocalPlayKind = "hotseat" | "computer";

export type LocalGameSettings = {
  mode: Mode;
  playKind: LocalPlayKind;
  strength: Strength;
  style: OpponentStyle;
  gameSeed: number;
  profileRevision: number;
  humanColor: Extract<Color, "green" | "coral">;
  adaptive: AdaptiveStrengthSettings;
};

export type LocalGameSave = {
  version: 4;
  id: string;
  snapshot: Snapshot;
  history: Snapshot[];
  adaptiveSamples: AdaptiveSample[];
  settings: LocalGameSettings;
  createdAt: number;
  updatedAt: number;
};

type LocalGameLibrary = {
  version: 4;
  games: LocalGameSave[];
};

type ParsedContents = {
  snapshot: Snapshot;
  history: Snapshot[];
  adaptiveSamples: AdaptiveSample[];
  settings: LocalGameSettings;
};

const LOCAL_GAMES_KEY = "ploy.localGames.v4";
const V3_LOCAL_GAMES_KEY = "ploy.localGames.v3";
const V2_LOCAL_GAMES_KEY = "ploy.localGames.v2";
const LEGACY_LOCAL_GAME_KEY = "ploy.localGame.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUint32(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= 0xffffffff;
}

function parseStrength(value: unknown): Strength | null {
  return STRENGTHS.find((item) => item === value) ?? null;
}

function parseAdaptiveSample(value: unknown): AdaptiveSample | null {
  if (
    !isRecord(value) ||
    !isUint32(value.ply) ||
    !isUint32(value.depth) ||
    !Number.isFinite(value.scoreLoss) ||
    typeof value.scoreLoss !== "number" ||
    value.scoreLoss < 0 ||
    !isUint32(value.legalMoveCount) ||
    (value.fallback !== "none" && value.fallback !== "static")
  ) {
    return null;
  }
  return {
    ply: value.ply,
    depth: value.depth,
    scoreLoss: value.scoreLoss,
    legalMoveCount: value.legalMoveCount,
    fallback: value.fallback,
  };
}

function parseContents(value: Record<string, unknown>): ParsedContents | null {
  if (!isRecord(value.settings) || !Array.isArray(value.history)) {
    return null;
  }

  const { settings } = value;
  const playKind =
    settings.playKind === "hotseat" || settings.playKind === "computer"
      ? settings.playKind
      : null;
  const strength = parseStrength(settings.strength ?? settings.difficulty);
  const style = OPPONENT_STYLES.find((item) => item === settings.style) ?? "balanced";
  const humanColor =
    settings.humanColor === "green" || settings.humanColor === "coral"
      ? settings.humanColor
      : null;

  if (!playKind || !strength || !humanColor) {
    return null;
  }

  try {
    const snapshot = parseSnapshot(value.snapshot);
    const history = value.history.map((item) => parseSnapshot(item));
    const parsedSamples = Array.isArray(value.adaptiveSamples)
      ? value.adaptiveSamples.map(parseAdaptiveSample)
      : [];
    if (parsedSamples.some((sample) => sample === null)) {
      return null;
    }
    const adaptiveSamples = parsedSamples.filter(
      (sample): sample is AdaptiveSample => sample !== null,
    );
    const adaptiveValue = isRecord(settings.adaptive) ? settings.adaptive : null;
    const defaults = createAdaptiveStrengthSettings(strength);
    const minimum = parseStrength(adaptiveValue?.minimum) ?? defaults.minimum;
    const maximum = parseStrength(adaptiveValue?.maximum) ?? defaults.maximum;
    const adaptive: AdaptiveStrengthSettings = {
      enabled: adaptiveValue?.enabled === true,
      minimum:
        strengthIndex(minimum) <= strengthIndex(maximum) ? minimum : maximum,
      maximum:
        strengthIndex(minimum) <= strengthIndex(maximum) ? maximum : minimum,
      baseStrength: parseStrength(adaptiveValue?.baseStrength) ?? strength,
    };
    if (
      settings.mode !== snapshot.mode ||
      history.some((item) => item.mode !== snapshot.mode || item.ply >= snapshot.ply) ||
      (playKind === "computer" && snapshot.mode !== "twoPlayer") ||
      new Set(adaptiveSamples.map((sample) => sample.ply)).size !== adaptiveSamples.length ||
      adaptiveSamples.some((sample) => sample.ply >= snapshot.ply)
    ) {
      return null;
    }

    const fallbackSeed = stableLegacySeed(
      typeof value.id === "string" ? value.id : "legacy",
      typeof value.createdAt === "number" ? value.createdAt : 0,
    );
    return {
      snapshot,
      history,
      adaptiveSamples: adaptiveSamples.sort((left, right) => left.ply - right.ply),
      settings: {
        mode: snapshot.mode,
        playKind,
        strength,
        style,
        gameSeed: isUint32(settings.gameSeed) ? settings.gameSeed : fallbackSeed,
        profileRevision: isUint32(settings.profileRevision) ? settings.profileRevision : 0,
        humanColor,
        adaptive,
      },
    };
  } catch {
    return null;
  }
}

export function parseLocalGameSave(value: unknown): LocalGameSave | null {
  if (
    !isRecord(value) ||
    (value.version !== 2 && value.version !== 3 && value.version !== 4) ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.createdAt !== "number" ||
    typeof value.updatedAt !== "number"
  ) {
    return null;
  }

  const contents = parseContents(value);
  if (!contents) {
    return null;
  }

  return {
    version: 4,
    id: value.id,
    ...contents,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function parseLegacySingleSave(value: unknown): LocalGameSave | null {
  if (!isRecord(value) || value.version !== 1) {
    return null;
  }
  const savedAt = typeof value.savedAt === "number" ? value.savedAt : Date.now();
  const contents = parseContents({ ...value, id: "legacy", createdAt: savedAt });
  if (!contents) {
    return null;
  }
  return {
    version: 4,
    id: createLocalGameId(),
    ...contents,
    createdAt: savedAt,
    updatedAt: savedAt,
  };
}

function parseLocalGameLibrary(value: unknown): LocalGameLibrary | null {
  if (
    !isRecord(value) ||
    (value.version !== 2 && value.version !== 3 && value.version !== 4) ||
    !Array.isArray(value.games)
  ) {
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
  return { version: 4, games: sortGames(validGames) };
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

export function createGameSeed(): number {
  const values = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
    return values[0] ?? 0;
  }
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

function stableLegacySeed(id: string, createdAt: number): number {
  let value = createdAt >>> 0;
  for (const char of id) {
    value = Math.imul(value ^ char.codePointAt(0)!, 16_777_619);
  }
  return value >>> 0;
}

function sortGames(games: LocalGameSave[]): LocalGameSave[] {
  return [...games].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function upsertLocalGame(
  games: LocalGameSave[],
  updatedGame: LocalGameSave,
): LocalGameSave[] {
  return sortGames([updatedGame, ...games.filter((game) => game.id !== updatedGame.id)]);
}

function persistLibrary(storage: Storage, games: LocalGameSave[]): void {
  storage.setItem(
    LOCAL_GAMES_KEY,
    JSON.stringify({ version: 4, games: sortGames(games) } satisfies LocalGameLibrary),
  );
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

    for (const legacyKey of [V3_LOCAL_GAMES_KEY, V2_LOCAL_GAMES_KEY]) {
      const legacyEncoded = storage.getItem(legacyKey);
      if (!legacyEncoded) {
        continue;
      }
      const migrated = parseLocalGameLibrary(JSON.parse(legacyEncoded) as unknown);
      if (migrated) {
        persistLibrary(storage, migrated.games);
        storage.removeItem(legacyKey);
        return migrated.games;
      }
      storage.removeItem(legacyKey);
    }

    const legacyEncoded = storage.getItem(LEGACY_LOCAL_GAME_KEY);
    if (!legacyEncoded) {
      return [];
    }
    const migrated = parseLegacySingleSave(JSON.parse(legacyEncoded) as unknown);
    if (!migrated) {
      storage.removeItem(LEGACY_LOCAL_GAME_KEY);
      return [];
    }
    persistLibrary(storage, [migrated]);
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
    persistLibrary(storage, upsertLocalGame(current, game));
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
    persistLibrary(
      storage,
      library.games.filter((game) => game.id !== gameId),
    );
    return true;
  } catch {
    return false;
  }
}
