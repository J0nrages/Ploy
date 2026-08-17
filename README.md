# Ploy

A remaster of the 1970 3M Bookshelf game **Ploy**. One Rust rules and two-player lookahead core compiles to a no-import WebAssembly module used by the Vite/React web app, a Tauri 2 desktop shell, and optional anonymous Convex rooms.

The 1970 instruction sheet is the sole rules authority: `Instructions - Ploy (1970 - 3M Games).png`, copied to `docs/rules-sources/ploy-1970-3m-instructions.png`.

## Prerequisites

- [Bun](https://bun.sh) 1.2.22
- Rust stable via [rustup](https://rustup.rs), including `rustfmt`, `clippy`, and `wasm32-unknown-unknown` (`rustup target add wasm32-unknown-unknown`)
- For the desktop shell: Tauri 2 system libraries. On Ubuntu/Debian this currently requires at least `pkg-config`, `libdbus-1-dev`, and WebKitGTK (`libwebkit2gtk-4.1-dev`). `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` stops with the exact missing `.pc` file if a library is absent.

Do not use npm, pnpm, or Yarn.

## Commands

```bash
bun install
bun run build:wasm
bun run dev
bun run test
bun run lint
bun run typecheck
bun run --filter web build
```

Desktop (after the web app builds):

```bash
bun run dev:desktop
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Local Convex rooms (anonymous development only — never `convex deploy` unless you intend production):

```bash
CONVEX_AGENT_MODE=anonymous bun x convex dev
```

Set `VITE_CONVEX_URL` in `.env.local` to enable the online UI. Local play builds and runs with Convex unset.

## How to play

- **Modes:** two-player, four-player free-for-all, and partnership.
- **Local:** every mode is hotseat. Two-player also offers a computer opponent.
- **Online:** anonymous room code / invite only. No accounts. Four-player and partnership seats are human. Two-player hosts may seat a computer opponent; that client runs the Worker and submits through Convex. Convex never searches.
- **Armies:** 15 pieces per two-player color (1 Commander, 6 Lances, 5 Probes, 3 Shields); 9 pieces per four-player color (1 Commander, 2 Lances, 3 Probes, 3 Shields).
- **Computer:** Cadet, Navigator, Commander, and Strategist. Search runs in a module Worker and never blocks the UI thread. A cancelled or failed turn can be resumed; an unacknowledged online submission retries the same move and request ID.
- The computer is conventional node-bounded game-tree lookahead, not a network or generative model.

## Room flow

Create or join a six-character room code. Green/Coral must sit for two-player; all four colors sit otherwise. A two-player host can seat Coral as Cadet through Strategist. A renewable client lease runs that computer; if its owner disappears, another seated human takes over after 45 seconds without running search in Convex. Only the host can start or rematch. A rematch inserts a new game and points `activeGameId` at it.

The board is a 2.5D path network over a moving starfield, not a chess grid.

## Credits

Rules and setup art: 3M Games, *Ploy* (1970). The Rust/WASM opponent adapts the search architecture from [Dr. Thomas Tensi's MIT-licensed Ada Ploy engine](https://tensi.eu/thomas/programming/games/ploy/ploy.html); see `crates/ploy-core/NOTICE` and `crates/ploy-core/TENSI-LICENSE`. It uses this remaster's 1970 rules core, not Tensi's later partnership rules or UI.
