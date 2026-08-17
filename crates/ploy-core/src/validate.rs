use std::collections::HashSet;

use crate::board::{colors_for_mode, pieces, split_square};
use crate::error::RulesError;
use crate::terminal::{derived_inactive, evaluate_winner, team_of};
use crate::types::{Color, Mode, Move, Snapshot, BOARD_SIZE};

pub fn validate_snapshot(snapshot: &Snapshot) -> Result<(), RulesError> {
    if snapshot.board.len() != BOARD_SIZE {
        return Err(RulesError::invalid_snapshot("board must have 9 ranks"));
    }
    let legal_colors: HashSet<Color> = colors_for_mode(snapshot.mode).iter().copied().collect();
    if !legal_colors.contains(&snapshot.turn_seat) {
        return Err(RulesError::invalid_snapshot(
            "turnSeat is not legal for this mode",
        ));
    }
    let mut ids = HashSet::new();
    for (rank, row) in snapshot.board.iter().enumerate() {
        if row.len() != BOARD_SIZE {
            return Err(RulesError::invalid_snapshot(format!(
                "rank {rank} must have 9 files"
            )));
        }
        for (file, cell) in row.iter().enumerate() {
            let Some(piece) = cell else {
                continue;
            };
            if piece.id().is_empty() || !ids.insert(piece.id().to_string()) {
                return Err(RulesError::invalid_snapshot(format!(
                    "piece id {} is empty or duplicated",
                    piece.id()
                )));
            }
            if !legal_colors.contains(&piece.color()) || !legal_colors.contains(&piece.controller())
            {
                return Err(RulesError::invalid_snapshot(format!(
                    "piece {} has a color illegal for {:?}",
                    piece.id(),
                    snapshot.mode
                )));
            }
            if piece.rot().get() > 7 {
                return Err(RulesError::invalid_snapshot(format!(
                    "piece {} has an invalid rotation",
                    piece.id()
                )));
            }
            if snapshot.mode != Mode::FourPlayerFfa && piece.controller() != piece.color() {
                return Err(RulesError::invalid_snapshot(format!(
                    "piece {} changed controller outside free-for-all",
                    piece.id()
                )));
            }
            let _ = (file, rank);
        }
    }
    let expected_inactive = derived_inactive(snapshot);
    let mut actual = snapshot.inactive_seats.clone();
    actual.sort();
    actual.dedup();
    let mut expected = expected_inactive;
    expected.sort();
    if actual != expected {
        return Err(RulesError::invalid_snapshot(
            "inactiveSeats do not match the board",
        ));
    }
    if snapshot.mode == Mode::Partnership {
        for (_, piece) in pieces(snapshot) {
            if team_of(piece.controller()) != team_of(piece.color()) {
                return Err(RulesError::invalid_snapshot(
                    "partnership never transfers a piece controller",
                ));
            }
        }
    }
    let expected_winner = evaluate_winner(snapshot);
    if snapshot.winner != expected_winner {
        return Err(RulesError::invalid_snapshot(
            "winner does not match the board",
        ));
    }
    Ok(())
}

pub fn validate_move(mv: &Move) -> Result<(), RulesError> {
    match *mv {
        Move::Motion {
            from,
            to,
            post_move_steps,
        } => {
            split_square(from)?;
            split_square(to)?;
            if from == to {
                return Err(RulesError::invalid_move("motion must change squares"));
            }
            if let Some(steps) = post_move_steps {
                if !(1..=7).contains(&steps) {
                    return Err(RulesError::invalid_move("postMoveSteps must be 1..=7"));
                }
            }
            Ok(())
        }
        Move::Rotate { at, steps } => {
            split_square(at)?;
            if !(1..=7).contains(&steps) {
                return Err(RulesError::invalid_move("rotation steps must be 1..=7"));
            }
            Ok(())
        }
    }
}
