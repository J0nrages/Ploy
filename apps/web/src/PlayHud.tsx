import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Color, Move, Snapshot, Winner } from "@ploy/rules";
import { fileRank, pieceAt, type ShieldStaging } from "@ploy/ui-board";
import type { ComputerTurnStatus } from "./computerTurn";
import type { TimelineEntry } from "./moveTimeline";

function formatWinner(winner: NonNullable<Winner>): string {
  return winner.type === "color" ? colorName(winner.color) : winner.team;
}

function colorName(color: Color): string {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

function turnStatus(snapshot: Snapshot, acting: Color | null): string {
  if (snapshot.winner) {
    return `Winner: ${formatWinner(snapshot.winner)}`;
  }
  if (!acting) {
    return "Game complete";
  }
  if (snapshot.ply === 0 && acting === snapshot.turnSeat) {
    return `New game · ${colorName(acting)} moves first`;
  }
  if (acting !== snapshot.turnSeat) {
    return `Turn ${snapshot.ply + 1} · ${colorName(acting)} moves for ${colorName(snapshot.turnSeat)}’s turn`;
  }
  return `Turn ${snapshot.ply + 1} · ${colorName(acting)} to move`;
}

export function PlayHud(props: {
  snapshot: Snapshot;
  acting: Color | null;
  thinking: boolean;
  computerStatus: ComputerTurnStatus;
  error: string | null;
  selectedMoves: Move[];
  staging: ShieldStaging | null;
  canUndo?: boolean;
  onUndo?: () => void;
  onCancelThink?: () => void;
  onRetryThink?: () => void;
  onCancel: () => void;
  timeline?: TimelineEntry[];
  children?: ReactNode;
}) {
  const selectedSquare =
    props.selectedMoves[0]?.type === "motion"
      ? props.selectedMoves[0].from
      : props.selectedMoves[0]?.type === "rotate"
        ? props.selectedMoves[0].at
        : null;
  const selectedPiece =
    selectedSquare === null ? null : pieceAt(props.snapshot, selectedSquare);
  const hasMotion = props.selectedMoves.some((move) => move.type === "motion");
  const hasRotation = props.selectedMoves.some((move) => move.type === "rotate");
  const timeline = props.timeline ?? [];
  const [historyOpen, setHistoryOpen] = useState(false);
  const timelineRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (props.snapshot.ply === 0) {
      setHistoryOpen(false);
    }
  }, [props.snapshot.ply]);

  useEffect(() => {
    const node = timelineRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [historyOpen, timeline.length]);

  const statusLabel = turnStatus(props.snapshot, props.acting);

  return (
    <aside className={historyOpen ? "hud is-history-open" : "hud"}>
      <div className="hud-chrome">
        {props.children}
        {props.computerStatus === "thinking" ? (
          <p className="thinking">
            Computer is thinking…
            {props.onCancelThink ? (
              <button type="button" onClick={props.onCancelThink}>
                Cancel
              </button>
            ) : null}
          </p>
        ) : null}
        {props.computerStatus === "submitting" ? (
          <p className="thinking">Computer move found. Confirming the turn…</p>
        ) : null}
        {props.computerStatus === "cancelled" || props.computerStatus === "failed" ? (
          <p className="thinking">
            {props.computerStatus === "cancelled"
              ? "Computer move paused."
              : "Computer move needs attention."}
            {props.onRetryThink ? (
              <button type="button" onClick={props.onRetryThink}>
                Resume
              </button>
            ) : null}
          </p>
        ) : null}
        {props.error ? <p className="error">{props.error}</p> : null}
        {props.staging ? (
          <p className="hint">
            <strong>Shield move selected at {fileRank(props.staging.to)}.</strong> Hover a nearby
            point to preview facing, then click it or a tray rotation to finish this turn.
          </p>
        ) : selectedPiece && hasMotion && hasRotation ? (
          <p className="hint">
            {selectedPiece.kind === "shield"
              ? "Shield: move and optionally rotate as one turn, or rotate here without moving."
              : "Hover a point to preview it, then move to a gold point or rotate this piece in place."}
          </p>
        ) : selectedPiece ? (
          <p className="hint">Move and rotation choices are in the tray above or below the board.</p>
        ) : null}
      </div>
      {timeline.length > 0 ? (
        <ol
          ref={timelineRef}
          id="move-timeline"
          className="move-timeline"
          aria-label="Game timeline"
          aria-hidden={!historyOpen}
        >
          {timeline.map((entry) => (
            <li
              key={entry.id}
              className={
                entry.color ? `move-event move-${entry.color}` : "move-event move-profile"
              }
            >
              <span className="move-ply">{entry.ply}</span>
              {entry.color ? (
                <span className={`color-dot ${entry.color}`} aria-hidden="true" />
              ) : (
                <span className="profile-dot" aria-hidden="true">AI</span>
              )}
              <span className="move-copy">{entry.summary}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {timeline.length > 0 ? (
        <button
          type="button"
          className="status"
          aria-expanded={historyOpen}
          aria-controls="move-timeline"
          onClick={() => setHistoryOpen((open) => !open)}
        >
          {statusLabel}
        </button>
      ) : (
        <p className="status" role="status">
          {statusLabel}
        </p>
      )}
      <div className="hud-footer">
        {props.staging ? (
          <button type="button" onClick={props.onCancel}>
            Cancel move
          </button>
        ) : null}
        {props.canUndo && props.onUndo ? (
          <button type="button" onClick={props.onUndo}>
            Undo
          </button>
        ) : null}
      </div>
    </aside>
  );
}
