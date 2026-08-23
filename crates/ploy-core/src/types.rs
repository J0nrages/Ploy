use serde::{Deserialize, Serialize};

use crate::error::RulesError;

pub const BOARD_SIZE: usize = 9;
pub const SQUARE_COUNT: u8 = 81;

pub type Square = u8;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Color {
    Green,
    Coral,
    Yellow,
    Blue,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Mode {
    TwoPlayer,
    FourPlayerFfa,
    Partnership,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Team {
    #[serde(rename = "green-yellow")]
    GreenYellow,
    #[serde(rename = "coral-blue")]
    CoralBlue,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Variant {
    Heavy,
    Medium,
    Light,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Rotation(u8);

impl Rotation {
    pub fn new(steps: u8) -> Result<Self, RulesError> {
        if steps <= 7 {
            Ok(Self(steps))
        } else {
            Err(RulesError::invalid_snapshot("rotation must be 0..=7"))
        }
    }

    pub const fn from_checked(steps: u8) -> Self {
        Self(steps)
    }

    pub const fn get(self) -> u8 {
        self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum Piece {
    #[serde(rename = "commander")]
    Commander {
        id: String,
        color: Color,
        controller: Color,
        rot: Rotation,
    },
    #[serde(rename = "shield")]
    Shield {
        id: String,
        color: Color,
        controller: Color,
        rot: Rotation,
    },
    #[serde(rename = "lance")]
    Lance {
        id: String,
        color: Color,
        controller: Color,
        variant: Variant,
        rot: Rotation,
    },
    #[serde(rename = "probe")]
    Probe {
        id: String,
        color: Color,
        controller: Color,
        variant: Variant,
        rot: Rotation,
    },
}

impl Piece {
    pub fn id(&self) -> &str {
        match self {
            Self::Commander { id, .. }
            | Self::Shield { id, .. }
            | Self::Lance { id, .. }
            | Self::Probe { id, .. } => id,
        }
    }

    pub fn color(&self) -> Color {
        match self {
            Self::Commander { color, .. }
            | Self::Shield { color, .. }
            | Self::Lance { color, .. }
            | Self::Probe { color, .. } => *color,
        }
    }

    pub fn controller(&self) -> Color {
        match self {
            Self::Commander { controller, .. }
            | Self::Shield { controller, .. }
            | Self::Lance { controller, .. }
            | Self::Probe { controller, .. } => *controller,
        }
    }

    pub fn rot(&self) -> Rotation {
        match self {
            Self::Commander { rot, .. }
            | Self::Shield { rot, .. }
            | Self::Lance { rot, .. }
            | Self::Probe { rot, .. } => *rot,
        }
    }

    pub fn is_shield(&self) -> bool {
        matches!(self, Self::Shield { .. })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Move {
    #[serde(rename = "motion")]
    Motion {
        from: Square,
        to: Square,
        #[serde(rename = "postMoveSteps", skip_serializing_if = "Option::is_none")]
        post_move_steps: Option<u8>,
    },
    #[serde(rename = "rotate")]
    Rotate { at: Square, steps: u8 },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WinnerKind {
    #[serde(rename = "color")]
    Color { color: Color },
    #[serde(rename = "team")]
    Team { team: Team },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub mode: Mode,
    pub board: Vec<Vec<Option<Piece>>>,
    pub turn_seat: Color,
    pub inactive_seats: Vec<Color>,
    pub winner: Option<WinnerKind>,
    pub ply: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    #[serde(rename = "move")]
    pub mv: Move,
    pub depth: u32,
    pub nodes: u64,
    pub score: i32,
    pub best_score: i32,
    pub score_loss: i32,
    pub principal_variation: Vec<Move>,
    pub fallback: SearchFallback,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SearchFallback {
    None,
    Static,
}

impl Snapshot {
    pub fn empty(mode: Mode) -> Self {
        Self {
            mode,
            board: vec![vec![None; BOARD_SIZE]; BOARD_SIZE],
            turn_seat: Color::Green,
            inactive_seats: Vec::new(),
            winner: None,
            ply: 0,
        }
    }

    pub fn piece_at(&self, square: Square) -> Option<&Piece> {
        let rank = (square / 9) as usize;
        let file = (square % 9) as usize;
        self.board.get(rank)?.get(file)?.as_ref()
    }
}
