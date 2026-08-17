use crate::board::piece_at;
use crate::error::RulesError;
use crate::movegen::{compact_board, generate_moves};
use crate::types::{Color, Move, Snapshot};
use crate::validate::{validate_move, validate_snapshot};

pub fn controller_for_turn(snapshot: &Snapshot) -> Option<Color> {
    if snapshot.winner.is_some() {
        return None;
    }
    match snapshot.mode {
        crate::types::Mode::TwoPlayer => Some(snapshot.turn_seat),
        crate::types::Mode::FourPlayerFfa => {
            let mut seat = snapshot.turn_seat;
            for _ in 0..4 {
                if !snapshot.inactive_seats.contains(&seat) {
                    return Some(seat);
                }
                seat = crate::board::next_seat(snapshot.mode, seat);
            }
            None
        }
        crate::types::Mode::Partnership => {
            if crate::board::count_color(snapshot, snapshot.turn_seat) > 0 {
                Some(snapshot.turn_seat)
            } else {
                let partner = crate::terminal::partner_of(snapshot.turn_seat);
                (crate::board::count_color(snapshot, partner) > 0).then_some(partner)
            }
        }
    }
}

pub fn legal_moves(snapshot: &Snapshot, color: Color) -> Result<Vec<Move>, RulesError> {
    validate_snapshot(snapshot)?;
    Ok(legal_moves_generated(snapshot, color))
}

pub(crate) fn legal_moves_generated(snapshot: &Snapshot, color: Color) -> Vec<Move> {
    if controller_for_turn(snapshot) != Some(color) {
        return Vec::new();
    }
    generate_moves(&compact_board(snapshot), snapshot.mode, color)
}

pub fn is_legal(snapshot: &Snapshot, mv: &Move, color: Color) -> Result<bool, RulesError> {
    validate_snapshot(snapshot)?;
    if validate_move(mv).is_err() {
        return Ok(false);
    }
    Ok(legal_moves(snapshot, color)?
        .iter()
        .any(|legal| legal == mv))
}

pub fn require_legal(snapshot: &Snapshot, mv: &Move, color: Color) -> Result<(), RulesError> {
    validate_snapshot(snapshot)?;
    validate_move(mv)?;
    if snapshot.winner.is_some() {
        return Err(RulesError::game_over());
    }
    if controller_for_turn(snapshot) != Some(color) {
        return Err(RulesError::not_your_turn());
    }
    match mv {
        Move::Motion {
            from,
            post_move_steps,
            ..
        } => {
            let Some(piece) = piece_at(snapshot, *from)? else {
                return Err(RulesError::no_such_piece());
            };
            if piece.controller() != color {
                return Err(RulesError::wrong_controller());
            }
            if post_move_steps.is_some() && !piece.is_shield() {
                return Err(RulesError::invalid_move(
                    "only a Shield motion may include postMoveSteps",
                ));
            }
        }
        Move::Rotate { at, .. } => {
            let Some(piece) = piece_at(snapshot, *at)? else {
                return Err(RulesError::no_such_piece());
            };
            if piece.controller() != color {
                return Err(RulesError::wrong_controller());
            }
        }
    }
    if !is_legal(snapshot, mv, color)? {
        return Err(RulesError::invalid_move("move is not legal"));
    }
    Ok(())
}
