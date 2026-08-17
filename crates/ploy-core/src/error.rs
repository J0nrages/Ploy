use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorBody {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RulesError {
    pub code: &'static str,
    pub message: String,
}

impl RulesError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn invalid_snapshot(message: impl Into<String>) -> Self {
        Self::new("invalidSnapshot", message)
    }

    pub fn invalid_move(message: impl Into<String>) -> Self {
        Self::new("invalidMove", message)
    }

    pub fn not_your_turn() -> Self {
        Self::new(
            "notYourTurn",
            "acting color is not the controller for this turn",
        )
    }

    pub fn game_over() -> Self {
        Self::new("gameOver", "no move is accepted after a winner is set")
    }

    pub fn no_such_piece() -> Self {
        Self::new("noSuchPiece", "no piece occupies the requested square")
    }

    pub fn wrong_controller() -> Self {
        Self::new(
            "wrongController",
            "piece is not controlled by the acting color",
        )
    }

    pub fn to_body(&self) -> ErrorBody {
        ErrorBody {
            code: self.code.to_string(),
            message: self.message.clone(),
        }
    }
}
