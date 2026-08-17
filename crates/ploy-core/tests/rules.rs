use ploy_core::board::{piece_at, pieces, square_of};
use ploy_core::catalog::{base_flags, canonical_rotation_steps, effective_flags, popcount, range};
use ploy_core::setup::{fen_like_rows, initial_snapshot, setup_rows};
use ploy_core::terminal::{derived_inactive, evaluate_winner, partner_of, strictly_defeated};
use ploy_core::types::{Color, Mode, Move, Piece, Rotation, Snapshot, Variant, WinnerKind};
use ploy_core::validate::validate_snapshot;
use ploy_core::{
    apply_move, controller_for_turn, create_game, is_legal, legal_moves, perft, same_side,
    spike_move,
};

fn seal(mut snapshot: Snapshot) -> Snapshot {
    snapshot.inactive_seats = derived_inactive(&snapshot);
    snapshot.winner = evaluate_winner(&snapshot);
    snapshot
}

fn find_id(snapshot: &Snapshot, id: &str) -> u8 {
    pieces(snapshot)
        .find(|(_, piece)| piece.id() == id)
        .map(|(square, _)| square)
        .unwrap_or_else(|| panic!("missing {id}"))
}

fn place(snapshot: &mut Snapshot, rank: usize, file: usize, piece: Piece) {
    snapshot.board[rank][file] = Some(piece);
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

fn lance(id: &str, color: Color, variant: Variant, rot: u8) -> Piece {
    Piece::Lance {
        id: id.into(),
        color,
        controller: color,
        variant,
        rot: Rotation::from_checked(rot),
    }
}

#[test]
fn setup_rows_match_contract_tokens() {
    for mode in [Mode::TwoPlayer, Mode::Partnership, Mode::FourPlayerFfa] {
        let snapshot = initial_snapshot(mode);
        let rendered = fen_like_rows(&snapshot);
        for (rank, expected) in setup_rows(mode).iter().rev().enumerate() {
            let compact_expected: Vec<&str> = expected.split_whitespace().collect();
            let compact_actual: Vec<&str> = rendered[rank].split_whitespace().collect();
            assert_eq!(
                compact_actual,
                compact_expected,
                "{mode:?} display rank {}",
                9 - rank
            );
        }
        validate_snapshot(&snapshot).unwrap();
    }
}

#[test]
fn commander_range_is_one_and_cannot_jump() {
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
        shield("coral:shield1", Color::Coral, 0),
    );
    place(
        &mut snapshot,
        8,
        8,
        commander("coral:commander", Color::Coral, 0),
    );
    let snapshot = seal(snapshot);
    let from = square_of(4, 4).unwrap();
    let jumps = Move::Motion {
        from,
        to: square_of(6, 4).unwrap(),
        post_move_steps: None,
    };
    assert!(!is_legal(&snapshot, &jumps, Color::Green).unwrap());
    let capture = Move::Motion {
        from,
        to: square_of(5, 4).unwrap(),
        post_move_steps: None,
    };
    assert!(is_legal(&snapshot, &capture, Color::Green).unwrap());
}

#[test]
fn friendly_and_partner_pieces_block() {
    let mut two = Snapshot::empty(Mode::TwoPlayer);
    place(&mut two, 2, 2, shield("green:shield1", Color::Green, 0));
    place(&mut two, 3, 2, shield("green:shield2", Color::Green, 0));
    let two = seal(two);
    let blocked = Move::Motion {
        from: square_of(2, 2).unwrap(),
        to: square_of(3, 2).unwrap(),
        post_move_steps: None,
    };
    assert!(!is_legal(&two, &blocked, Color::Green).unwrap());

    let mut partnership = Snapshot::empty(Mode::Partnership);
    place(
        &mut partnership,
        2,
        2,
        shield("green:shield1", Color::Green, 0),
    );
    place(
        &mut partnership,
        3,
        2,
        shield("yellow:shield1", Color::Yellow, 0),
    );
    let partnership = seal(partnership);
    assert!(!is_legal(&partnership, &blocked, Color::Green).unwrap());
}

#[test]
fn canonical_rotation_dedupes_symmetric_shapes() {
    let commander = commander("green:commander", Color::Green, 0);
    assert_eq!(canonical_rotation_steps(&commander), vec![1]);
    let probe = Piece::Probe {
        id: "green:probeL1".into(),
        color: Color::Green,
        controller: Color::Green,
        variant: Variant::Light,
        rot: Rotation::from_checked(0),
    };
    assert_eq!(canonical_rotation_steps(&probe), vec![1, 2, 3]);
    let shield = shield("green:shield1", Color::Green, 0);
    assert_eq!(canonical_rotation_steps(&shield).len(), 7);
}

#[test]
fn shield_combo_increments_one_ply_and_non_shields_reject_it() {
    let start = create_game(Mode::TwoPlayer);
    let from = find_id(&start, "green:shield2");
    let to = from + 9;
    let combo = Move::Motion {
        from,
        to,
        post_move_steps: Some(1),
    };
    let next = apply_move(&start, &combo, Color::Green).unwrap();
    assert_eq!(next.ply, start.ply + 1);
    assert_eq!(piece_at(&next, to).unwrap().unwrap().rot().get(), 1);

    let commander_from = find_id(&start, "green:commander");
    let illegal = Move::Motion {
        from: commander_from,
        to: commander_from + 10,
        post_move_steps: Some(1),
    };
    assert!(apply_move(&start, &illegal, Color::Green).is_err());
}

#[test]
fn two_player_strict_defeat_and_post_game_rejection() {
    let mut snapshot = Snapshot::empty(Mode::TwoPlayer);
    place(
        &mut snapshot,
        4,
        4,
        commander("green:commander", Color::Green, 1),
    );
    place(
        &mut snapshot,
        4,
        3,
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
        4,
        commander("coral:commander", Color::Coral, 1),
    );
    snapshot.turn_seat = Color::Coral;
    let snapshot = seal(snapshot);
    let capture = Move::Motion {
        from: square_of(5, 4).unwrap(),
        to: square_of(4, 4).unwrap(),
        post_move_steps: None,
    };
    let next = apply_move(&snapshot, &capture, Color::Coral).unwrap();
    assert_eq!(
        next.winner,
        Some(WinnerKind::Color {
            color: Color::Coral
        })
    );
    assert!(apply_move(&next, &spike_move(), Color::Green).is_err());
}

#[test]
fn ffa_commander_capture_is_transitive() {
    let mut snapshot = Snapshot::empty(Mode::FourPlayerFfa);
    place(
        &mut snapshot,
        0,
        0,
        commander("green:commander", Color::Green, 0),
    );
    place(
        &mut snapshot,
        0,
        1,
        shield("green:shield1", Color::Green, 2),
    );
    place(
        &mut snapshot,
        0,
        2,
        commander("yellow:commander", Color::Yellow, 4),
    );
    snapshot.board[1][2] = Some(Piece::Shield {
        id: "blue:shield1".into(),
        color: Color::Blue,
        controller: Color::Yellow,
        rot: Rotation::from_checked(0),
    });
    place(
        &mut snapshot,
        2,
        2,
        shield("yellow:shield1", Color::Yellow, 0),
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
        7,
        shield("coral:shield1", Color::Coral, 0),
    );
    place(
        &mut snapshot,
        0,
        8,
        commander("blue:commander", Color::Blue, 0),
    );
    place(&mut snapshot, 1, 8, shield("blue:shield2", Color::Blue, 0));
    let snapshot = seal(snapshot);
    let capture = Move::Motion {
        from: square_of(0, 1).unwrap(),
        to: square_of(0, 2).unwrap(),
        post_move_steps: None,
    };
    let next = apply_move(&snapshot, &capture, Color::Green).unwrap();
    assert!(next.inactive_seats.contains(&Color::Yellow));
    let taken = pieces(&next)
        .filter(|(_, piece)| piece.color() == Color::Yellow || piece.id() == "blue:shield1")
        .all(|(_, piece)| piece.controller() == Color::Green);
    assert!(taken);
    assert!(pieces(&next).all(|(_, piece)| piece.color() == piece.color()));
}

#[test]
fn ffa_bare_commander_is_removed() {
    let mut snapshot = Snapshot::empty(Mode::FourPlayerFfa);
    place(
        &mut snapshot,
        0,
        0,
        commander("green:commander", Color::Green, 0),
    );
    place(
        &mut snapshot,
        0,
        1,
        shield("green:shield1", Color::Green, 2),
    );
    place(
        &mut snapshot,
        0,
        2,
        shield("yellow:shield1", Color::Yellow, 6),
    );
    place(
        &mut snapshot,
        1,
        2,
        commander("yellow:commander", Color::Yellow, 0),
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
        7,
        shield("coral:shield1", Color::Coral, 0),
    );
    place(
        &mut snapshot,
        0,
        8,
        commander("blue:commander", Color::Blue, 0),
    );
    place(&mut snapshot, 1, 8, shield("blue:shield2", Color::Blue, 0));
    let snapshot = seal(snapshot);
    let capture = Move::Motion {
        from: square_of(0, 1).unwrap(),
        to: square_of(0, 2).unwrap(),
        post_move_steps: None,
    };
    let next = apply_move(&snapshot, &capture, Color::Green).unwrap();
    assert!(pieces(&next).all(|(_, piece)| piece.color() != Color::Yellow));
    assert!(next.inactive_seats.contains(&Color::Yellow));
}

#[test]
fn partnership_mixed_win_and_continuation() {
    let mut snapshot = Snapshot::empty(Mode::Partnership);
    place(
        &mut snapshot,
        0,
        0,
        commander("green:commander", Color::Green, 0),
    );
    place(
        &mut snapshot,
        0,
        1,
        shield("green:shield1", Color::Green, 2),
    );
    place(
        &mut snapshot,
        0,
        4,
        commander("yellow:commander", Color::Yellow, 0),
    );
    place(
        &mut snapshot,
        0,
        5,
        shield("yellow:shield1", Color::Yellow, 0),
    );
    place(
        &mut snapshot,
        8,
        0,
        commander("coral:commander", Color::Coral, 0),
    );
    place(
        &mut snapshot,
        8,
        1,
        shield("coral:shield1", Color::Coral, 0),
    );
    // Blue is commanderless but still has a shield.
    place(&mut snapshot, 7, 8, shield("blue:shield1", Color::Blue, 4));
    snapshot.turn_seat = Color::Blue;
    let snapshot = seal(snapshot);
    assert!(strictly_defeated(&snapshot, Color::Blue));
    assert_eq!(controller_for_turn(&snapshot).unwrap(), Some(Color::Blue));
    assert!(snapshot.winner.is_none());

    let mut empty_green = snapshot.clone();
    empty_green.board[0][0] = None;
    empty_green.board[0][1] = None;
    empty_green.turn_seat = Color::Green;
    let empty_green = seal(empty_green);
    assert_eq!(
        controller_for_turn(&empty_green).unwrap(),
        Some(Color::Yellow)
    );
    assert!(pieces(&empty_green).all(|(_, piece)| piece.controller() == piece.color()));
}

#[test]
fn partnership_required_controller_sequence() {
    let mut snapshot = Snapshot::empty(Mode::Partnership);
    place(
        &mut snapshot,
        0,
        4,
        commander("yellow:commander", Color::Yellow, 0),
    );
    place(
        &mut snapshot,
        0,
        5,
        shield("yellow:shield1", Color::Yellow, 0),
    );
    place(
        &mut snapshot,
        8,
        0,
        commander("coral:commander", Color::Coral, 0),
    );
    place(
        &mut snapshot,
        8,
        1,
        shield("coral:shield1", Color::Coral, 0),
    );
    place(
        &mut snapshot,
        8,
        8,
        commander("blue:commander", Color::Blue, 0),
    );
    place(&mut snapshot, 7, 8, shield("blue:shield1", Color::Blue, 0));
    snapshot.turn_seat = Color::Green;
    let snapshot = seal(snapshot);
    assert_eq!(controller_for_turn(&snapshot).unwrap(), Some(Color::Yellow));
    let mut seat = Color::Green;
    let mut controllers = Vec::new();
    for _ in 0..4 {
        let mut probe = snapshot.clone();
        probe.turn_seat = seat;
        probe = seal(probe);
        controllers.push(controller_for_turn(&probe).unwrap());
        seat = match seat {
            Color::Green => Color::Coral,
            Color::Coral => Color::Yellow,
            Color::Yellow => Color::Blue,
            Color::Blue => Color::Green,
        };
    }
    assert_eq!(
        controllers,
        [
            Some(Color::Yellow),
            Some(Color::Coral),
            Some(Color::Yellow),
            Some(Color::Blue)
        ]
    );
}

#[test]
fn property_legal_move_increments_once_and_illegal_is_immutable() {
    let start = create_game(Mode::TwoPlayer);
    let before = serde_json::to_string(&start).unwrap();
    let moves = legal_moves(&start, Color::Green).unwrap();
    assert!(!moves.is_empty());
    for mv in &moves {
        let next = apply_move(&start, mv, Color::Green).unwrap();
        assert_eq!(next.ply, start.ply + 1);
        validate_snapshot(&next).unwrap();
    }
    let illegal = Move::Rotate { at: 0, steps: 1 };
    assert!(apply_move(&start, &illegal, Color::Green).is_err());
    assert_eq!(serde_json::to_string(&start).unwrap(), before);
    assert!(legal_moves(&start, Color::Coral).unwrap().is_empty());
}

#[test]
fn property_unique_ids_and_bounds() {
    for mode in [Mode::TwoPlayer, Mode::FourPlayerFfa, Mode::Partnership] {
        let snapshot = create_game(mode);
        let mut ids = Vec::new();
        for (square, piece) in pieces(&snapshot) {
            assert!(square <= 80);
            ids.push(piece.id().to_string());
        }
        let mut dedup = ids.clone();
        dedup.sort();
        dedup.dedup();
        assert_eq!(ids.len(), dedup.len());
    }
}

#[test]
fn partnership_never_changes_controller() {
    let start = create_game(Mode::Partnership);
    let color = controller_for_turn(&start).unwrap().unwrap();
    for mv in legal_moves(&start, color).unwrap() {
        let next = apply_move(&start, &mv, color).unwrap();
        assert!(pieces(&next).all(|(_, piece)| piece.controller() == piece.color()));
    }
}

#[test]
fn perft_initial_two_player_d1_139_d2_19321() {
    let start = create_game(Mode::TwoPlayer);
    assert_eq!(perft(&start, 1).unwrap(), 139);
    assert_eq!(perft(&start, 2).unwrap(), 19_321);
}

#[test]
fn perft_ffa_and_partnership_openings() {
    let ffa = create_game(Mode::FourPlayerFfa);
    let partnership = create_game(Mode::Partnership);
    assert_eq!(perft(&ffa, 1).unwrap(), 81);
    assert_eq!(perft(&partnership, 1).unwrap(), 83);
}

#[test]
fn same_side_partnership_and_ffa() {
    assert!(same_side(Mode::Partnership, Color::Green, Color::Yellow));
    assert!(!same_side(Mode::FourPlayerFfa, Color::Green, Color::Yellow));
    assert!(same_side(Mode::TwoPlayer, Color::Green, Color::Green));
}

#[test]
fn catalog_masks_are_stable() {
    let lance = lance("green:lanceH1", Color::Green, Variant::Heavy, 0);
    assert_eq!(popcount(base_flags(&lance)), 3);
    assert_eq!(range(&lance), 3);
    assert_ne!(effective_flags(&lance), 0);
}

#[test]
fn partner_of_is_symmetric() {
    assert_eq!(partner_of(Color::Green), Color::Yellow);
    assert_eq!(partner_of(Color::Yellow), Color::Green);
}

#[test]
fn partnership_mixed_win_one_commander_plus_partner_lps() {
    let mut snapshot = Snapshot::empty(Mode::Partnership);
    place(
        &mut snapshot,
        4,
        4,
        shield("green:shield1", Color::Green, 0),
    );
    place(
        &mut snapshot,
        4,
        3,
        commander("green:commander", Color::Green, 2),
    );
    place(
        &mut snapshot,
        5,
        4,
        commander("coral:commander", Color::Coral, 4),
    );
    place(
        &mut snapshot,
        5,
        0,
        shield("coral:shield1", Color::Coral, 0),
    );
    place(
        &mut snapshot,
        0,
        8,
        commander("yellow:commander", Color::Yellow, 0),
    );
    place(
        &mut snapshot,
        1,
        8,
        shield("yellow:shield1", Color::Yellow, 0),
    );
    place(
        &mut snapshot,
        8,
        8,
        commander("blue:commander", Color::Blue, 0),
    );
    let snapshot = seal(snapshot);
    assert!(strictly_defeated(&snapshot, Color::Blue));
    assert!(!strictly_defeated(&snapshot, Color::Coral));
    let capture = Move::Motion {
        from: square_of(4, 4).unwrap(),
        to: square_of(5, 4).unwrap(),
        post_move_steps: None,
    };
    let next = apply_move(&snapshot, &capture, Color::Green).unwrap();
    assert_eq!(
        next.winner,
        Some(ploy_core::types::WinnerKind::Team {
            team: ploy_core::types::Team::GreenYellow
        })
    );
}

#[test]
fn ffa_skips_inactive_and_last_active_wins() {
    let mut snapshot = Snapshot::empty(Mode::FourPlayerFfa);
    place(
        &mut snapshot,
        0,
        0,
        commander("green:commander", Color::Green, 0),
    );
    place(
        &mut snapshot,
        0,
        1,
        shield("green:shield1", Color::Green, 2),
    );
    place(
        &mut snapshot,
        0,
        2,
        commander("coral:commander", Color::Coral, 6),
    );
    place(
        &mut snapshot,
        3,
        0,
        shield("coral:shield1", Color::Coral, 0),
    );
    place(
        &mut snapshot,
        8,
        0,
        commander("yellow:commander", Color::Yellow, 0),
    );
    place(
        &mut snapshot,
        8,
        1,
        shield("yellow:shield1", Color::Yellow, 0),
    );
    snapshot.inactive_seats = vec![Color::Blue];
    snapshot.turn_seat = Color::Green;
    let snapshot = seal(snapshot);
    let capture = Move::Motion {
        from: square_of(0, 1).unwrap(),
        to: square_of(0, 2).unwrap(),
        post_move_steps: None,
    };
    let next = apply_move(&snapshot, &capture, Color::Green).unwrap();
    assert!(next.inactive_seats.contains(&Color::Coral));
    assert_eq!(next.turn_seat, Color::Yellow);
    assert!(next.winner.is_none());

    let mut end = Snapshot::empty(Mode::FourPlayerFfa);
    place(
        &mut end,
        0,
        0,
        commander("green:commander", Color::Green, 0),
    );
    place(&mut end, 0, 1, shield("green:shield1", Color::Green, 2));
    place(
        &mut end,
        0,
        2,
        commander("coral:commander", Color::Coral, 6),
    );
    place(&mut end, 3, 3, shield("coral:shield1", Color::Coral, 0));
    let end = seal(end);
    let last = apply_move(&end, &capture, Color::Green).unwrap();
    assert_eq!(
        last.winner,
        Some(WinnerKind::Color {
            color: Color::Green
        })
    );
}

#[test]
fn partnership_bare_commander_continues() {
    let mut snapshot = Snapshot::empty(Mode::Partnership);
    place(
        &mut snapshot,
        0,
        0,
        commander("green:commander", Color::Green, 0),
    );
    place(
        &mut snapshot,
        0,
        4,
        commander("yellow:commander", Color::Yellow, 0),
    );
    place(
        &mut snapshot,
        0,
        5,
        shield("yellow:shield1", Color::Yellow, 0),
    );
    place(
        &mut snapshot,
        8,
        0,
        commander("coral:commander", Color::Coral, 0),
    );
    place(
        &mut snapshot,
        8,
        1,
        shield("coral:shield1", Color::Coral, 0),
    );
    place(
        &mut snapshot,
        8,
        8,
        commander("blue:commander", Color::Blue, 0),
    );
    place(&mut snapshot, 7, 8, shield("blue:shield1", Color::Blue, 0));
    snapshot.turn_seat = Color::Green;
    let snapshot = seal(snapshot);
    assert!(strictly_defeated(&snapshot, Color::Green));
    assert_eq!(controller_for_turn(&snapshot).unwrap(), Some(Color::Green));
    assert!(snapshot.winner.is_none());
}
