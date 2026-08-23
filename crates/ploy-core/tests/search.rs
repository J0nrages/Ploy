use ploy_core::board::square_of;
use ploy_core::terminal::{derived_inactive, evaluate_winner};
use ploy_core::types::{Color, Mode, Move, Piece, Rotation, SearchFallback, Snapshot, Variant};
use ploy_core::{apply_move, choose_move, choose_move_with_profile, create_game, is_legal};

fn seal(mut snapshot: Snapshot) -> Snapshot {
    snapshot.inactive_seats = derived_inactive(&snapshot);
    snapshot.winner = evaluate_winner(&snapshot);
    snapshot
}

fn commander(id: &str, color: Color, rot: u8) -> Piece {
    Piece::Commander {
        id: id.into(),
        color,
        controller: color,
        rot: Rotation::from_checked(rot),
    }
}

fn shield(id: &str, color: Color, rot: u8) -> Piece {
    Piece::Shield {
        id: id.into(),
        color,
        controller: color,
        rot: Rotation::from_checked(rot),
    }
}

fn lance(id: &str, color: Color, rot: u8) -> Piece {
    Piece::Lance {
        id: id.into(),
        color,
        controller: color,
        variant: Variant::Heavy,
        rot: Rotation::from_checked(rot),
    }
}

fn place(snapshot: &mut Snapshot, rank: usize, file: usize, piece: Piece) {
    snapshot.board[rank][file] = Some(piece);
}

#[test]
fn choose_move_is_legal_and_immutable() {
    let start = create_game(Mode::TwoPlayer);
    let before = serde_json::to_string(&start).unwrap();
    let result = choose_move(&start, Color::Green, 2, 2_000, 7).unwrap();
    assert!(is_legal(&start, &result.mv, Color::Green).unwrap());
    assert_eq!(serde_json::to_string(&start).unwrap(), before);
    assert!(result.nodes <= 2_000);
}

#[test]
fn choose_move_is_deterministic_for_a_seed() {
    let start = create_game(Mode::TwoPlayer);
    let a = choose_move(&start, Color::Green, 2, 1_500, 99).unwrap();
    let b = choose_move(&start, Color::Green, 2, 1_500, 99).unwrap();
    assert_eq!(a.mv, b.mv);
    assert_eq!(a.score, b.score);
}

#[test]
fn interrupted_deeper_iteration_keeps_the_completed_result() {
    let start = create_game(Mode::TwoPlayer);
    let result = choose_move(&start, Color::Green, 3, 500, 2).unwrap();
    assert_eq!(result.depth, 1);
    assert_eq!(result.fallback, SearchFallback::None);
    assert_eq!(result.nodes, 500);
    assert_eq!(result.principal_variation.first(), Some(&result.mv));
}

#[test]
fn cadet_chooses_a_scored_candidate_within_its_error_limit() {
    let start = create_game(Mode::TwoPlayer);
    let result = choose_move_with_profile(
        &start,
        Color::Green,
        1,
        250,
        1,
        ploy_core::OpponentStyle::Balanced,
        160,
    )
    .unwrap();
    assert!(is_legal(&start, &result.mv, Color::Green).unwrap());
    assert!(result.score_loss <= 160);
    assert_eq!(result.best_score - result.score, result.score_loss);
}

#[test]
fn cadet_capture_bias_preserves_a_shield_motion_rotation_combo() {
    let mut snapshot = Snapshot::empty(Mode::TwoPlayer);
    place(
        &mut snapshot,
        0,
        0,
        commander("green:commander", Color::Green, 0),
    );
    place(
        &mut snapshot,
        4,
        4,
        shield("green:shield1", Color::Green, 0),
    );
    place(
        &mut snapshot,
        5,
        4,
        shield("coral:shield1", Color::Coral, 4),
    );
    place(
        &mut snapshot,
        8,
        0,
        shield("coral:shield2", Color::Coral, 4),
    );
    place(
        &mut snapshot,
        8,
        8,
        commander("coral:commander", Color::Coral, 0),
    );
    let snapshot = seal(snapshot);
    let result = choose_move(&snapshot, Color::Green, 1, 250, 1).unwrap();
    assert!(matches!(
        result.mv,
        Move::Motion {
            from,
            to,
            post_move_steps: Some(_),
        } if from == square_of(4, 4).unwrap() && to == square_of(5, 4).unwrap()
    ));
    assert!(is_legal(&snapshot, &result.mv, Color::Green).unwrap());
}

#[test]
fn uses_a_rotation_to_create_an_immediate_commander_threat() {
    let mut snapshot = Snapshot::empty(Mode::TwoPlayer);
    place(
        &mut snapshot,
        0,
        0,
        commander("green:commander", Color::Green, 0),
    );
    place(&mut snapshot, 3, 4, lance("green:lanceH1", Color::Green, 2));
    place(
        &mut snapshot,
        4,
        4,
        commander("coral:commander", Color::Coral, 1),
    );
    place(
        &mut snapshot,
        3,
        3,
        shield("coral:shield1", Color::Coral, 4),
    );
    place(
        &mut snapshot,
        3,
        5,
        shield("coral:shield2", Color::Coral, 4),
    );
    place(
        &mut snapshot,
        5,
        3,
        shield("coral:shield3", Color::Coral, 4),
    );
    place(
        &mut snapshot,
        5,
        5,
        shield("coral:shield4", Color::Coral, 4),
    );
    let snapshot = seal(snapshot);
    let result = choose_move(&snapshot, Color::Green, 3, 100_000, 17).unwrap();
    assert!(matches!(
        result.mv,
        Move::Rotate { at, .. } if at == square_of(3, 4).unwrap()
    ));
    let threatened = apply_move(&snapshot, &result.mv, Color::Green).unwrap();
    let lancer = threatened.board[3][4].as_ref().unwrap();
    assert_ne!(ploy_core::catalog::effective_flags(lancer) & 0x01, 0);
}

#[test]
fn captures_commander_in_one() {
    let mut snapshot = Snapshot::empty(Mode::TwoPlayer);
    place(
        &mut snapshot,
        4,
        4,
        commander("green:commander", Color::Green, 0),
    );
    place(
        &mut snapshot,
        0,
        0,
        shield("green:shield1", Color::Green, 0),
    );
    place(
        &mut snapshot,
        5,
        4,
        commander("coral:commander", Color::Coral, 0),
    );
    place(
        &mut snapshot,
        8,
        0,
        shield("coral:shield1", Color::Coral, 0),
    );
    let snapshot = seal(snapshot);
    let result = choose_move(&snapshot, Color::Green, 2, 4_000, 1).unwrap();
    assert_eq!(
        result.mv,
        Move::Motion {
            from: square_of(4, 4).unwrap(),
            to: square_of(5, 4).unwrap(),
            post_move_steps: None,
        }
    );
    for style in [
        ploy_core::OpponentStyle::Balanced,
        ploy_core::OpponentStyle::Aggressor,
        ploy_core::OpponentStyle::Guardian,
        ploy_core::OpponentStyle::Maneuverer,
        ploy_core::OpponentStyle::Trickster,
    ] {
        let styled =
            choose_move_with_profile(&snapshot, Color::Green, 1, 250, 9, style, 160).unwrap();
        assert_eq!(styled.mv, result.mv, "{style:?} ignored the forced win");
    }
}

#[test]
fn exhausted_first_iteration_keeps_a_scored_winning_fallback() {
    let mut snapshot = Snapshot::empty(Mode::TwoPlayer);
    place(
        &mut snapshot,
        4,
        4,
        commander("green:commander", Color::Green, 0),
    );
    place(
        &mut snapshot,
        0,
        0,
        shield("green:shield1", Color::Green, 0),
    );
    place(
        &mut snapshot,
        5,
        4,
        commander("coral:commander", Color::Coral, 0),
    );
    place(
        &mut snapshot,
        8,
        0,
        shield("coral:shield1", Color::Coral, 0),
    );
    let snapshot = seal(snapshot);
    let result = choose_move(&snapshot, Color::Green, 2, 1, 1).unwrap();
    assert_eq!(result.depth, 0);
    assert_eq!(result.fallback, SearchFallback::Static);
    assert_eq!(result.score_loss, 0);
    assert_eq!(result.principal_variation, vec![result.mv.clone()]);
    assert_eq!(
        result.mv,
        Move::Motion {
            from: square_of(4, 4).unwrap(),
            to: square_of(5, 4).unwrap(),
            post_move_steps: None,
        }
    );
}

#[test]
fn prefers_final_lps_win() {
    let mut snapshot = Snapshot::empty(Mode::TwoPlayer);
    place(
        &mut snapshot,
        4,
        4,
        commander("green:commander", Color::Green, 0),
    );
    place(
        &mut snapshot,
        5,
        4,
        shield("coral:shield1", Color::Coral, 0),
    );
    place(
        &mut snapshot,
        8,
        8,
        commander("coral:commander", Color::Coral, 0),
    );
    place(
        &mut snapshot,
        0,
        0,
        shield("green:shield1", Color::Green, 0),
    );
    let snapshot = seal(snapshot);
    let result = choose_move(&snapshot, Color::Green, 2, 4_000, 1).unwrap();
    let next = apply_move(&snapshot, &result.mv, Color::Green).unwrap();
    assert!(next.winner.is_some());
}

#[test]
fn avoids_mate_in_one_when_savable() {
    let mut snapshot = Snapshot::empty(Mode::TwoPlayer);
    place(
        &mut snapshot,
        4,
        4,
        commander("green:commander", Color::Green, 0),
    );
    place(
        &mut snapshot,
        4,
        5,
        shield("green:shield1", Color::Green, 6),
    );
    place(
        &mut snapshot,
        5,
        4,
        shield("coral:shield1", Color::Coral, 4),
    );
    place(
        &mut snapshot,
        8,
        8,
        commander("coral:commander", Color::Coral, 0),
    );
    place(
        &mut snapshot,
        8,
        0,
        shield("coral:shield2", Color::Coral, 0),
    );
    let snapshot = seal(snapshot);
    let result = choose_move(&snapshot, Color::Green, 3, 8_000, 2).unwrap();
    let next = apply_move(&snapshot, &result.mv, Color::Green).unwrap();
    assert!(next.winner.is_none());
    assert!(ploy_core::board::has_original_commander(
        &next,
        Color::Green
    ));
}

#[test]
fn rejects_non_two_player() {
    let start = create_game(Mode::Partnership);
    let error = choose_move(&start, Color::Green, 1, 100, 1).unwrap_err();
    assert_eq!(error.code, "unsupportedMode");
}

#[test]
fn two_bots_play_without_throwing() {
    let mut snapshot = create_game(Mode::TwoPlayer);
    for _ in 0..80 {
        if snapshot.winner.is_some() {
            break;
        }
        let color = snapshot.turn_seat;
        let result = choose_move(&snapshot, color, 1, 400, 3).unwrap();
        snapshot = apply_move(&snapshot, &result.mv, color).unwrap();
    }
}
