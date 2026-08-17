use crate::board::{
    colors_for_mode, count_color, has_controlled_lps, has_lps_of_color, has_original_commander,
};
use crate::types::{Color, Mode, Snapshot, Team, WinnerKind};

pub fn team_of(color: Color) -> Team {
    match color {
        Color::Green | Color::Yellow => Team::GreenYellow,
        Color::Coral | Color::Blue => Team::CoralBlue,
    }
}

pub fn partner_of(color: Color) -> Color {
    match color {
        Color::Green => Color::Yellow,
        Color::Yellow => Color::Green,
        Color::Coral => Color::Blue,
        Color::Blue => Color::Coral,
    }
}

pub fn strictly_defeated(snapshot: &Snapshot, color: Color) -> bool {
    match snapshot.mode {
        Mode::TwoPlayer | Mode::Partnership => {
            !has_original_commander(snapshot, color) || !has_lps_of_color(snapshot, color)
        }
        Mode::FourPlayerFfa => {
            !has_original_commander(snapshot, color) || !has_controlled_lps(snapshot, color)
        }
    }
}

pub fn evaluate_winner(snapshot: &Snapshot) -> Option<WinnerKind> {
    match snapshot.mode {
        Mode::TwoPlayer => colors_for_mode(Mode::TwoPlayer)
            .iter()
            .find(|color| strictly_defeated(snapshot, **color))
            .map(|defeated| {
                let winner = colors_for_mode(Mode::TwoPlayer)
                    .iter()
                    .copied()
                    .find(|color| color != defeated)
                    .unwrap_or(Color::Green);
                WinnerKind::Color { color: winner }
            }),
        Mode::FourPlayerFfa => {
            let active: Vec<Color> = colors_for_mode(Mode::FourPlayerFfa)
                .iter()
                .copied()
                .filter(|color| !snapshot.inactive_seats.contains(color))
                .collect();
            if active.len() == 1 {
                Some(WinnerKind::Color { color: active[0] })
            } else {
                None
            }
        }
        Mode::Partnership => {
            let green_yellow_out = strictly_defeated(snapshot, Color::Green)
                && strictly_defeated(snapshot, Color::Yellow);
            let coral_blue_out = strictly_defeated(snapshot, Color::Coral)
                && strictly_defeated(snapshot, Color::Blue);
            if green_yellow_out {
                Some(WinnerKind::Team {
                    team: Team::CoralBlue,
                })
            } else if coral_blue_out {
                Some(WinnerKind::Team {
                    team: Team::GreenYellow,
                })
            } else {
                None
            }
        }
    }
}

pub fn derived_inactive(snapshot: &Snapshot) -> Vec<Color> {
    match snapshot.mode {
        Mode::TwoPlayer => Vec::new(),
        Mode::FourPlayerFfa => colors_for_mode(Mode::FourPlayerFfa)
            .iter()
            .copied()
            .filter(|color| strictly_defeated(snapshot, *color))
            .collect(),
        Mode::Partnership => colors_for_mode(Mode::Partnership)
            .iter()
            .copied()
            .filter(|color| count_color(snapshot, *color) == 0)
            .collect(),
    }
}

pub fn same_side(mode: Mode, a: Color, b: Color) -> bool {
    if a == b {
        return true;
    }
    mode == Mode::Partnership && team_of(a) == team_of(b)
}

pub fn is_friendly(snapshot: &Snapshot, actor: Color, other: &crate::types::Piece) -> bool {
    match snapshot.mode {
        Mode::TwoPlayer | Mode::FourPlayerFfa => other.controller() == actor,
        Mode::Partnership => same_side(Mode::Partnership, actor, other.color()),
    }
}
