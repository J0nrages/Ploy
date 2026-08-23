//! Ploy rules and two-player lookahead core.
//!
//! Unsafe code is forbidden. The public C ABI lives in `ploy-wasm`.

pub mod api;
pub mod apply;
pub mod board;
pub mod catalog;
pub mod error;
mod movegen;
pub mod moves;
pub mod search;
pub mod setup;
pub mod terminal;
pub mod types;
pub mod validate;

pub use api::{
    apply_move, choose_move, choose_move_with_profile, controller_for_turn, create_game, is_legal,
    legal_moves, perft, same_side, spike_move, spike_snapshot, stub_search_nodes, SPIKE_FROM,
    SPIKE_TO,
};
pub use error::{ErrorBody, RulesError};
pub use types::{
    Color, Mode, Move, OpponentStyle, Piece, Rotation, SearchFallback, SearchResult, Snapshot,
    Square, Team, Variant, WinnerKind, BOARD_SIZE, SQUARE_COUNT,
};

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
