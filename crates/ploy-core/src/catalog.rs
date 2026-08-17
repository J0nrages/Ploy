use crate::types::{Piece, Variant};

pub const COMMANDER_MASK: u8 = 0x55;
pub const LANCE_HEAVY_MASK: u8 = 0x83;
pub const LANCE_MEDIUM_MASK: u8 = 0x45;
pub const LANCE_LIGHT_MASK: u8 = 0x92;
pub const PROBE_HEAVY_MASK: u8 = 0x03;
pub const PROBE_MEDIUM_MASK: u8 = 0x05;
pub const PROBE_LIGHT_MASK: u8 = 0x11;
pub const SHIELD_MASK: u8 = 0x01;

/// Rank/file deltas clockwise from north. Rank 0 is Green's back row; north increases rank.
pub const DIR_DELTA: [(i8, i8); 8] = [
    (1, 0),
    (1, 1),
    (0, 1),
    (-1, 1),
    (-1, 0),
    (-1, -1),
    (0, -1),
    (1, -1),
];

pub fn rol8(bits: u8, rot: u8) -> u8 {
    bits.rotate_left((rot % 8) as u32)
}

pub fn base_flags(piece: &Piece) -> u8 {
    match piece {
        Piece::Commander { .. } => COMMANDER_MASK,
        Piece::Shield { .. } => SHIELD_MASK,
        Piece::Lance {
            variant: Variant::Heavy,
            ..
        } => LANCE_HEAVY_MASK,
        Piece::Lance {
            variant: Variant::Medium,
            ..
        } => LANCE_MEDIUM_MASK,
        Piece::Lance {
            variant: Variant::Light,
            ..
        } => LANCE_LIGHT_MASK,
        Piece::Probe {
            variant: Variant::Heavy,
            ..
        } => PROBE_HEAVY_MASK,
        Piece::Probe {
            variant: Variant::Medium,
            ..
        } => PROBE_MEDIUM_MASK,
        Piece::Probe {
            variant: Variant::Light,
            ..
        } => PROBE_LIGHT_MASK,
    }
}

pub fn range(piece: &Piece) -> u8 {
    match piece {
        Piece::Commander { .. } | Piece::Shield { .. } => 1,
        Piece::Probe { .. } => 2,
        Piece::Lance { .. } => 3,
    }
}

pub fn effective_flags(piece: &Piece) -> u8 {
    rol8(base_flags(piece), piece.rot().get())
}

pub fn popcount(bits: u8) -> u32 {
    bits.count_ones()
}

pub fn canonical_rotation_steps(piece: &Piece) -> Vec<u8> {
    let base = base_flags(piece);
    let current = effective_flags(piece);
    let mut best = [0u8; 256];
    let mut seen = [false; 256];
    for steps in 1..=7 {
        let mask = rol8(base, piece.rot().get().wrapping_add(steps) % 8);
        if mask == current {
            continue;
        }
        let idx = mask as usize;
        if !seen[idx] {
            seen[idx] = true;
            best[idx] = steps;
        }
    }
    let mut steps: Vec<u8> = seen
        .iter()
        .enumerate()
        .filter_map(|(idx, used)| used.then_some(best[idx]))
        .collect();
    steps.sort_unstable();
    steps
}

pub fn with_rotation(piece: &Piece, steps: u8) -> Piece {
    let rot = (piece.rot().get() + steps) % 8;
    match piece.clone() {
        Piece::Commander {
            id,
            color,
            controller,
            ..
        } => Piece::Commander {
            id,
            color,
            controller,
            rot: crate::types::Rotation::from_checked(rot),
        },
        Piece::Shield {
            id,
            color,
            controller,
            ..
        } => Piece::Shield {
            id,
            color,
            controller,
            rot: crate::types::Rotation::from_checked(rot),
        },
        Piece::Lance {
            id,
            color,
            controller,
            variant,
            ..
        } => Piece::Lance {
            id,
            color,
            controller,
            variant,
            rot: crate::types::Rotation::from_checked(rot),
        },
        Piece::Probe {
            id,
            color,
            controller,
            variant,
            ..
        } => Piece::Probe {
            id,
            color,
            controller,
            variant,
            rot: crate::types::Rotation::from_checked(rot),
        },
    }
}

pub fn with_controller(piece: &Piece, controller: crate::types::Color) -> Piece {
    match piece.clone() {
        Piece::Commander { id, color, rot, .. } => Piece::Commander {
            id,
            color,
            controller,
            rot,
        },
        Piece::Shield { id, color, rot, .. } => Piece::Shield {
            id,
            color,
            controller,
            rot,
        },
        Piece::Lance {
            id,
            color,
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
            id,
            color,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Color, Rotation};

    fn commander(rot: u8) -> Piece {
        Piece::Commander {
            id: "green:commander".into(),
            color: Color::Green,
            controller: Color::Green,
            rot: Rotation::from_checked(rot),
        }
    }

    #[test]
    fn masks_popcounts_and_ranges() {
        let cases: [(&str, u8, u32, u8); 8] = [
            ("C", COMMANDER_MASK, 4, 1),
            ("LH", LANCE_HEAVY_MASK, 3, 3),
            ("LM", LANCE_MEDIUM_MASK, 3, 3),
            ("LL", LANCE_LIGHT_MASK, 3, 3),
            ("PH", PROBE_HEAVY_MASK, 2, 2),
            ("PM", PROBE_MEDIUM_MASK, 2, 2),
            ("PL", PROBE_LIGHT_MASK, 2, 2),
            ("S", SHIELD_MASK, 1, 1),
        ];
        for (name, mask, bits, dist) in cases {
            assert_eq!(popcount(mask), bits, "{name} popcount");
            assert!(dist <= 3);
        }
        assert_eq!(range(&commander(0)), 1);
        assert_eq!(
            range(&Piece::Lance {
                id: "x".into(),
                color: Color::Green,
                controller: Color::Green,
                variant: Variant::Heavy,
                rot: Rotation::from_checked(0),
            }),
            3
        );
    }

    #[test]
    fn commander_has_two_distinct_orientations() {
        assert_eq!(canonical_rotation_steps(&commander(0)), vec![1]);
        assert_eq!(canonical_rotation_steps(&commander(1)), vec![1]);
        assert_eq!(effective_flags(&commander(0)), COMMANDER_MASK);
        assert_eq!(effective_flags(&commander(1)), rol8(COMMANDER_MASK, 1));
        assert_eq!(effective_flags(&commander(2)), COMMANDER_MASK);
    }
}
