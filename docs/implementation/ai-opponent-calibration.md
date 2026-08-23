# Computer opponent calibration

Captured on 23 August 2026 after the opponent-profile and adaptive-strength implementation. This document records reproducible engineering evidence; it does not assign Elo ratings or claim Chess.com-equivalent playing strength.

## Automated gates

The standard native suite now verifies:

- All public strength shapes use increasing search effort and stay within their controlled-error ceiling.
- Multiple Cadet seeds produce more than one legal opening choice while every choice remains inside the scored error bound.
- A fixed reachable neutral position produces a different Maneuverer/Trickster choice from Balanced.
- Aggressor capture preference and Guardian Commander-rotation preference are explicitly bounded.
- Every style still takes an immediate forced win.
- Existing avoid-loss, terminal-win, purposeful-rotation, Shield-combination, interruption, and deterministic-retry fixtures remain green.

The web suite separately verifies opening, forced-move, low-choice, and incomplete-analysis exclusions; four-sample evidence; one-step bounds; four-move cooldown; undo reconstruction; save migration; and Worker timeout recovery.

## Adjacent-strength self-play smoke

Run from the repository root:

```bash
PLOY_CALIBRATION_PLIES=16 cargo run --release -p ploy-core --example calibrate
```

Configuration: product depth/node/error budgets, Balanced style, deterministic seed `20260823`, 16-ply cap, and colors swapped for each adjacent pair.

| Pair | Stronger color | Winner | Material lead for stronger | Stronger average depth | Weaker average depth |
| --- | --- | --- | ---: | ---: | ---: |
| Navigator vs Cadet | Green | Unfinished | 0 | 2.00 | 0.00 |
| Navigator vs Cadet | Coral | Unfinished | 0 | 1.62 | 0.00 |
| Commander vs Navigator | Green | Unfinished | 10 | 1.62 | 0.88 |
| Commander vs Navigator | Coral | Unfinished | 110 | 1.50 | 1.00 |
| Strategist vs Commander | Green | Unfinished | -220 | 1.62 | 1.12 |
| Strategist vs Commander | Coral | Unfinished | 420 | 2.00 | 1.38 |

All stronger profiles completed deeper search on average. Commander led Navigator materially with both colors in this short sample. Strategist–Commander results were color-sensitive, and no 16-ply game reached a winner. This is evidence of computational separation, not yet stable human-facing rating separation.

## Product conclusion

- Keep the public names Cadet, Navigator, Commander, and Strategist.
- Do not publish numerical ratings yet.
- Keep automatic adaptation local-only and labeled Experimental.
- Treat short material leads as diagnostics, not strength proof.
- Before publishing ratings, run longer games across multiple seeds, swap colors, track terminal results and repetition, and include human play review.

The release-mode example is intentionally outside the normal fast test suite so product budgets can be measured without adding minutes to every developer test run.
