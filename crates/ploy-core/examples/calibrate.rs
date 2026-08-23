use ploy_core::{
    apply_move, choose_move_with_profile, controller_for_turn, create_game, Color, Mode,
    OpponentStyle, Snapshot, WinnerKind,
};

#[derive(Clone, Copy)]
struct Strength {
    name: &'static str,
    depth: u32,
    nodes: u64,
    score_loss: i32,
}

const STRENGTHS: [Strength; 4] = [
    Strength {
        name: "Cadet",
        depth: 1,
        nodes: 250,
        score_loss: 160,
    },
    Strength {
        name: "Navigator",
        depth: 3,
        nodes: 30_000,
        score_loss: 40,
    },
    Strength {
        name: "Commander",
        depth: 5,
        nodes: 100_000,
        score_loss: 12,
    },
    Strength {
        name: "Strategist",
        depth: 6,
        nodes: 300_000,
        score_loss: 0,
    },
];

#[derive(Default)]
struct SearchStats {
    moves: u64,
    depth: u64,
    nodes: u64,
    score_loss: i64,
}

struct GameResult {
    winner: Option<Color>,
    material_delta: i32,
    green: SearchStats,
    coral: SearchStats,
    plies: u32,
}

fn turn_seed(game_seed: u32, ply: u32, strength: Strength) -> u32 {
    let mut value = game_seed ^ ply.wrapping_add(1).wrapping_mul(0x9e37_79b1);
    value ^= strength.nodes as u32;
    value ^= value >> 16;
    value = value.wrapping_mul(0x7feb_352d);
    value ^ (value >> 15)
}

fn play_game(
    green_strength: Strength,
    coral_strength: Strength,
    game_seed: u32,
    max_plies: u32,
) -> GameResult {
    let mut snapshot = create_game(Mode::TwoPlayer);
    let mut green = SearchStats::default();
    let mut coral = SearchStats::default();
    while snapshot.winner.is_none() && snapshot.ply < max_plies {
        let color = controller_for_turn(&snapshot)
            .unwrap()
            .expect("active game has a controller");
        let strength = if color == Color::Green {
            green_strength
        } else {
            coral_strength
        };
        let result = choose_move_with_profile(
            &snapshot,
            color,
            strength.depth,
            strength.nodes,
            turn_seed(game_seed, snapshot.ply, strength),
            OpponentStyle::Balanced,
            strength.score_loss,
        )
        .expect("calibration search must produce a move");
        let stats = if color == Color::Green {
            &mut green
        } else {
            &mut coral
        };
        stats.moves += 1;
        stats.depth += result.depth as u64;
        stats.nodes += result.nodes;
        stats.score_loss += result.score_loss as i64;
        snapshot = apply_move(&snapshot, &result.mv, color).expect("search move must be legal");
    }
    GameResult {
        winner: snapshot.winner.as_ref().and_then(|winner| match winner {
            WinnerKind::Color { color } => Some(*color),
            WinnerKind::Team { .. } => None,
        }),
        material_delta: material(&snapshot, Color::Green) - material(&snapshot, Color::Coral),
        green,
        coral,
        plies: snapshot.ply,
    }
}

fn material(snapshot: &Snapshot, color: Color) -> i32 {
    snapshot
        .board
        .iter()
        .flatten()
        .flatten()
        .filter(|piece| piece.color() == color)
        .map(|piece| match piece {
            ploy_core::Piece::Commander { .. } => 8_000,
            ploy_core::Piece::Lance { .. } => 320,
            ploy_core::Piece::Probe { .. } => 210,
            ploy_core::Piece::Shield { .. } => 110,
        })
        .sum()
}

fn average(total: u64, count: u64) -> f64 {
    if count == 0 {
        0.0
    } else {
        total as f64 / count as f64
    }
}

fn average_i64(total: i64, count: u64) -> f64 {
    if count == 0 {
        0.0
    } else {
        total as f64 / count as f64
    }
}

fn main() {
    let max_plies = std::env::var("PLOY_CALIBRATION_PLIES")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(24);
    println!("# Ploy adjacent-strength calibration");
    println!("\nDeterministic seed 20260823, {max_plies}-ply cap, colors swapped.\n");
    println!("| Pair | Stronger color | Winner | Material lead for stronger | Stronger avg depth | Weaker avg depth | Stronger avg nodes | Weaker avg nodes | Stronger avg loss | Weaker avg loss | Plies |");
    println!("| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for pair in STRENGTHS.windows(2) {
        let weaker = pair[0];
        let stronger = pair[1];
        for stronger_color in [Color::Green, Color::Coral] {
            let (green_strength, coral_strength) = if stronger_color == Color::Green {
                (stronger, weaker)
            } else {
                (weaker, stronger)
            };
            let result = play_game(green_strength, coral_strength, 20_260_823, max_plies);
            let winner = match result.winner {
                Some(Color::Green) => "Green",
                Some(Color::Coral) => "Coral",
                _ => "Unfinished",
            };
            let material_for_stronger = if stronger_color == Color::Green {
                result.material_delta
            } else {
                -result.material_delta
            };
            let (stronger_stats, weaker_stats) = if stronger_color == Color::Green {
                (&result.green, &result.coral)
            } else {
                (&result.coral, &result.green)
            };
            println!(
                "| {} vs {} | {:?} | {} | {} | {:.2} | {:.2} | {:.0} | {:.0} | {:.1} | {:.1} | {} |",
                stronger.name,
                weaker.name,
                stronger_color,
                winner,
                material_for_stronger,
                average(stronger_stats.depth, stronger_stats.moves),
                average(weaker_stats.depth, weaker_stats.moves),
                average(stronger_stats.nodes, stronger_stats.moves),
                average(weaker_stats.nodes, weaker_stats.moves),
                average_i64(stronger_stats.score_loss, stronger_stats.moves),
                average_i64(weaker_stats.score_loss, weaker_stats.moves),
                result.plies,
            );
        }
    }
}
