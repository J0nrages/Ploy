use crate::apply::apply_move as apply_move_inner;
use crate::error::RulesError;
use crate::moves::{
    controller_for_turn as controller_inner, is_legal as is_legal_inner,
    legal_moves as legal_moves_inner,
};
use crate::setup::initial_snapshot;
use crate::terminal::same_side as same_side_inner;
use crate::types::{Color, Mode, Move, MoveReview, OpponentStyle, SearchResult, Snapshot};
use crate::validate::validate_snapshot;

pub const SPIKE_FROM: u8 = 22;
pub const SPIKE_TO: u8 = 31;

pub fn spike_move() -> Move {
    Move::Motion {
        from: SPIKE_FROM,
        to: SPIKE_TO,
        post_move_steps: None,
    }
}

pub fn spike_snapshot() -> Snapshot {
    create_game(Mode::TwoPlayer)
}

pub fn create_game(mode: Mode) -> Snapshot {
    initial_snapshot(mode)
}

pub fn controller_for_turn(snapshot: &Snapshot) -> Result<Option<Color>, RulesError> {
    validate_snapshot(snapshot)?;
    Ok(controller_inner(snapshot))
}

pub fn same_side(mode: Mode, a: Color, b: Color) -> bool {
    same_side_inner(mode, a, b)
}

pub fn legal_moves(snapshot: &Snapshot, color: Color) -> Result<Vec<Move>, RulesError> {
    legal_moves_inner(snapshot, color)
}

pub fn is_legal(snapshot: &Snapshot, mv: &Move, color: Color) -> Result<bool, RulesError> {
    is_legal_inner(snapshot, mv, color)
}

pub fn apply_move(snapshot: &Snapshot, mv: &Move, color: Color) -> Result<Snapshot, RulesError> {
    apply_move_inner(snapshot, mv, color)
}

pub fn choose_move(
    snapshot: &Snapshot,
    color: Color,
    max_depth: u32,
    max_nodes: u64,
    random_seed: u32,
) -> Result<SearchResult, RulesError> {
    crate::search::choose_move(snapshot, color, max_depth, max_nodes, random_seed)
}

#[allow(clippy::too_many_arguments)]
pub fn choose_move_with_profile(
    snapshot: &Snapshot,
    color: Color,
    max_depth: u32,
    max_nodes: u64,
    random_seed: u32,
    style: OpponentStyle,
    max_score_loss: i32,
) -> Result<SearchResult, RulesError> {
    crate::search::choose_move_with_profile(
        snapshot,
        color,
        max_depth,
        max_nodes,
        random_seed,
        style,
        max_score_loss,
    )
}

pub fn review_move(
    snapshot: &Snapshot,
    color: Color,
    played_move: &Move,
    max_depth: u32,
    max_nodes: u64,
    random_seed: u32,
) -> Result<MoveReview, RulesError> {
    crate::search::review_move(
        snapshot,
        color,
        played_move,
        max_depth,
        max_nodes,
        random_seed,
    )
}

pub fn stub_search_nodes(depth: u32) -> u64 {
    fn walk(remaining: u32) -> u64 {
        if remaining == 0 {
            return 1;
        }
        let mut nodes: u64 = 1;
        for _ in 0..8 {
            nodes = nodes.saturating_add(walk(remaining - 1));
        }
        nodes
    }
    walk(depth)
}

pub fn perft(snapshot: &Snapshot, depth: u32) -> Result<u64, RulesError> {
    if depth == 0 {
        return Ok(1);
    }
    let Some(color) = controller_inner(snapshot) else {
        return Ok(0);
    };
    let mut nodes = 0;
    for mv in legal_moves(snapshot, color)? {
        let next = apply_move(snapshot, &mv, color)?;
        nodes += perft(&next, depth - 1)?;
    }
    Ok(nodes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opening_shield_e3_e4_is_legal() {
        let start = create_game(Mode::TwoPlayer);
        assert!(is_legal(&start, &spike_move(), Color::Green).unwrap());
        let next = apply_move(&start, &spike_move(), Color::Green).unwrap();
        assert_eq!(next.ply, 1);
        assert_eq!(next.turn_seat, Color::Coral);
    }

    #[test]
    fn stub_search_is_deterministic() {
        assert_eq!(stub_search_nodes(2), stub_search_nodes(2));
        assert!(stub_search_nodes(3) > stub_search_nodes(2));
    }
}
