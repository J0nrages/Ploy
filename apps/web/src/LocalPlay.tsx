import { useEffect, useMemo, useState } from "react";
import {
  applyMove,
  controllerForTurn,
  createGame,
  type Color,
  type Mode,
  type Move,
  type Snapshot,
} from "@ploy/rules";
import { type Difficulty } from "@ploy/ai";
import { PloyBoard, useBoardInteraction } from "@ploy/ui-board";
import {
  createLocalGameId,
  deleteLocalGame,
  loadLocalGames,
  saveLocalGame,
  upsertLocalGame,
  type LocalGameSave,
  type LocalPlayKind,
} from "./localGame";
import { buildMoveTimeline } from "./moveTimeline";
import { PlayHud } from "./PlayHud";
import { RulesHelp } from "./RulesHelp";
import { snapshotTurnKey, type ComputerMoveOperation } from "./computerTurn";
import { useComputerTurn } from "./useComputerTurn";

type LocalView = "setup" | "play";

export function LocalPlay(props: { onBack: () => void }) {
  const [savedGames, setSavedGames] = useState<LocalGameSave[]>(loadLocalGames);
  const latestGame = savedGames[0] ?? null;
  const [view, setView] = useState<LocalView>("setup");
  const [showRules, setShowRules] = useState(false);
  const [currentGameId, setCurrentGameId] = useState<string | null>(latestGame?.id ?? null);
  const [currentGameCreatedAt, setCurrentGameCreatedAt] = useState(
    latestGame?.createdAt ?? Date.now(),
  );
  const [mode, setMode] = useState<Mode>(latestGame?.settings.mode ?? "twoPlayer");
  const [playKind, setPlayKind] = useState<LocalPlayKind>(
    latestGame?.settings.playKind ?? "hotseat",
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(
    latestGame?.settings.difficulty ?? "navigator",
  );
  const [humanColor, setHumanColor] = useState<Extract<Color, "green" | "coral">>(
    latestGame?.settings.humanColor ?? "green",
  );
  const [snapshot, setSnapshot] = useState<Snapshot>(
    () => latestGame?.snapshot ?? createGame("twoPlayer"),
  );
  const [history, setHistory] = useState<Snapshot[]>(() => latestGame?.history ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saveAvailable, setSaveAvailable] = useState(true);

  const acting = controllerForTurn(snapshot);
  const computerEnabled =
    view === "play" &&
    playKind === "computer" &&
    snapshot.mode === "twoPlayer" &&
    acting !== null &&
    acting !== humanColor &&
    snapshot.winner === null;

  useEffect(() => {
    if (view !== "play" || !currentGameId) {
      return;
    }
    const game: LocalGameSave = {
      version: 2,
      id: currentGameId,
      snapshot,
      history,
      settings: { mode: snapshot.mode, playKind, difficulty, humanColor },
      createdAt: currentGameCreatedAt,
      updatedAt: Date.now(),
    };
    setSavedGames((games) => upsertLocalGame(games, game));
    setSaveAvailable(saveLocalGame(game));
  }, [
    currentGameCreatedAt,
    currentGameId,
    difficulty,
    history,
    humanColor,
    playKind,
    snapshot,
    view,
  ]);

  const commit = async (move: Move, operation?: ComputerMoveOperation): Promise<void> => {
    if (!acting) {
      throw new Error("game is complete");
    }
    try {
      const next = applyMove(snapshot, move, acting);
      setHistory((prev) => [...prev, snapshot]);
      setSnapshot(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "illegal move");
      if (operation) {
        throw cause;
      }
    }
  };

  const computer = useComputerTurn({
    snapshot,
    acting,
    enabled: computerEnabled,
    turnKey:
      currentGameId && computerEnabled
        ? snapshotTurnKey(currentGameId, snapshot, acting)
        : null,
    difficulty,
    onMove: commit,
    onError: setError,
  });

  const interaction = useBoardInteraction({
    snapshot,
    actingColor: acting,
    disabled:
      view !== "play" || computer.thinking || computerEnabled || snapshot.winner !== null,
    onCommit: (move) => void commit(move),
  });

  const legalCount = interaction.legal.length;
  const timeline = useMemo(() => buildMoveTimeline(history, snapshot), [history, snapshot]);

  const start = (): void => {
    const nextPlayKind = mode === "twoPlayer" ? playKind : "hotseat";
    const now = Date.now();
    setCurrentGameId(createLocalGameId());
    setCurrentGameCreatedAt(now);
    setPlayKind(nextPlayKind);
    setSnapshot(createGame(mode));
    setHistory([]);
    setError(null);
    interaction.cancel();
    setShowRules(false);
    setView("play");
  };

  const resume = (game: LocalGameSave): void => {
    setCurrentGameId(game.id);
    setCurrentGameCreatedAt(game.createdAt);
    setMode(game.settings.mode);
    setPlayKind(game.settings.playKind);
    setDifficulty(game.settings.difficulty);
    setHumanColor(game.settings.humanColor);
    setSnapshot(game.snapshot);
    setHistory(game.history);
    setError(null);
    setShowRules(false);
    setView("play");
  };

  const removeSavedGame = (gameId: string): void => {
    if (!deleteLocalGame(gameId)) {
      setSaveAvailable(false);
      return;
    }
    setSavedGames((games) => games.filter((game) => game.id !== gameId));
    if (currentGameId === gameId) {
      setCurrentGameId(null);
    }
  };

  if (view === "setup") {
    return (
      <main className="hud menu local-menu">
        <button type="button" className="ghost" onClick={props.onBack}>
          ← Main menu
        </button>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Offline play</p>
            <h1>Play locally</h1>
          </div>
          <button type="button" onClick={() => setShowRules((visible) => !visible)}>
            {showRules ? "Hide rules" : "Rules"}
          </button>
        </div>

        {showRules ? <RulesHelp onClose={() => setShowRules(false)} /> : null}

        {savedGames.length > 0 ? (
          <section className="menu-card resume-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Auto-saved</p>
                <h2>Saved games</h2>
              </div>
              <span className="save-count">{savedGames.length}</span>
            </div>
            <div className="saved-game-list">
              {savedGames.map((game) => (
                <article className="saved-game" key={game.id}>
                  <div className="saved-game-summary">
                    <strong>{modeName(game.snapshot.mode)}</strong>
                    <span>{savedGameStatus(game)}</span>
                    <small>Saved {formatSavedTime(game.updatedAt)}</small>
                  </div>
                  <div className="saved-game-actions">
                    <button type="button" className="primary" onClick={() => resume(game)}>
                      Resume
                    </button>
                    <button type="button" onClick={() => removeSavedGame(game.id)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <p className="hint">No saved local games on this device.</p>
        )}

        <section className="menu-card">
          <p className="eyebrow">New game</p>
          <h2>Choose your game</h2>
          <p className="field-label">Game type</p>
          <div className="choice-grid choice-grid-modes">
            <ChoiceButton
              selected={mode === "twoPlayer"}
              title="Two-player"
              description="Classic head-to-head"
              onClick={() => setMode("twoPlayer")}
            />
            <ChoiceButton
              selected={mode === "fourPlayerFfa"}
              title="Free-for-all"
              description="Four colors, one winner"
              onClick={() => setMode("fourPlayerFfa")}
            />
            <ChoiceButton
              selected={mode === "partnership"}
              title="Partnership"
              description="Two teams of two"
              onClick={() => setMode("partnership")}
            />
          </div>

          {mode === "twoPlayer" ? (
            <>
              <p className="field-label">Opponent</p>
              <div className="choice-grid">
                <ChoiceButton
                  selected={playKind === "hotseat"}
                  title="Same screen"
                  description="Take turns on this device"
                  onClick={() => setPlayKind("hotseat")}
                />
                <ChoiceButton
                  selected={playKind === "computer"}
                  title="Computer"
                  description="Play against the local AI"
                  onClick={() => setPlayKind("computer")}
                />
              </div>
              {playKind === "computer" ? (
                <div className="computer-settings">
                  <fieldset>
                    <legend>Difficulty</legend>
                    <div className="option-pills">
                      {(["cadet", "navigator", "commander", "strategist"] as const).map(
                        (level) => (
                          <button
                            key={level}
                            type="button"
                            className={difficulty === level ? "is-selected" : ""}
                            aria-pressed={difficulty === level}
                            onClick={() => setDifficulty(level)}
                          >
                            {difficultyName(level)}
                          </button>
                        ),
                      )}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>Play as</legend>
                    <div className="color-choices">
                      <button
                        type="button"
                        className={humanColor === "green" ? "color-choice is-selected" : "color-choice"}
                        aria-pressed={humanColor === "green"}
                        onClick={() => setHumanColor("green")}
                      >
                        <span className="color-dot green" aria-hidden="true" />
                        <span>
                          <strong>Green</strong>
                          <small>Moves first</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={humanColor === "coral" ? "color-choice is-selected" : "color-choice"}
                        aria-pressed={humanColor === "coral"}
                        onClick={() => setHumanColor("coral")}
                      >
                        <span className="color-dot coral" aria-hidden="true" />
                        <span>
                          <strong>Coral</strong>
                          <small>Moves second</small>
                        </span>
                      </button>
                    </div>
                  </fieldset>
                </div>
              ) : null}
            </>
          ) : (
            <p className="hint">Players share this device and take turns in color order.</p>
          )}

          <p className="hint">Starting creates a separate auto-save. Existing games are kept.</p>
          <button type="button" className="primary wide" onClick={start}>
            <span>Start new game</span>
            <span aria-hidden="true">→</span>
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="app">
      <PlayHud
        snapshot={snapshot}
        acting={acting}
        thinking={computer.thinking}
        computerStatus={computer.status}
        error={error}
        selectedMoves={interaction.selectedMoves}
        staging={interaction.staging}
        canUndo={history.length > 0}
        onUndo={() => {
          const previous = history.at(-1);
          if (previous) {
            setSnapshot(previous);
            setHistory(history.slice(0, -1));
            interaction.cancel();
          }
        }}
        onCancelThink={computer.cancel}
        onRetryThink={computer.retry}
        onCancel={interaction.cancel}
        timeline={timeline}
      >
        <nav className="game-nav" aria-label="Game">
          <button
            type="button"
            className="ghost"
            onClick={() => {
              computer.cancel();
              interaction.cancel();
              setView("setup");
            }}
          >
            ← Game menu
          </button>
          <button type="button" onClick={() => setShowRules((visible) => !visible)}>
            {showRules ? "Hide rules" : "Rules"}
          </button>
        </nav>
        <p className="eyebrow">Local game</p>
        <h1>{modeName(snapshot.mode)}</h1>
        <p className="save-state">
          {saveAvailable
            ? "Auto-saved on this device"
            : "Auto-save unavailable — keep this tab open"}
        </p>
        {showRules ? <RulesHelp onClose={() => setShowRules(false)} /> : null}
        <p className="hint">{moveHint(acting, legalCount, interaction.selected !== null)}</p>
      </PlayHud>
      <div className="board-wrap">
        <PloyBoard
          snapshot={snapshot}
          selected={interaction.selected}
          legal={interaction.selectedMoves}
          staging={interaction.staging}
          invalidAttempt={interaction.invalidAttempt}
          actingColor={acting}
          onSelectSquare={interaction.onSelectSquare}
          onCommitRotation={interaction.commitRotation}
          onCommitStaging={interaction.commitStaging}
          onCancel={interaction.cancel}
        />
      </div>
    </div>
  );
}

function modeName(mode: Mode): string {
  if (mode === "fourPlayerFfa") {
    return "Free-for-all";
  }
  return mode === "partnership" ? "Partnership" : "Two-player";
}

function colorName(color: Color | null): string {
  if (!color) {
    return "No player";
  }
  return color.charAt(0).toUpperCase() + color.slice(1);
}

function savedGameStatus(game: LocalGameSave): string {
  if (game.snapshot.winner) {
    return `Finished · ${game.snapshot.ply} turns`;
  }
  if (game.snapshot.ply === 0) {
    return `${colorName(controllerForTurn(game.snapshot))} to move · New game`;
  }
  const turns = game.snapshot.ply === 1 ? "turn" : "turns";
  return `${colorName(controllerForTurn(game.snapshot))} to move · ${game.snapshot.ply} ${turns}`;
}

function formatSavedTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function moveHint(acting: Color | null, legalCount: number, selected: boolean): string {
  if (!acting) {
    return "The game is complete. Open the game menu to start another.";
  }
  if (selected) {
    return "Choose a glowing destination or a rotation. Press Escape to cancel.";
  }
  return `Select a ${colorName(acting)} piece to move or rotate. ${legalCount} legal choices available.`;
}

function ChoiceButton(props: {
  selected: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={props.selected ? "choice-card is-selected" : "choice-card"}
      aria-pressed={props.selected}
      onClick={props.onClick}
    >
      <span className="choice-indicator" aria-hidden="true" />
      <span>
        <strong>{props.title}</strong>
        <small>{props.description}</small>
      </span>
    </button>
  );
}

function difficultyName(difficulty: Difficulty): string {
  if (difficulty === "cadet") {
    return "Cadet";
  }
  if (difficulty === "navigator") {
    return "Navigator";
  }
  if (difficulty === "commander") {
    return "Commander";
  }
  return "Strategist";
}
