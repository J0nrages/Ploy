# Computer opponent baseline

Captured on 22 August 2026 before Wave 1C changes, using the committed no-import WASM artifact on the initial two-player position.

| Preset | Requested depth | Completed depth | Nodes | Approximate elapsed time |
|---|---:|---:|---:|---:|
| Cadet | 1 | 0 | 1 | 5 ms |
| Navigator | 3 | 2 | 30,000 | 351 ms |
| Commander | 5 | 2 | 100,000 | 1,167 ms |
| Strategist | 6 | 2 | 300,000 | 3,530 ms |

A deterministic twelve-ply Navigator self-play sample completed depths `2, 2, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0`. On the resulting midgame position Navigator completed depth 1, Commander depth 1, and Strategist depth 2. Depth 0 in the pre-Wave-1C engine returned the first generated legal fallback even after consuming the full node budget.

This is a regression baseline, not a strength rating. Wave 1C must eliminate unscored generator-order fallbacks before adding profile variation.
