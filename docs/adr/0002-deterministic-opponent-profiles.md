# Keep opponent profiles deterministic and inside the local search core

Ploy separates opponent strength from opponent style, uses a game seed and profile revision for repeatable mid-game behavior, and keeps move selection, style evaluation, and balanced referee analysis inside the existing Rust/WASM search core. Adaptive strength is an explicit bounded state machine rather than a remote or learned model so retries, saves, undo, lease failover, and test fixtures remain reproducible without introducing a second engine or network opponent.
