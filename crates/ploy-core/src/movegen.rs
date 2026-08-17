use crate::catalog::{
    COMMANDER_MASK, DIR_DELTA, LANCE_HEAVY_MASK, LANCE_LIGHT_MASK, LANCE_MEDIUM_MASK,
    PROBE_HEAVY_MASK, PROBE_LIGHT_MASK, PROBE_MEDIUM_MASK, SHIELD_MASK,
};
use crate::types::{Color, Mode, Move, Piece, Snapshot, Variant};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum CompactKind {
    Commander,
    Shield,
    Lance(Variant),
    Probe(Variant),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) struct CompactPiece {
    pub color: Color,
    pub controller: Color,
    pub kind: CompactKind,
    pub rot: u8,
}

impl CompactPiece {
    pub fn from_piece(piece: &Piece) -> Self {
        let kind = match piece {
            Piece::Commander { .. } => CompactKind::Commander,
            Piece::Shield { .. } => CompactKind::Shield,
            Piece::Lance { variant, .. } => CompactKind::Lance(*variant),
            Piece::Probe { variant, .. } => CompactKind::Probe(*variant),
        };
        Self {
            color: piece.color(),
            controller: piece.controller(),
            kind,
            rot: piece.rot().get(),
        }
    }

    pub fn is_shield(self) -> bool {
        matches!(self.kind, CompactKind::Shield)
    }

    pub fn is_commander(self) -> bool {
        matches!(self.kind, CompactKind::Commander)
    }

    pub fn is_lps(self) -> bool {
        !self.is_commander()
    }

    pub fn rotated(self, steps: u8) -> Self {
        Self {
            rot: (self.rot + steps) % 8,
            ..self
        }
    }
}

pub(crate) type CompactBoard = [Option<CompactPiece>; 81];

pub(crate) fn compact_board(snapshot: &Snapshot) -> CompactBoard {
    let mut board = [None; 81];
    for (rank, row) in snapshot.board.iter().enumerate() {
        for (file, cell) in row.iter().enumerate() {
            board[rank * 9 + file] = cell.as_ref().map(CompactPiece::from_piece);
        }
    }
    board
}

pub(crate) fn generate_moves(board: &CompactBoard, mode: Mode, actor: Color) -> Vec<Move> {
    let mut moves = Vec::new();
    for (from, cell) in board.iter().enumerate() {
        let Some(piece) = cell else {
            continue;
        };
        if piece.controller != actor {
            continue;
        }
        // In 1970 partnership play, a partner controls an eliminated seat's
        // turns but only moves the pieces bearing that seat's color then.
        if mode == Mode::Partnership && piece.color != actor {
            continue;
        }
        generate_for_piece(board, mode, actor, from as u8, *piece, &mut moves);
    }
    moves
}

fn generate_for_piece(
    board: &CompactBoard,
    mode: Mode,
    actor: Color,
    from: u8,
    piece: CompactPiece,
    moves: &mut Vec<Move>,
) {
    let flags = effective_flags(piece);
    for (direction, (d_rank, d_file)) in DIR_DELTA.iter().copied().enumerate() {
        if flags & (1 << direction) == 0 {
            continue;
        }
        for distance in 1..=range(piece) {
            let Some(to) = offset_square(from, d_rank * distance as i8, d_file * distance as i8)
            else {
                break;
            };
            match board[to as usize] {
                None => push_motion(piece, from, to, moves),
                Some(other) if friendly(mode, actor, other) => break,
                Some(_) => {
                    push_motion(piece, from, to, moves);
                    break;
                }
            }
        }
    }
    for steps in canonical_rotation_steps(piece) {
        moves.push(Move::Rotate { at: from, steps });
    }
}

fn push_motion(piece: CompactPiece, from: u8, to: u8, moves: &mut Vec<Move>) {
    moves.push(Move::Motion {
        from,
        to,
        post_move_steps: None,
    });
    if piece.is_shield() {
        for steps in canonical_rotation_steps(piece) {
            moves.push(Move::Motion {
                from,
                to,
                post_move_steps: Some(steps),
            });
        }
    }
}

pub(crate) fn base_flags(piece: CompactPiece) -> u8 {
    match piece.kind {
        CompactKind::Commander => COMMANDER_MASK,
        CompactKind::Shield => SHIELD_MASK,
        CompactKind::Lance(Variant::Heavy) => LANCE_HEAVY_MASK,
        CompactKind::Lance(Variant::Medium) => LANCE_MEDIUM_MASK,
        CompactKind::Lance(Variant::Light) => LANCE_LIGHT_MASK,
        CompactKind::Probe(Variant::Heavy) => PROBE_HEAVY_MASK,
        CompactKind::Probe(Variant::Medium) => PROBE_MEDIUM_MASK,
        CompactKind::Probe(Variant::Light) => PROBE_LIGHT_MASK,
    }
}

pub(crate) fn effective_flags(piece: CompactPiece) -> u8 {
    base_flags(piece).rotate_left((piece.rot % 8) as u32)
}

pub(crate) fn range(piece: CompactPiece) -> u8 {
    match piece.kind {
        CompactKind::Commander | CompactKind::Shield => 1,
        CompactKind::Probe(_) => 2,
        CompactKind::Lance(_) => 3,
    }
}

pub(crate) fn canonical_rotation_steps(piece: CompactPiece) -> Vec<u8> {
    let current = effective_flags(piece);
    let mut seen = [false; 256];
    let mut result = Vec::new();
    for steps in 1..=7 {
        let mask = base_flags(piece).rotate_left(((piece.rot + steps) % 8) as u32);
        if mask != current && !seen[mask as usize] {
            seen[mask as usize] = true;
            result.push(steps);
        }
    }
    result
}

fn friendly(mode: Mode, actor: Color, other: CompactPiece) -> bool {
    match mode {
        Mode::TwoPlayer | Mode::FourPlayerFfa => other.controller == actor,
        Mode::Partnership => same_team(actor, other.color),
    }
}

fn same_team(a: Color, b: Color) -> bool {
    matches!(
        (a, b),
        (Color::Green, Color::Green)
            | (Color::Green, Color::Yellow)
            | (Color::Yellow, Color::Green)
            | (Color::Yellow, Color::Yellow)
            | (Color::Coral, Color::Coral)
            | (Color::Coral, Color::Blue)
            | (Color::Blue, Color::Coral)
            | (Color::Blue, Color::Blue)
    )
}

fn offset_square(square: u8, d_rank: i8, d_file: i8) -> Option<u8> {
    let rank = (square / 9) as i8 + d_rank;
    let file = (square % 9) as i8 + d_file;
    (0..9)
        .contains(&rank)
        .then_some(())
        .and_then(|()| (0..9).contains(&file).then_some((rank * 9 + file) as u8))
}
