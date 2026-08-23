//! Two-player computer opponent.
//!
//! This is a Rust/WASM adaptation of the search architecture documented by
//! Thomas Tensi's MIT-licensed Ada Ploy engine: iterative deepening, MTD(f)
//! zero-window refinement, alpha-beta, a Zobrist-keyed transposition table,
//! reversible moves, and several refutation moves per ply. The game rules and
//! position evaluation here remain the 1970 3M rules implemented by this crate.

use crate::error::RulesError;
use crate::movegen::{
    compact_board, effective_flags, generate_moves, CompactBoard, CompactKind, CompactPiece,
};
use crate::moves::controller_for_turn;
use crate::types::{
    Color, Mode, Move, OpponentStyle, SearchFallback, SearchResult, Snapshot, Variant, WinnerKind,
};
use crate::validate::validate_snapshot;

const MATE: i32 = 100_000;
const INFINITY: i32 = 200_000;
const TT_SIZE: usize = 1 << 17;
const MAX_SEARCH_DEPTH: u32 = 12;
const REFUTATIONS_PER_PLY: usize = 4;
const DEFAULT_SCORE_LOSS: i32 = 12;
const EXTENSIONS_PER_LINE: u8 = 2;
const QUIESCENCE_DEPTH: u8 = 2;

#[derive(Clone, Copy, PartialEq, Eq)]
enum TtFlag {
    Exact,
    Lower,
    Upper,
}

#[derive(Clone)]
struct TtEntry {
    hash: u64,
    depth: u32,
    score: i32,
    flag: TtFlag,
    best_move: Option<Move>,
    generation: u16,
}

#[derive(Clone)]
struct Refutation {
    mv: Move,
    value: i32,
}

struct Searcher {
    nodes: u64,
    max_nodes: u64,
    tt: Vec<Option<TtEntry>>,
    refutations: Vec<[Option<Refutation>; REFUTATIONS_PER_PLY]>,
    history: [[i32; 81]; 81],
    seed: u32,
    generation: u16,
    style: OpponentStyle,
}

#[derive(Clone)]
struct Position {
    board: CompactBoard,
    side: Color,
    winner: Option<Color>,
    last_move_to: Option<u8>,
    hash: u64,
}

struct Undo {
    mv: Move,
    moving: CompactPiece,
    captured: Option<CompactPiece>,
    previous_side: Color,
    previous_winner: Option<Color>,
    previous_last_move_to: Option<u8>,
    previous_hash: u64,
}

#[derive(Debug, Clone, Copy)]
struct BudgetExhausted;

pub fn choose_move(
    snapshot: &Snapshot,
    color: Color,
    max_depth: u32,
    max_nodes: u64,
    random_seed: u32,
) -> Result<SearchResult, RulesError> {
    choose_move_with_profile(
        snapshot,
        color,
        max_depth,
        max_nodes,
        random_seed,
        OpponentStyle::Balanced,
        DEFAULT_SCORE_LOSS,
    )
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
    validate_snapshot(snapshot)?;
    if snapshot.mode != Mode::TwoPlayer {
        return Err(RulesError::new(
            "unsupportedMode",
            "choose_move rejects non-two-player modes",
        ));
    }
    if controller_for_turn(snapshot) != Some(color) {
        return Err(RulesError::new("noLegalMove", "not this color's turn"));
    }

    let mut position = Position::from_snapshot(snapshot);
    let root_moves = position.moves();
    let Some(_) = root_moves.first() else {
        return Err(RulesError::new("noLegalMove", "no legal move for search"));
    };
    let node_limit = max_nodes.max(1);

    let score_loss_limit = max_score_loss.max(0);

    // Cadet chooses deterministically among evaluated candidates within its
    // controlled-error limit instead of returning an arbitrary legal move.
    if max_depth <= 1 && node_limit <= 250 {
        return Ok(cadet_move(
            &mut position,
            &root_moves,
            random_seed,
            node_limit,
            style,
            score_loss_limit,
        ));
    }

    let mut root_scores = static_root_scores(&mut position, root_moves, style);
    root_scores.sort_by(|(left_move, left_score), (right_move, right_score)| {
        right_score.cmp(left_score).then_with(|| {
            stable_move_noise(left_move, random_seed)
                .cmp(&stable_move_noise(right_move, random_seed))
        })
    });
    let (fallback, fallback_score) = root_scores[0].clone();
    let mut searcher = Searcher::new(node_limit, random_seed, style);
    let mut best = SearchResult {
        mv: fallback.clone(),
        depth: 0,
        nodes: 0,
        score: fallback_score,
        best_score: fallback_score,
        score_loss: 0,
        principal_variation: vec![fallback],
        fallback: SearchFallback::Static,
    };

    for depth in 1..=max_depth.clamp(1, MAX_SEARCH_DEPTH) {
        searcher.generation = searcher.generation.wrapping_add(1);
        searcher.order_root(&position, &mut root_scores);
        let mut iteration = Vec::with_capacity(root_scores.len());
        let mut completed = true;

        for (mv, previous_score) in &root_scores {
            let undo = position.make_move(mv);
            let score = searcher
                .mtdf(&mut position, depth - 1, -previous_score, 1)
                .map(|value| -value);
            position.unmake_move(undo);
            match score {
                Ok(value) => iteration.push((mv.clone(), value)),
                Err(BudgetExhausted) => {
                    completed = false;
                    break;
                }
            }
        }

        if !completed || iteration.len() != root_scores.len() {
            break;
        }

        iteration.sort_by(|(left_move, left_score), (right_move, right_score)| {
            right_score.cmp(left_score).then_with(|| {
                stable_move_noise(left_move, searcher.seed)
                    .cmp(&stable_move_noise(right_move, searcher.seed))
            })
        });
        let best_score = iteration[0].1;
        let near_equal: Vec<&(Move, i32)> = iteration
            .iter()
            .filter(|(_, score)| best_score - *score <= score_loss_limit)
            .collect();
        let selected = near_equal[searcher.next_random() as usize % near_equal.len()];
        best.mv = selected.0.clone();
        best.score = selected.1;
        best.best_score = best_score;
        best.score_loss = best_score - selected.1;
        best.depth = depth;
        best.fallback = SearchFallback::None;
        root_scores = iteration;
    }

    best.nodes = searcher.nodes;
    best.principal_variation = searcher.principal_variation(&position, &best.mv, best.depth);
    Ok(best)
}

fn static_root_scores(
    position: &mut Position,
    moves: Vec<Move>,
    style: OpponentStyle,
) -> Vec<(Move, i32)> {
    moves
        .into_iter()
        .map(|mv| {
            let style_bonus = style_move_bonus(style, position, &mv);
            let undo = position.make_move(&mv);
            let score = -evaluate(position, style) + style_bonus;
            position.unmake_move(undo);
            (mv, score)
        })
        .collect()
}

fn cadet_move(
    position: &mut Position,
    moves: &[Move],
    seed: u32,
    max_nodes: u64,
    style: OpponentStyle,
    max_score_loss: i32,
) -> SearchResult {
    let mut scored = static_root_scores(position, moves.to_vec(), style);
    scored.sort_by(|(left_move, left_score), (right_move, right_score)| {
        right_score.cmp(left_score).then_with(|| {
            stable_move_noise(left_move, seed).cmp(&stable_move_noise(right_move, seed))
        })
    });
    let best_score = scored[0].1;
    let candidates: Vec<&(Move, i32)> = scored
        .iter()
        .filter(|(_, score)| best_score - *score <= max_score_loss)
        .collect();
    let mut state = seed;
    state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
    let (mv, score) = candidates[state as usize % candidates.len()];
    SearchResult {
        mv: mv.clone(),
        depth: 0,
        nodes: max_nodes.min(1),
        score: *score,
        best_score,
        score_loss: best_score - *score,
        principal_variation: vec![mv.clone()],
        fallback: SearchFallback::Static,
    }
}

impl Searcher {
    fn new(max_nodes: u64, seed: u32, style: OpponentStyle) -> Self {
        Self {
            nodes: 0,
            max_nodes,
            tt: vec![None; TT_SIZE],
            refutations: (0..64).map(|_| std::array::from_fn(|_| None)).collect(),
            history: [[0; 81]; 81],
            seed,
            generation: 0,
            style,
        }
    }

    fn tick(&mut self) -> Result<(), BudgetExhausted> {
        if self.nodes >= self.max_nodes {
            return Err(BudgetExhausted);
        }
        self.nodes += 1;
        Ok(())
    }

    /// Memory-enhanced Test Driver, following the zero-window refinement used
    /// by the Ada engine. The transposition table retains bounds between calls.
    fn mtdf(
        &mut self,
        position: &mut Position,
        depth: u32,
        first_guess: i32,
        ply: usize,
    ) -> Result<i32, BudgetExhausted> {
        let mut value = first_guess.clamp(-MATE, MATE);
        let mut lower = -INFINITY;
        let mut upper = INFINITY;
        while lower < upper {
            let beta = if value == lower { value + 1 } else { value };
            value = self.alpha_beta(position, depth, beta - 1, beta, ply, EXTENSIONS_PER_LINE)?;
            if value < beta {
                upper = value;
            } else {
                lower = value;
            }
        }
        Ok(value)
    }

    fn alpha_beta(
        &mut self,
        position: &mut Position,
        depth: u32,
        mut alpha: i32,
        mut beta: i32,
        ply: usize,
        extensions_left: u8,
    ) -> Result<i32, BudgetExhausted> {
        self.tick()?;
        if let Some(winner) = position.winner {
            return Ok(if winner == position.side {
                MATE - ply as i32
            } else {
                -MATE + ply as i32
            });
        }
        if depth == 0 {
            return self.quiescence_after_tick(position, alpha, beta, ply, QUIESCENCE_DEPTH);
        }

        let original_alpha = alpha;
        let original_beta = beta;
        let tt_hash = position.hash ^ zobrist_extension_budget(extensions_left);
        let tt_entry = self.tt_entry(tt_hash).cloned();
        let mut tt_move = None;
        if let Some(entry) = &tt_entry {
            tt_move = entry.best_move.clone();
            if entry.depth >= depth {
                match entry.flag {
                    TtFlag::Exact => return Ok(entry.score),
                    TtFlag::Lower => alpha = alpha.max(entry.score),
                    TtFlag::Upper => beta = beta.min(entry.score),
                }
                if alpha >= beta {
                    return Ok(entry.score);
                }
            }
        }

        let mut moves = position.moves();
        if moves.is_empty() {
            return Ok(evaluate(position, self.style));
        }
        self.order_moves(position, &mut moves, ply, tt_move.as_ref());

        let mut best_score = -INFINITY;
        let mut best_move = None;
        for mv in moves {
            let style_bonus = style_move_bonus(self.style, position, &mv);
            let quiet = !position.is_capture(&mv);
            let recapture = matches!(
                mv,
                Move::Motion { to, .. }
                    if !quiet && position.last_move_to == Some(to)
            );
            let undo = position.make_move(&mv);
            let commander_attack = commander_threatened(position, position.side);
            let extend = extensions_left > 0 && (recapture || commander_attack);
            let child_depth = depth - 1 + u32::from(extend);
            let child_extensions = extensions_left.saturating_sub(u8::from(extend));
            let child = self.alpha_beta(
                position,
                child_depth,
                -beta,
                -alpha,
                ply + 1,
                child_extensions,
            );
            position.unmake_move(undo);
            let score = -child? + style_bonus;

            if score > best_score {
                best_score = score;
                best_move = Some(mv.clone());
            }
            alpha = alpha.max(score);
            if alpha >= beta {
                if quiet {
                    self.store_refutation(ply, &mv, score.abs());
                    self.add_history(&mv, depth);
                }
                break;
            }
        }

        let flag = if best_score <= original_alpha {
            TtFlag::Upper
        } else if best_score >= original_beta {
            TtFlag::Lower
        } else {
            TtFlag::Exact
        };
        self.store_tt(tt_hash, depth, best_score, flag, best_move);
        Ok(best_score)
    }

    fn quiescence_after_tick(
        &mut self,
        position: &mut Position,
        mut alpha: i32,
        beta: i32,
        ply: usize,
        remaining: u8,
    ) -> Result<i32, BudgetExhausted> {
        if let Some(winner) = position.winner {
            return Ok(if winner == position.side {
                MATE - ply as i32
            } else {
                -MATE + ply as i32
            });
        }
        let stand_pat = evaluate(position, self.style);
        if stand_pat >= beta {
            return Ok(stand_pat);
        }
        alpha = alpha.max(stand_pat);
        if remaining == 0 {
            return Ok(alpha);
        }

        let mut captures: Vec<Move> = position
            .moves()
            .into_iter()
            .filter(|mv| position.is_capture(mv))
            .collect();
        self.order_moves(position, &mut captures, ply, None);
        for mv in captures {
            let style_bonus = style_move_bonus(self.style, position, &mv);
            let undo = position.make_move(&mv);
            let child = self.tick().and_then(|()| {
                self.quiescence_after_tick(position, -beta, -alpha, ply + 1, remaining - 1)
            });
            position.unmake_move(undo);
            let score = -child? + style_bonus;
            if score >= beta {
                return Ok(score);
            }
            alpha = alpha.max(score);
        }
        Ok(alpha)
    }

    fn tt_entry(&self, hash: u64) -> Option<&TtEntry> {
        self.tt[hash as usize % TT_SIZE]
            .as_ref()
            .filter(|entry| entry.hash == hash)
    }

    fn store_tt(
        &mut self,
        hash: u64,
        depth: u32,
        score: i32,
        flag: TtFlag,
        best_move: Option<Move>,
    ) {
        let slot = hash as usize % TT_SIZE;
        let replace = self.tt[slot].as_ref().is_none_or(|entry| {
            entry.hash == hash || entry.generation != self.generation || depth >= entry.depth
        });
        if replace {
            self.tt[slot] = Some(TtEntry {
                hash,
                depth,
                score,
                flag,
                best_move,
                generation: self.generation,
            });
        }
    }

    fn store_refutation(&mut self, ply: usize, mv: &Move, value: i32) {
        let Some(row) = self.refutations.get_mut(ply) else {
            return;
        };
        let mut entries: Vec<Refutation> = row.iter().flatten().cloned().collect();
        if let Some(existing) = entries.iter_mut().find(|entry| entry.mv == *mv) {
            existing.value = existing.value.max(value);
        } else {
            entries.push(Refutation {
                mv: mv.clone(),
                value,
            });
        }
        entries.sort_by_key(|entry| std::cmp::Reverse(entry.value));
        entries.truncate(REFUTATIONS_PER_PLY);
        for (slot, entry) in row
            .iter_mut()
            .zip(entries.into_iter().map(Some).chain(std::iter::repeat(None)))
        {
            *slot = entry;
        }
    }

    fn add_history(&mut self, mv: &Move, depth: u32) {
        if let Move::Motion { from, to, .. } = mv {
            self.history[*from as usize][*to as usize] =
                self.history[*from as usize][*to as usize].saturating_add((depth * depth) as i32);
        }
    }

    fn order_root(&self, position: &Position, moves: &mut [(Move, i32)]) {
        moves.sort_by(|(left_move, left_score), (right_move, right_score)| {
            let left = self.move_order_key(position, left_move, 0, None) + *left_score;
            let right = self.move_order_key(position, right_move, 0, None) + *right_score;
            right.cmp(&left).then_with(|| {
                stable_move_noise(left_move, self.seed)
                    .cmp(&stable_move_noise(right_move, self.seed))
            })
        });
    }

    fn order_moves(
        &self,
        position: &Position,
        moves: &mut [Move],
        ply: usize,
        tt_move: Option<&Move>,
    ) {
        moves.sort_by_key(|mv| -self.move_order_key(position, mv, ply, tt_move));
    }

    fn move_order_key(
        &self,
        position: &Position,
        mv: &Move,
        ply: usize,
        tt_move: Option<&Move>,
    ) -> i32 {
        if tt_move == Some(mv) {
            return 100_000;
        }
        let mut key = match mv {
            Move::Motion { from, to, .. } => {
                let capture = position.board[*to as usize]
                    .map(|piece| {
                        if piece.is_commander() {
                            50_000
                        } else {
                            30_000 + material(piece)
                        }
                    })
                    .unwrap_or(0);
                capture + self.history[*from as usize][*to as usize]
            }
            Move::Rotate { .. } => -50,
        };
        if let Some(row) = self.refutations.get(ply) {
            if let Some((index, entry)) = row
                .iter()
                .enumerate()
                .find(|(_, entry)| entry.as_ref().is_some_and(|entry| entry.mv == *mv))
            {
                key += 20_000 - index as i32 * 100 + entry.as_ref().map_or(0, |e| e.value.min(99));
            }
        }
        key
    }

    fn next_random(&mut self) -> u32 {
        self.seed = self
            .seed
            .wrapping_mul(1_664_525)
            .wrapping_add(1_013_904_223);
        self.seed
    }

    fn principal_variation(
        &self,
        root: &Position,
        root_move: &Move,
        completed_depth: u32,
    ) -> Vec<Move> {
        let mut variation = vec![root_move.clone()];
        if completed_depth <= 1 {
            return variation;
        }

        let mut position = root.clone();
        if !position.moves().contains(root_move) {
            return variation;
        }
        position.make_move(root_move);
        let mut remaining = completed_depth - 1;
        let mut extensions_left = EXTENSIONS_PER_LINE;

        while remaining > 0 && position.winner.is_none() {
            let tt_hash = position.hash ^ zobrist_extension_budget(extensions_left);
            let Some(mv) = self
                .tt_entry(tt_hash)
                .and_then(|entry| entry.best_move.clone())
            else {
                break;
            };
            if !position.moves().contains(&mv) {
                break;
            }

            let quiet = !position.is_capture(&mv);
            let recapture = matches!(
                mv,
                Move::Motion { to, .. }
                    if !quiet && position.last_move_to == Some(to)
            );
            position.make_move(&mv);
            let commander_attack = commander_threatened(&position, position.side);
            let extend = extensions_left > 0 && (recapture || commander_attack);
            remaining = remaining - 1 + u32::from(extend);
            extensions_left = extensions_left.saturating_sub(u8::from(extend));
            variation.push(mv);
        }

        variation
    }
}

impl Position {
    fn from_snapshot(snapshot: &Snapshot) -> Self {
        let board = compact_board(snapshot);
        let winner = match snapshot.winner {
            Some(WinnerKind::Color { color }) => Some(color),
            _ => None,
        };
        let side = snapshot.turn_seat;
        let last_move_to = None;
        let hash = position_hash(&board, side, last_move_to);
        Self {
            board,
            side,
            winner,
            last_move_to,
            hash,
        }
    }

    fn moves(&self) -> Vec<Move> {
        if self.winner.is_some() {
            Vec::new()
        } else {
            generate_moves(&self.board, Mode::TwoPlayer, self.side)
        }
    }

    fn is_capture(&self, mv: &Move) -> bool {
        matches!(mv, Move::Motion { to, .. } if self.board[*to as usize].is_some())
    }

    fn make_move(&mut self, mv: &Move) -> Undo {
        let previous_side = self.side;
        let previous_winner = self.winner;
        let previous_last_move_to = self.last_move_to;
        let previous_hash = self.hash;
        match *mv {
            Move::Motion {
                from,
                to,
                post_move_steps,
            } => {
                let moving = self.board[from as usize].expect("generated motion has a piece");
                let captured = self.board[to as usize];
                self.set_square(from, None);
                let placed = post_move_steps.map_or(moving, |steps| moving.rotated(steps));
                self.set_square(to, Some(placed));
                self.set_last_move_to(Some(to));
                self.flip_side();
                self.winner = self.derived_winner();
                Undo {
                    mv: mv.clone(),
                    moving,
                    captured,
                    previous_side,
                    previous_winner,
                    previous_last_move_to,
                    previous_hash,
                }
            }
            Move::Rotate { at, steps } => {
                let moving = self.board[at as usize].expect("generated rotation has a piece");
                self.set_square(at, Some(moving.rotated(steps)));
                self.set_last_move_to(None);
                self.flip_side();
                self.winner = self.derived_winner();
                Undo {
                    mv: mv.clone(),
                    moving,
                    captured: None,
                    previous_side,
                    previous_winner,
                    previous_last_move_to,
                    previous_hash,
                }
            }
        }
    }

    fn unmake_move(&mut self, undo: Undo) {
        match undo.mv {
            Move::Motion { from, to, .. } => {
                self.board[from as usize] = Some(undo.moving);
                self.board[to as usize] = undo.captured;
            }
            Move::Rotate { at, .. } => self.board[at as usize] = Some(undo.moving),
        }
        self.side = undo.previous_side;
        self.winner = undo.previous_winner;
        self.last_move_to = undo.previous_last_move_to;
        self.hash = undo.previous_hash;
    }

    fn set_square(&mut self, square: u8, piece: Option<CompactPiece>) {
        if let Some(old) = self.board[square as usize] {
            self.hash ^= zobrist_piece(square, old);
        }
        self.board[square as usize] = piece;
        if let Some(new) = piece {
            self.hash ^= zobrist_piece(square, new);
        }
    }

    fn flip_side(&mut self) {
        self.hash ^= zobrist_side(self.side);
        self.side = opponent(self.side);
        self.hash ^= zobrist_side(self.side);
    }

    fn set_last_move_to(&mut self, square: Option<u8>) {
        if let Some(old) = self.last_move_to {
            self.hash ^= zobrist_last_move_to(old);
        }
        self.last_move_to = square;
        if let Some(new) = square {
            self.hash ^= zobrist_last_move_to(new);
        }
    }

    fn derived_winner(&self) -> Option<Color> {
        let green_out = !self.has_commander(Color::Green) || !self.has_lps(Color::Green);
        let coral_out = !self.has_commander(Color::Coral) || !self.has_lps(Color::Coral);
        if green_out {
            Some(Color::Coral)
        } else if coral_out {
            Some(Color::Green)
        } else {
            None
        }
    }

    fn has_commander(&self, color: Color) -> bool {
        self.board
            .iter()
            .flatten()
            .any(|piece| piece.color == color && matches!(piece.kind, CompactKind::Commander))
    }

    fn has_lps(&self, color: Color) -> bool {
        self.board
            .iter()
            .flatten()
            .any(|piece| piece.color == color && piece.is_lps())
    }
}

#[derive(Clone, Copy)]
struct EvaluationWeights {
    center: i32,
    activity: i32,
    mobility: i32,
    captures: i32,
    own_commander_threat: i32,
    enemy_commander_threat: i32,
}

fn evaluation_weights(style: OpponentStyle) -> EvaluationWeights {
    match style {
        OpponentStyle::Balanced => EvaluationWeights {
            center: 1,
            activity: 3,
            mobility: 2,
            captures: 22,
            own_commander_threat: 650,
            enemy_commander_threat: 760,
        },
        OpponentStyle::Aggressor => EvaluationWeights {
            center: 1,
            activity: 3,
            mobility: 2,
            captures: 30,
            own_commander_threat: 700,
            enemy_commander_threat: 900,
        },
        OpponentStyle::Guardian => EvaluationWeights {
            center: 1,
            activity: 3,
            mobility: 2,
            captures: 18,
            own_commander_threat: 950,
            enemy_commander_threat: 650,
        },
        OpponentStyle::Maneuverer => EvaluationWeights {
            center: 2,
            activity: 5,
            mobility: 4,
            captures: 18,
            own_commander_threat: 720,
            enemy_commander_threat: 700,
        },
        OpponentStyle::Trickster => EvaluationWeights {
            center: 1,
            activity: 4,
            mobility: 3,
            captures: 20,
            own_commander_threat: 720,
            enemy_commander_threat: 880,
        },
    }
}

fn evaluate(position: &Position, style: OpponentStyle) -> i32 {
    if let Some(winner) = position.winner {
        return if winner == position.side { MATE } else { -MATE };
    }
    let weights = evaluation_weights(style);
    let us = position.side;
    let them = opponent(us);
    let mut score = 0;
    for (square, piece) in position
        .board
        .iter()
        .enumerate()
        .filter_map(|(square, cell)| cell.map(|piece| (square as u8, piece)))
    {
        let sign = if piece.controller == us { 1 } else { -1 };
        score += sign * material(piece);
        let rank = square / 9;
        let file = square % 9;
        let distance = (rank as i32 - 4).abs() + (file as i32 - 4).abs();
        score += sign * (12 - distance * 2).max(0) * weights.center;
        score += sign * directional_activity(position, square, piece) * weights.activity;
    }

    let (our_mobility, our_captures) = mobility(position, us);
    let (their_mobility, their_captures) = mobility(position, them);
    score += (our_mobility - their_mobility) * weights.mobility;
    score += (our_captures - their_captures) * weights.captures;
    if commander_threatened(position, us) {
        score -= weights.own_commander_threat;
    }
    if commander_threatened(position, them) {
        score += weights.enemy_commander_threat;
    }
    score
}

fn mobility(position: &Position, color: Color) -> (i32, i32) {
    let moves = generate_moves(&position.board, Mode::TwoPlayer, color);
    let mut unique_motion = Vec::<(u8, u8)>::new();
    let mut captures = Vec::<(u8, u8)>::new();
    for mv in moves {
        if let Move::Motion { from, to, .. } = mv {
            if !unique_motion.contains(&(from, to)) {
                unique_motion.push((from, to));
            }
            if position.board[to as usize].is_some() && !captures.contains(&(from, to)) {
                captures.push((from, to));
            }
        }
    }
    (unique_motion.len() as i32, captures.len() as i32)
}

fn commander_threatened(position: &Position, color: Color) -> bool {
    let Some(target) = position
        .board
        .iter()
        .enumerate()
        .find_map(|(square, cell)| {
            cell.filter(|piece| piece.color == color && piece.is_commander())
                .map(|_| square as u8)
        })
    else {
        return true;
    };
    generate_moves(&position.board, Mode::TwoPlayer, opponent(color))
        .iter()
        .any(|mv| matches!(mv, Move::Motion { to, .. } if *to == target))
}

fn directional_activity(position: &Position, square: u8, piece: CompactPiece) -> i32 {
    let rank = (square / 9) as i8;
    let file = (square % 9) as i8;
    let mut active = 0;
    for (direction, (d_rank, d_file)) in crate::catalog::DIR_DELTA.iter().enumerate() {
        if effective_flags(piece) & (1 << direction) == 0 {
            continue;
        }
        let next_rank = rank + d_rank;
        let next_file = file + d_file;
        if (0..9).contains(&next_rank) && (0..9).contains(&next_file) {
            let to = (next_rank * 9 + next_file) as usize;
            if position.board[to].is_none_or(|other| other.controller != piece.controller) {
                active += 1;
            }
        }
    }
    active
}

fn style_move_bonus(style: OpponentStyle, position: &Position, mv: &Move) -> i32 {
    match style {
        OpponentStyle::Balanced => 0,
        OpponentStyle::Aggressor => {
            if position.is_capture(mv) {
                12
            } else {
                0
            }
        }
        OpponentStyle::Guardian => match mv {
            Move::Rotate { at, .. }
                if position.board[*at as usize].is_some_and(CompactPiece::is_commander) =>
            {
                10
            }
            _ => 0,
        },
        OpponentStyle::Maneuverer => match mv {
            Move::Motion { from, to, .. } => {
                let from_distance = square_center_distance(*from);
                let to_distance = square_center_distance(*to);
                (from_distance - to_distance).clamp(-4, 4) * 2
            }
            Move::Rotate { .. } => 4,
        },
        OpponentStyle::Trickster => match mv {
            Move::Rotate { .. } => 10,
            Move::Motion {
                post_move_steps: Some(_),
                ..
            } => 8,
            Move::Motion { .. } => 0,
        },
    }
}

fn square_center_distance(square: u8) -> i32 {
    let rank = (square / 9) as i32;
    let file = (square % 9) as i32;
    (rank - 4).abs() + (file - 4).abs()
}

fn material(piece: CompactPiece) -> i32 {
    match piece.kind {
        CompactKind::Commander => 8_000,
        CompactKind::Lance(_) => 320,
        CompactKind::Probe(_) => 210,
        CompactKind::Shield => 110,
    }
}

fn opponent(color: Color) -> Color {
    match color {
        Color::Green => Color::Coral,
        Color::Coral => Color::Green,
        Color::Yellow => Color::Blue,
        Color::Blue => Color::Yellow,
    }
}

fn position_hash(board: &CompactBoard, side: Color, last_move_to: Option<u8>) -> u64 {
    let board_hash = board
        .iter()
        .enumerate()
        .filter_map(|(square, piece)| piece.map(|piece| zobrist_piece(square as u8, piece)))
        .fold(zobrist_side(side), |hash, key| hash ^ key);
    last_move_to.map_or(board_hash, |square| {
        board_hash ^ zobrist_last_move_to(square)
    })
}

fn zobrist_piece(square: u8, piece: CompactPiece) -> u64 {
    let kind = match piece.kind {
        CompactKind::Commander => 0,
        CompactKind::Shield => 1,
        CompactKind::Lance(Variant::Heavy) => 2,
        CompactKind::Lance(Variant::Medium) => 3,
        CompactKind::Lance(Variant::Light) => 4,
        CompactKind::Probe(Variant::Heavy) => 5,
        CompactKind::Probe(Variant::Medium) => 6,
        CompactKind::Probe(Variant::Light) => 7,
    };
    let code = square as u64
        | ((piece.color as u64) << 7)
        | ((piece.controller as u64) << 9)
        | ((kind as u64) << 11)
        | ((piece.rot as u64) << 15);
    splitmix64(code ^ 0x504c_4f59_5a4f_4252)
}

fn zobrist_side(side: Color) -> u64 {
    splitmix64(0x5349_4445_0000_0000 ^ side as u64)
}

fn zobrist_last_move_to(square: u8) -> u64 {
    splitmix64(0x4c41_5354_544f_0000 ^ square as u64)
}

fn zobrist_extension_budget(extensions_left: u8) -> u64 {
    splitmix64(0x4558_5445_4e44_0000 ^ extensions_left as u64)
}

fn splitmix64(mut value: u64) -> u64 {
    value = value.wrapping_add(0x9e37_79b9_7f4a_7c15);
    value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^ (value >> 31)
}

fn stable_move_noise(mv: &Move, seed: u32) -> u64 {
    let code = match *mv {
        Move::Motion {
            from,
            to,
            post_move_steps,
        } => from as u64 | ((to as u64) << 7) | ((post_move_steps.unwrap_or(0) as u64) << 14),
        Move::Rotate { at, steps } => 1 << 24 | at as u64 | ((steps as u64) << 7),
    };
    splitmix64(code ^ seed as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::setup::initial_snapshot;

    #[test]
    fn compact_generator_matches_public_generator() {
        let snapshot = initial_snapshot(Mode::TwoPlayer);
        let position = Position::from_snapshot(&snapshot);
        assert_eq!(
            position.moves(),
            crate::moves::legal_moves_generated(&snapshot, Color::Green)
        );
    }

    #[test]
    fn rotation_does_not_create_a_motion_destination() {
        let snapshot = initial_snapshot(Mode::TwoPlayer);
        let mut position = Position::from_snapshot(&snapshot);
        let rotation = position
            .moves()
            .into_iter()
            .find(|mv| matches!(mv, Move::Rotate { .. }))
            .expect("opening has a direction move");
        position.make_move(&rotation);
        assert_eq!(position.last_move_to, None);
    }

    #[test]
    fn styles_add_only_bounded_move_preferences() {
        let snapshot = initial_snapshot(Mode::TwoPlayer);
        let position = Position::from_snapshot(&snapshot);
        let rotation = position
            .moves()
            .into_iter()
            .find(|mv| matches!(mv, Move::Rotate { .. }))
            .expect("opening has a direction move");
        assert_eq!(
            style_move_bonus(OpponentStyle::Balanced, &position, &rotation),
            0
        );
        assert_eq!(
            style_move_bonus(OpponentStyle::Trickster, &position, &rotation),
            10
        );
        assert_eq!(
            style_move_bonus(OpponentStyle::Maneuverer, &position, &rotation),
            4
        );
    }

    #[test]
    fn make_unmake_restores_position_and_hash() {
        let snapshot = initial_snapshot(Mode::TwoPlayer);
        let mut position = Position::from_snapshot(&snapshot);
        let before = position.clone();
        for mv in position.moves().into_iter().take(24) {
            let undo = position.make_move(&mv);
            assert_eq!(
                position.hash,
                position_hash(&position.board, position.side, position.last_move_to)
            );
            position.unmake_move(undo);
            assert_eq!(position.board, before.board);
            assert_eq!(position.side, before.side);
            assert_eq!(position.winner, before.winner);
            assert_eq!(position.last_move_to, before.last_move_to);
            assert_eq!(position.hash, before.hash);
        }
    }

    #[test]
    fn zobrist_distinguishes_piece_variants() {
        let base = CompactPiece {
            color: Color::Green,
            controller: Color::Green,
            kind: CompactKind::Lance(Variant::Heavy),
            rot: 0,
        };
        let medium = CompactPiece {
            kind: CompactKind::Lance(Variant::Medium),
            ..base
        };
        assert_ne!(zobrist_piece(40, base), zobrist_piece(40, medium));
    }

    #[test]
    fn compact_position_matches_reachable_public_positions() {
        use crate::apply::apply_assumed_legal;

        let mut capture_count = 0;
        for initial_seed in 1_u32..=12 {
            let mut seed = initial_seed;
            let mut snapshot = initial_snapshot(Mode::TwoPlayer);
            for _ in 0..60 {
                if snapshot.winner.is_some() {
                    break;
                }
                let mut position = Position::from_snapshot(&snapshot);
                let public = crate::moves::legal_moves_generated(&snapshot, snapshot.turn_seat);
                assert_eq!(position.moves(), public);
                if public.is_empty() {
                    break;
                }
                seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                let captures: Vec<&Move> =
                    public.iter().filter(|mv| position.is_capture(mv)).collect();
                let mv = if captures.is_empty() {
                    public[seed as usize % public.len()].clone()
                } else {
                    capture_count += 1;
                    (*captures[seed as usize % captures.len()]).clone()
                };
                let before = position.clone();
                let undo = position.make_move(&mv);
                let public_next = apply_assumed_legal(&snapshot, &mv, snapshot.turn_seat);
                assert_eq!(position.board, compact_board(&public_next));
                assert_eq!(position.side, public_next.turn_seat);
                assert_eq!(
                    position.winner,
                    public_next.winner.as_ref().and_then(|winner| {
                        match winner {
                            WinnerKind::Color { color } => Some(*color),
                            WinnerKind::Team { .. } => None,
                        }
                    })
                );
                assert_eq!(
                    position.hash,
                    position_hash(&position.board, position.side, position.last_move_to)
                );
                position.unmake_move(undo);
                assert_eq!(position.board, before.board);
                assert_eq!(position.side, before.side);
                assert_eq!(position.winner, before.winner);
                assert_eq!(position.hash, before.hash);
                snapshot = public_next;
            }
        }
        assert!(capture_count > 0);
    }
}
