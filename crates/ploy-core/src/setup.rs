use crate::error::RulesError;
use crate::types::{Color, Mode, Piece, Rotation, Snapshot, Variant, BOARD_SIZE};

#[derive(Clone, Copy)]
enum TokenKind {
    Commander,
    Shield,
    Lance(Variant),
    Probe(Variant),
}

struct Token {
    color: Color,
    kind: TokenKind,
    rot: u8,
}

const TWO_PLAYER: [&str; 9] = [
    ". g:LM0 g:LL0 g:LH0 g:C1 g:LH0 g:LL0 g:LM0 .",
    ". . g:PH0 g:PM7 g:PL0 g:PM7 g:PH7 . .",
    ". . . g:S0 g:S0 g:S0 . . .",
    ". . . . . . . . .",
    ". . . . . . . . .",
    ". . . . . . . . .",
    ". . . c:S4 c:S4 c:S4 . . .",
    ". . c:PH3 c:PM3 c:PL0 c:PM3 c:PH4 . .",
    ". c:LM4 c:LL4 c:LH4 c:C1 c:LH4 c:LL4 c:LM4 .",
];

const PARTNERSHIP: [&str; 9] = [
    ". g:LM0 g:C1 g:LH0 . y:LH0 y:C1 y:LM0 .",
    ". g:PH0 g:PM7 g:PH7 . y:PH0 y:PM7 y:PH7 .",
    ". g:S0 g:S0 g:S0 . y:S0 y:S0 y:S0 .",
    ". . . . . . . . .",
    ". . . . . . . . .",
    ". . . . . . . . .",
    ". c:S4 c:S4 c:S4 . b:S4 b:S4 b:S4 .",
    ". c:PH3 c:PM3 c:PH4 . b:PH3 b:PM3 b:PH4 .",
    ". c:LM4 c:C1 c:LH4 . b:LH4 b:C1 b:LM4 .",
];

const FOUR_PLAYER: [&str; 9] = [
    "g:C0 g:LM1 g:PH7 . . . b:PH0 b:LH7 b:C0",
    "g:LH1 g:PM0 g:S1 . . . b:S7 b:PM6 b:LM7",
    "g:PH2 g:S1 g:S1 . . . b:S7 b:S7 b:PH5",
    ". . . . . . . . .",
    ". . . . . . . . .",
    ". . . . . . . . .",
    "c:PH1 c:S3 c:S3 . . . y:S5 y:S5 y:PH6",
    "c:LM3 c:PM2 c:S3 . . . y:S5 y:PM4 y:LH5",
    "c:C0 c:LH3 c:PH4 . . . y:PH3 y:LM5 y:C0",
];

pub fn initial_snapshot(mode: Mode) -> Snapshot {
    let rows = match mode {
        Mode::TwoPlayer => TWO_PLAYER,
        Mode::Partnership => PARTNERSHIP,
        Mode::FourPlayerFfa => FOUR_PLAYER,
    };
    let mut snapshot = Snapshot::empty(mode);
    for (rank, row) in rows.iter().enumerate() {
        let tokens: Vec<&str> = row.split_whitespace().collect();
        assert_eq!(
            tokens.len(),
            BOARD_SIZE,
            "setup row {rank} must have 9 files"
        );
        for (file, token) in tokens.iter().enumerate() {
            if *token == "." {
                continue;
            }
            let parsed = parse_token(token).unwrap_or_else(|error| {
                panic!(
                    "invalid setup token {token} at {rank},{file}: {}",
                    error.message
                )
            });
            snapshot.board[rank][file] = Some(piece_from_token(&parsed, String::new()));
        }
    }
    assign_ids(&mut snapshot);
    snapshot
}

pub fn setup_rows(mode: Mode) -> [&'static str; 9] {
    match mode {
        Mode::TwoPlayer => TWO_PLAYER,
        Mode::Partnership => PARTNERSHIP,
        Mode::FourPlayerFfa => FOUR_PLAYER,
    }
}

fn parse_token(token: &str) -> Result<Token, RulesError> {
    let (color_code, rest) = token
        .split_once(':')
        .ok_or_else(|| RulesError::invalid_snapshot(format!("token {token} is missing a color")))?;
    let color = match color_code {
        "g" => Color::Green,
        "c" => Color::Coral,
        "y" => Color::Yellow,
        "b" => Color::Blue,
        _ => {
            return Err(RulesError::invalid_snapshot(format!(
                "unknown color {color_code}"
            )))
        }
    };
    let rot = rest
        .chars()
        .last()
        .and_then(|ch| ch.to_digit(10))
        .ok_or_else(|| {
            RulesError::invalid_snapshot(format!("token {token} is missing a rotation"))
        })? as u8;
    let body = &rest[..rest.len() - 1];
    let kind = match body {
        "C" => TokenKind::Commander,
        "S" => TokenKind::Shield,
        "LH" => TokenKind::Lance(Variant::Heavy),
        "LM" => TokenKind::Lance(Variant::Medium),
        "LL" => TokenKind::Lance(Variant::Light),
        "PH" => TokenKind::Probe(Variant::Heavy),
        "PM" => TokenKind::Probe(Variant::Medium),
        "PL" => TokenKind::Probe(Variant::Light),
        _ => {
            return Err(RulesError::invalid_snapshot(format!(
                "unknown piece {body}"
            )))
        }
    };
    Ok(Token { color, kind, rot })
}

fn piece_from_token(token: &Token, id: String) -> Piece {
    let rot = Rotation::from_checked(token.rot);
    match token.kind {
        TokenKind::Commander => Piece::Commander {
            id,
            color: token.color,
            controller: token.color,
            rot,
        },
        TokenKind::Shield => Piece::Shield {
            id,
            color: token.color,
            controller: token.color,
            rot,
        },
        TokenKind::Lance(variant) => Piece::Lance {
            id,
            color: token.color,
            controller: token.color,
            variant,
            rot,
        },
        TokenKind::Probe(variant) => Piece::Probe {
            id,
            color: token.color,
            controller: token.color,
            variant,
            rot,
        },
    }
}

fn assign_ids(snapshot: &mut Snapshot) {
    #[derive(Clone, Copy, PartialEq, Eq, Hash)]
    enum Key {
        Commander,
        Shield,
        Lance(Variant),
        Probe(Variant),
    }
    use std::collections::HashMap;
    let mut counts: HashMap<(Color, Key), u8> = HashMap::new();
    for rank in 0..BOARD_SIZE {
        for file in 0..BOARD_SIZE {
            let Some(piece) = snapshot.board[rank][file].clone() else {
                continue;
            };
            let key = match &piece {
                Piece::Commander { .. } => Key::Commander,
                Piece::Shield { .. } => Key::Shield,
                Piece::Lance { variant, .. } => Key::Lance(*variant),
                Piece::Probe { variant, .. } => Key::Probe(*variant),
            };
            let color = piece.color();
            let next = counts.get(&(color, key)).copied().unwrap_or(0) + 1;
            counts.insert((color, key), next);
            let color_name = color_name(color);
            let id = match key {
                Key::Commander => format!("{color_name}:commander"),
                Key::Shield => format!("{color_name}:shield{next}"),
                Key::Lance(Variant::Heavy) => format!("{color_name}:lanceH{next}"),
                Key::Lance(Variant::Medium) => format!("{color_name}:lanceM{next}"),
                Key::Lance(Variant::Light) => format!("{color_name}:lanceL{next}"),
                Key::Probe(Variant::Heavy) => format!("{color_name}:probeH{next}"),
                Key::Probe(Variant::Medium) => format!("{color_name}:probeM{next}"),
                Key::Probe(Variant::Light) => format!("{color_name}:probeL{next}"),
            };
            snapshot.board[rank][file] = Some(with_id(piece, id));
        }
    }
}

fn with_id(piece: Piece, id: String) -> Piece {
    match piece {
        Piece::Commander {
            color,
            controller,
            rot,
            ..
        } => Piece::Commander {
            id,
            color,
            controller,
            rot,
        },
        Piece::Shield {
            color,
            controller,
            rot,
            ..
        } => Piece::Shield {
            id,
            color,
            controller,
            rot,
        },
        Piece::Lance {
            color,
            controller,
            variant,
            rot,
            ..
        } => Piece::Lance {
            id,
            color,
            controller,
            variant,
            rot,
        },
        Piece::Probe {
            color,
            controller,
            variant,
            rot,
            ..
        } => Piece::Probe {
            id,
            color,
            controller,
            variant,
            rot,
        },
    }
}

fn color_name(color: Color) -> &'static str {
    match color {
        Color::Green => "green",
        Color::Coral => "coral",
        Color::Yellow => "yellow",
        Color::Blue => "blue",
    }
}

pub fn fen_like_rows(snapshot: &Snapshot) -> [String; 9] {
    let mut rows = std::array::from_fn(|_| String::new());
    for rank in (0..BOARD_SIZE).rev() {
        let mut cells = Vec::new();
        for file in 0..BOARD_SIZE {
            cells.push(match &snapshot.board[rank][file] {
                None => ".".to_string(),
                Some(piece) => format_cell(piece),
            });
        }
        rows[8 - rank] = cells.join(" ");
    }
    rows
}

fn format_cell(piece: &Piece) -> String {
    let color = match piece.color() {
        Color::Green => "g",
        Color::Coral => "c",
        Color::Yellow => "y",
        Color::Blue => "b",
    };
    let body = match piece {
        Piece::Commander { .. } => "C",
        Piece::Shield { .. } => "S",
        Piece::Lance {
            variant: Variant::Heavy,
            ..
        } => "LH",
        Piece::Lance {
            variant: Variant::Medium,
            ..
        } => "LM",
        Piece::Lance {
            variant: Variant::Light,
            ..
        } => "LL",
        Piece::Probe {
            variant: Variant::Heavy,
            ..
        } => "PH",
        Piece::Probe {
            variant: Variant::Medium,
            ..
        } => "PM",
        Piece::Probe {
            variant: Variant::Light,
            ..
        } => "PL",
    };
    format!("{color}:{body}{}", piece.rot().get())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::{pieces, square_of};

    #[test]
    fn two_player_has_15_per_color() {
        let snapshot = initial_snapshot(Mode::TwoPlayer);
        assert_eq!(count_kind(&snapshot, Color::Green), (1, 6, 5, 3));
        assert_eq!(count_kind(&snapshot, Color::Coral), (1, 6, 5, 3));
    }

    #[test]
    fn four_player_has_9_per_color() {
        for mode in [Mode::FourPlayerFfa, Mode::Partnership] {
            let snapshot = initial_snapshot(mode);
            for color in [Color::Green, Color::Coral, Color::Yellow, Color::Blue] {
                assert_eq!(
                    count_kind(&snapshot, color),
                    (1, 2, 3, 3),
                    "{mode:?} {color:?}"
                );
            }
        }
    }

    #[test]
    fn ids_are_unique_and_stable() {
        let snapshot = initial_snapshot(Mode::TwoPlayer);
        let mut ids = Vec::new();
        for (_, piece) in pieces(&snapshot) {
            ids.push(piece.id().to_string());
        }
        let mut sorted = ids.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), ids.len());
        assert!(ids.contains(&"green:commander".to_string()));
        assert!(ids.contains(&"green:shield1".to_string()));
        assert_eq!(
            snapshot.board[0][4].as_ref().map(Piece::id),
            Some("green:commander")
        );
        assert_eq!(
            snapshot.board[2][4].as_ref().map(Piece::id),
            Some("green:shield2")
        );
    }

    fn count_kind(snapshot: &Snapshot, color: Color) -> (usize, usize, usize, usize) {
        let mut commander = 0;
        let mut lance = 0;
        let mut probe = 0;
        let mut shield = 0;
        for (_, piece) in pieces(snapshot) {
            if piece.color() != color {
                continue;
            }
            match piece {
                Piece::Commander { .. } => commander += 1,
                Piece::Lance { .. } => lance += 1,
                Piece::Probe { .. } => probe += 1,
                Piece::Shield { .. } => shield += 1,
            }
        }
        (commander, lance, probe, shield)
    }

    #[test]
    fn square_helper_covers_center() {
        assert_eq!(square_of(2, 4), Some(22));
    }
}
