import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { controllerForTurn, type Color, type Mode, type Move, type Snapshot } from "@ploy/rules";
import { type Difficulty } from "@ploy/ai";
import { PloyBoard, useBoardInteraction } from "@ploy/ui-board";
import { api } from "./convexApi";
import { PlayHud } from "./PlayHud";
import type { ComputerMoveOperation } from "./computerTurn";
import { getSessionId, getStoredName, newRequestId, storeName } from "./session";
import { useComputerTurn } from "./useComputerTurn";

type PublicSeat = {
  color: Color;
  displayName: string;
  kind: "human" | "computer";
  difficulty: Difficulty | null;
  occupied: boolean;
  stale: boolean;
};

type RoomState = {
  room: {
    code: string;
    mode: Mode;
    status: "lobby" | "active" | "finished";
    activeGameId: string | null;
  };
  seats: PublicSeat[];
  snapshot: Snapshot | null;
  isHost: boolean;
  yourColors: Color[];
  computerColors: Color[];
  computerLease: {
    color: Color;
    ownedByYou: boolean;
    claimable: boolean;
    epoch: number;
    expiresAt: number;
  } | null;
};

export function OnlinePlay(props: { onBack: () => void }) {
  const sessionId = getSessionId();
  const [code, setCode] = useState("");
  const [joinedCode, setJoinedCode] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(getStoredName);
  const [mode, setMode] = useState<Mode>("twoPlayer");
  const [difficulty, setDifficulty] = useState<Difficulty>("navigator");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const claimingLeaseRef = useRef(false);

  const createRoom = useMutation(api.rooms.createRoom);
  const joinSeat = useMutation(api.rooms.joinSeat);
  const assignComputer = useMutation(api.rooms.assignComputerSeat);
  const leaveSeat = useMutation(api.rooms.leaveSeat);
  const heartbeat = useMutation(api.rooms.heartbeat);
  const claimComputerLease = useMutation(api.rooms.claimComputerLease);
  const startGame = useMutation(api.games.startGame);
  const rematch = useMutation(api.games.rematch);
  const submitMove = useMutation(api.games.submitMove);

  const state = useQuery(
    api.rooms.getRoomState,
    joinedCode ? { code: joinedCode, sessionId, now } : "skip",
  ) as RoomState | null | undefined;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!joinedCode) {
      return;
    }
    const tick = (): void => {
      void heartbeat({ code: joinedCode, sessionId });
    };
    tick();
    const timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, [heartbeat, joinedCode, sessionId]);

  const snapshot = state?.snapshot ?? null;
  const acting = snapshot ? controllerForTurn(snapshot) : null;
  const computerLease = state?.computerLease ?? null;
  const computerEnabled = Boolean(
    snapshot &&
      acting &&
      state?.computerColors.includes(acting) &&
      computerLease?.color === acting &&
      computerLease.ownedByYou &&
      !snapshot.winner,
  );
  const humanTurn = Boolean(
    snapshot &&
      acting &&
      state?.yourColors.includes(acting) &&
      !state.computerColors.includes(acting) &&
      !snapshot.winner,
  );

  useEffect(() => {
    if (
      !joinedCode ||
      !snapshot ||
      !acting ||
      !computerLease ||
      computerLease.color !== acting ||
      computerLease.ownedByYou ||
      !computerLease.claimable ||
      claimingLeaseRef.current ||
      snapshot.winner
    ) {
      return;
    }
    claimingLeaseRef.current = true;
    void claimComputerLease({ code: joinedCode, sessionId, color: acting })
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : "computer lease failed";
        if (!message.includes("Computer lease is active")) {
          setError(message);
        }
      })
      .finally(() => {
        claimingLeaseRef.current = false;
      });
  }, [
    acting,
    claimComputerLease,
    computerLease,
    joinedCode,
    sessionId,
    snapshot,
  ]);

  const commit = async (move: Move, operation?: ComputerMoveOperation): Promise<void> => {
    if (!joinedCode || !snapshot || !acting) {
      throw new Error("No active turn");
    }
    try {
      await submitMove({
        code: joinedCode,
        sessionId,
        requestId: operation?.requestId ?? newRequestId(),
        expectedPly: operation?.expectedPly ?? snapshot.ply,
        move,
        color: acting,
        computerLeaseEpoch: operation ? computerLease?.epoch : undefined,
      });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "move rejected");
      throw cause;
    }
  };

  const computerDifficulty =
    state?.seats.find((seat) => seat.kind === "computer")?.difficulty ?? difficulty;

  const computer = useComputerTurn({
    snapshot,
    acting,
    enabled: computerEnabled,
    turnKey:
      computerEnabled && state?.room.activeGameId
        ? `${state.room.activeGameId}:${snapshot?.ply ?? -1}:${acting ?? "none"}`
        : null,
    profile: { strength: computerDifficulty, style: "balanced" },
    gameSeed: 0,
    profileRevision: 0,
    onMove: commit,
    onError: setError,
  });

  const interaction = useBoardInteraction({
    snapshot,
    actingColor: acting,
    disabled: !humanTurn || computer.thinking,
    onCommit: (move) => void commit(move),
  });

  const leave = (): void => {
    if (joinedCode) {
      void leaveSeat({ code: joinedCode, sessionId });
    }
    setJoinedCode(null);
    props.onBack();
  };

  if (!joinedCode) {
    return (
      <main className="hud menu">
        <button type="button" className="ghost" onClick={props.onBack}>
          ← Main menu
        </button>
        <h1>Online room</h1>
        <p className="lede">
          Anonymous invite codes. Humans and a two-player computer seat share one live table.
        </p>
        {error ? <p className="error">{error}</p> : null}
        <label>
          Callsign
          <input
            value={displayName}
            maxLength={24}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <div className="row">
          <select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
            <option value="twoPlayer">Two-player</option>
            <option value="fourPlayerFfa">Free-for-all</option>
            <option value="partnership">Partnership</option>
          </select>
          <button
            type="button"
            onClick={() => {
              storeName(displayName);
              void createRoom({ mode, hostSessionId: sessionId, displayName })
                .then((room) => {
                  const created = room as { code: string };
                  setJoinedCode(created.code);
                  setCode(created.code);
                  setError(null);
                })
                .catch((cause: unknown) => {
                  setError(cause instanceof Error ? cause.message : "could not create room");
                });
            }}
          >
            Open room
          </button>
        </div>
        <label>
          Room code
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ABC234"
          />
        </label>
        <div className="row">
          {(["green", "coral", "yellow", "blue"] as const)
            .filter((color) => mode !== "twoPlayer" || color === "green" || color === "coral")
            .map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  storeName(displayName);
                  const nextCode = code.trim().toUpperCase();
                  void joinSeat({ code: nextCode, sessionId, color, displayName })
                    .then(() => {
                      setJoinedCode(nextCode);
                      setError(null);
                    })
                    .catch((cause: unknown) => {
                      setError(cause instanceof Error ? cause.message : "could not join");
                    });
                }}
              >
                Join as {color}
              </button>
            ))}
        </div>
      </main>
    );
  }

  if (state === undefined) {
    return (
      <main className="hud menu">
        <h1>Ploy</h1>
        <p>Linking the room…</p>
      </main>
    );
  }

  if (state === null) {
    return (
      <main className="hud menu">
        <p className="error">Room not found.</p>
        <button type="button" onClick={() => setJoinedCode(null)}>
          Back
        </button>
      </main>
    );
  }

  return (
    <div className="app">
      {snapshot ? (
        <PlayHud
          snapshot={snapshot}
          acting={acting}
          thinking={computer.thinking}
          computerStatus={computer.status}
          error={error}
          selectedMoves={interaction.selectedMoves}
          staging={interaction.staging}
          onCancelThink={computer.cancel}
          onRetryThink={computer.retry}
          onCancel={interaction.cancel}
        >
          <RoomChrome
            state={state}
            joinedCode={joinedCode}
            sessionId={sessionId}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            assignComputer={assignComputer}
            startGame={startGame}
            rematch={rematch}
            onLeave={leave}
            onError={setError}
          />
        </PlayHud>
      ) : (
        <aside className="hud">
          <RoomChrome
            state={state}
            joinedCode={joinedCode}
            sessionId={sessionId}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            assignComputer={assignComputer}
            startGame={startGame}
            rematch={rematch}
            onLeave={leave}
            onError={setError}
          />
          {error ? <p className="error">{error}</p> : null}
        </aside>
      )}
      <div className="board-wrap">
        {snapshot ? (
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
        ) : (
          <p className="waiting">Waiting for the host to start…</p>
        )}
      </div>
    </div>
  );
}

function RoomChrome(props: {
  state: RoomState;
  joinedCode: string;
  sessionId: string;
  difficulty: Difficulty;
  setDifficulty: (value: Difficulty) => void;
  assignComputer: (args: {
    code: string;
    hostSessionId: string;
    color: Color;
    difficulty: Difficulty;
  }) => Promise<unknown>;
  startGame: (args: { code: string; hostSessionId: string }) => Promise<unknown>;
  rematch: (args: { code: string; hostSessionId: string }) => Promise<unknown>;
  onLeave: () => void;
  onError: (message: string) => void;
}) {
  return (
    <>
      <button type="button" className="ghost" onClick={props.onLeave}>
        ← Leave
      </button>
      <h1>Room {props.state.room.code}</h1>
      <p className="lede">
        {props.state.room.mode} · {props.state.room.status}
        {props.state.isHost ? " · host" : ""}
      </p>
      <ul className="seats">
        {props.state.seats.map((seat) => (
          <li key={seat.color}>
            <strong>{seat.color}</strong>{" "}
            {seat.occupied
              ? `${seat.displayName}${seat.kind === "computer" ? " (computer)" : ""}`
              : seat.stale
                ? "stale — claimable"
                : "open"}
          </li>
        ))}
      </ul>
      {props.state.room.status === "lobby" && props.state.isHost ? (
        <div className="row">
          {props.state.room.mode === "twoPlayer" ? (
            <>
              <select
                value={props.difficulty}
                onChange={(event) => props.setDifficulty(event.target.value as Difficulty)}
              >
                <option value="cadet">Cadet</option>
                <option value="navigator">Navigator</option>
                <option value="commander">Commander</option>
                <option value="strategist">Strategist</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  void props
                    .assignComputer({
                      code: props.joinedCode,
                      hostSessionId: props.sessionId,
                      color: "coral",
                      difficulty: props.difficulty,
                    })
                    .catch((cause: unknown) =>
                      props.onError(cause instanceof Error ? cause.message : "computer seat failed"),
                    )
                }
              >
                Seat computer as Coral
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() =>
              void props
                .startGame({ code: props.joinedCode, hostSessionId: props.sessionId })
                .catch((cause: unknown) =>
                  props.onError(cause instanceof Error ? cause.message : "start failed"),
                )
            }
          >
            Start
          </button>
        </div>
      ) : null}
      {props.state.room.status === "finished" && props.state.isHost ? (
        <button
          type="button"
          onClick={() =>
            void props
              .rematch({ code: props.joinedCode, hostSessionId: props.sessionId })
              .catch((cause: unknown) =>
                props.onError(cause instanceof Error ? cause.message : "rematch failed"),
              )
          }
        >
          Rematch
        </button>
      ) : null}
    </>
  );
}
