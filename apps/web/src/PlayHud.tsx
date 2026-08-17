import type { ReactNode } from "react";
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

  return (
    <aside className="hud">
      <div className="hud-chrome">
        {props.children}
        <p className="status" role="status">{turnStatus(props.snapshot, props.acting)}</p>
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
        <div className="turn-actions">
          <p>
            <strong>Shield move selected at {fileRank(props.staging.to)}.</strong> Finish this same
            turn by keeping its facing or rotating it.
          </p>
          <div className="row">
            <button type="button" onClick={props.onCancel}>
              Cancel move
            </button>
          </div>
          <p className="hint">Use the orientation tray above or below the board to finish the move.</p>
        </div>
      ) : (
        <div className="turn-actions">
          {selectedPiece && hasMotion && hasRotation ? (
            <p>
              {selectedPiece.kind === "shield" ? (
                <>
                  <strong>Shield:</strong> move and optionally rotate as one turn, or rotate here
                  without moving.
                </>
              ) : (
                <>
                  <strong>Choose one action:</strong> move to a gold point <strong>OR</strong>{" "}
                  rotate this piece in place.
                </>
              )}
            </p>
          ) : null}
          <div className="row">
            {props.canUndo && props.onUndo ? (
              <button type="button" onClick={props.onUndo}>
                Undo
              </button>
            ) : null}
          </div>
          {selectedPiece ? (
            <p className="hint">Move and rotation choices are in the tray above or below the board.</p>
          ) : null}
        </div>
      )}
      </div>
      {timeline.length > 0 ? (
        <ol className="move-timeline" aria-label="Completed moves">
          {timeline.map((entry) => (
            <li key={entry.ply} className={`move-event move-${entry.color}`}>
              <span className="move-ply">{entry.ply}</span>
              <span className={`color-dot ${entry.color}`} aria-hidden="true" />
              <span className="move-copy">{entry.summary}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </aside>
  );
}
