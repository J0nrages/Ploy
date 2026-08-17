use crate::board::{next_seat, original_commander_square, piece_at, pieces, set_piece};
use crate::catalog::with_controller;
use crate::catalog::with_rotation;
use crate::error::RulesError;
use crate::moves::require_legal;
use crate::terminal::{derived_inactive, evaluate_winner};
use crate::types::{Color, Mode, Move, Piece, Snapshot};

pub fn apply_move(snapshot: &Snapshot, mv: &Move, color: Color) -> Result<Snapshot, RulesError> {
    require_legal(snapshot, mv, color)?;
    Ok(apply_assumed_legal(snapshot, mv, color))
}

pub(crate) fn apply_assumed_legal(snapshot: &Snapshot, mv: &Move, color: Color) -> Snapshot {
    let mut next = snapshot.clone();
    match *mv {
        Move::Motion {
            from,
            to,
            post_move_steps,
        } => {
            let mut piece = piece_at(&next, from)
                .ok()
                .flatten()
                .cloned()
                .expect("legal motion has a piece");
            let captured = piece_at(&next, to).ok().flatten().cloned();
            let _ = set_piece(&mut next, from, None);
            if let Some(steps) = post_move_steps {
                piece = with_rotation(&piece, steps);
            }
            let _ = set_piece(&mut next, to, Some(piece));
            if let Some(victim) = captured {
                let _ = resolve_capture(&mut next, color, &victim);
            }
        }
        Move::Rotate { at, steps } => {
            let piece = piece_at(&next, at)
                .ok()
                .flatten()
                .cloned()
                .expect("legal rotation has a piece");
            let _ = set_piece(&mut next, at, Some(with_rotation(&piece, steps)));
        }
    }
    next.ply += 1;
    finish_position(&mut next);
    next.turn_seat = next_active_seat(&next);
    finish_position(&mut next);
    next
}

fn resolve_capture(
    snapshot: &mut Snapshot,
    capturer: Color,
    victim: &Piece,
) -> Result<(), RulesError> {
    if snapshot.mode != Mode::FourPlayerFfa {
        return Ok(());
    }
    if matches!(victim, Piece::Commander { .. }) {
        takeover(snapshot, victim.color(), capturer)?;
        return Ok(());
    }
    let loser = victim.controller();
    if !crate::board::has_controlled_lps(snapshot, loser) {
        if let Some(square) = original_commander_square(snapshot, loser) {
            set_piece(snapshot, square, None)?;
        }
    }
    Ok(())
}

fn takeover(snapshot: &mut Snapshot, defeated: Color, capturer: Color) -> Result<(), RulesError> {
    let squares: Vec<_> = pieces(snapshot)
        .filter(|(_, piece)| piece.controller() == defeated)
        .map(|(square, _)| square)
        .collect();
    for square in squares {
        let Some(piece) = piece_at(snapshot, square)?.cloned() else {
            continue;
        };
        set_piece(snapshot, square, Some(with_controller(&piece, capturer)))?;
    }
    Ok(())
}

fn finish_position(snapshot: &mut Snapshot) {
    snapshot.inactive_seats = derived_inactive(snapshot);
    snapshot.winner = evaluate_winner(snapshot);
}

fn next_active_seat(snapshot: &Snapshot) -> Color {
    let mut seat = next_seat(snapshot.mode, snapshot.turn_seat);
    if snapshot.mode != Mode::FourPlayerFfa {
        return seat;
    }
    for _ in 0..4 {
        if !snapshot.inactive_seats.contains(&seat) {
            return seat;
        }
        seat = next_seat(snapshot.mode, seat);
    }
    seat
}
