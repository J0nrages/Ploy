use crate::error::RulesError;
use crate::types::{Color, Mode, Piece, Snapshot, Square, BOARD_SIZE};

pub fn square_of(rank: usize, file: usize) -> Option<Square> {
    if rank < BOARD_SIZE && file < BOARD_SIZE {
        Some((rank * BOARD_SIZE + file) as Square)
    } else {
        None
    }
}

pub fn split_square(square: Square) -> Result<(usize, usize), RulesError> {
    if square > 80 {
        return Err(RulesError::invalid_snapshot(format!(
            "square {square} is out of bounds"
        )));
    }
    Ok((square as usize / BOARD_SIZE, square as usize % BOARD_SIZE))
}

pub fn offset_square(square: Square, d_rank: i8, d_file: i8) -> Option<Square> {
    let (rank, file) = split_square(square).ok()?;
    let next_rank = rank as i8 + d_rank;
    let next_file = file as i8 + d_file;
    if next_rank < 0 || next_file < 0 {
        return None;
    }
    square_of(next_rank as usize, next_file as usize)
}

pub fn piece_at(snapshot: &Snapshot, square: Square) -> Result<Option<&Piece>, RulesError> {
    let (rank, file) = split_square(square)?;
    Ok(snapshot.board[rank][file].as_ref())
}

pub fn set_piece(
    snapshot: &mut Snapshot,
    square: Square,
    piece: Option<Piece>,
) -> Result<(), RulesError> {
    let (rank, file) = split_square(square)?;
    snapshot.board[rank][file] = piece;
    Ok(())
}

pub fn pieces(snapshot: &Snapshot) -> impl Iterator<Item = (Square, &Piece)> {
    snapshot.board.iter().enumerate().flat_map(|(rank, row)| {
        row.iter().enumerate().filter_map(move |(file, cell)| {
            cell.as_ref()
                .map(|piece| ((rank * BOARD_SIZE + file) as Square, piece))
        })
    })
}

pub fn colors_for_mode(mode: Mode) -> &'static [Color] {
    match mode {
        Mode::TwoPlayer => &[Color::Green, Color::Coral],
        Mode::FourPlayerFfa | Mode::Partnership => {
            &[Color::Green, Color::Coral, Color::Yellow, Color::Blue]
        }
    }
}

pub fn turn_cycle(mode: Mode) -> &'static [Color] {
    colors_for_mode(mode)
}

pub fn next_seat(mode: Mode, seat: Color) -> Color {
    let cycle = turn_cycle(mode);
    let idx = cycle.iter().position(|color| *color == seat).unwrap_or(0);
    cycle[(idx + 1) % cycle.len()]
}

pub fn count_color(snapshot: &Snapshot, color: Color) -> usize {
    pieces(snapshot)
        .filter(|(_, piece)| piece.color() == color)
        .count()
}

pub fn has_original_commander(snapshot: &Snapshot, color: Color) -> bool {
    pieces(snapshot)
        .any(|(_, piece)| matches!(piece, Piece::Commander { .. }) && piece.color() == color)
}

pub fn has_lps_of_color(snapshot: &Snapshot, color: Color) -> bool {
    pieces(snapshot)
        .any(|(_, piece)| piece.color() == color && !matches!(piece, Piece::Commander { .. }))
}

pub fn has_controlled_lps(snapshot: &Snapshot, color: Color) -> bool {
    pieces(snapshot)
        .any(|(_, piece)| piece.controller() == color && !matches!(piece, Piece::Commander { .. }))
}

pub fn original_commander_square(snapshot: &Snapshot, color: Color) -> Option<Square> {
    pieces(snapshot).find_map(|(square, piece)| {
        (matches!(piece, Piece::Commander { .. }) && piece.color() == color).then_some(square)
    })
}
