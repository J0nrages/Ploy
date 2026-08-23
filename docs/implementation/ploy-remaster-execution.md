# Ploy remaster execution contract

## Authority

This is the canonical product, architecture, work-order, and acceptance contract for the public repository. The original 1970 instruction scan is the sole authority for rules and setup artwork. `CONTEXT.md` owns domain terminology. The ADRs record durable architecture decisions.

The user-approved open-core split supersedes earlier plans that placed hosted multiplayer in this repository. Previously published history is not rewritten.

## Product boundary

The public `J0nrages/Ploy` repository is MIT-licensed and owns:

- the Rust rules and search core;
- the no-import WebAssembly ABI and TypeScript adapter;
- computer-opponent profiles and Worker lifecycle;
- the shared board and interaction model;
- all local web modes, saves, undo, rules help, and accessibility;
- the Tauri desktop shell;
- public documentation and acceptance tests for those surfaces.

The private `J0nrages/ploy-online` downstream owns the hosted service. It may merge public `main`, but hosted backend code, online client code, operational configuration, credentials documentation, and hosted-service tests must not flow back into public `main`.

The public menu retains **Play online** as a same-tab navigation to `https://jonathanrdaniels.com/ploy`. Local play must build and run with no hosted-service environment.

## Architecture invariants

1. One Rust core owns legal moves, application, terminal state, and computer search.
2. TypeScript never implements a second rules engine.
3. The committed WASM release artifact has no imports and is used by the browser Worker and desktop webview.
4. Computer search runs off the UI thread and never requires a model or network request.
5. Rules-scan fixtures win over secondary references.
6. Vite supports `PLOY_PUBLIC_BASE=/ploy/` for the deployed subpath.
7. No public build, test, or local-play path depends on the private hosted service.

## Repository layout

```text
crates/ploy-core       Rust rules, evaluation, and search
crates/ploy-wasm       no-import WebAssembly ABI
packages/rules         shared TypeScript facade
packages/ai            Worker and opponent profiles
packages/ui-board      board rendering and interaction
apps/web               unified public local-play UI
apps/desktop           Tauri shell over the web assets
docs                   rules sources, ADRs, and this contract
```

## Work order

### Wave 0 — rules fidelity and fixtures

Encode every rule and setup fact from the instruction scan as Rust fixtures. Gate: formatting, clippy with warnings denied, and native tests.

### Wave 1 — one no-import core

Expose canonical JSON through `ploy-wasm`, commit the generated artifact, and wrap it in `@ploy/rules`. Gate: `bun run wasm-gate` and rules adapter tests.

### Wave 2 — board and local application

Implement the shared board, all local modes, auto-save, undo, rules help, keyboard controls, and responsive HUD. Gate: Bun tests, lint, typecheck, build, and browser smoke.

### Wave 3 — computer opponent

Implement deterministic strength and style profiles, cancellation, diagnostics, and optional adaptive local strength in the Worker-backed core. Gate: native search tests, Bun tests, calibration smoke, and UI responsiveness.

### Wave 4 — desktop

Embed the same built web assets in Tauri without native rule commands. Gate: Cargo check plus a platform launch/package check where prerequisites are available.

### Wave 5 — open-core release

Maintain the hosted-service boundary, public documentation, `/ploy/` production build, and the official-site online navigation. Gate: the final acceptance suite and a source scan proving no private hosted implementation or credentials remain.

## Change flow

Shared rules, AI, board, local UI, and desktop changes land in public `Ploy` first. The private downstream merges public `main` using its `upstream` remote. Hosted-service changes remain private. A conflict is resolved by preserving public core behavior and reapplying only the private overlay.

Only the integrator changes root manifests, shared configuration, lockfiles, release branches, or deployments. Never create a second rules engine to pass a gate. Stop and report a mandatory gate failure.

## Final acceptance

Run from a clean public checkout:

```bash
bun install --frozen-lockfile
bun run wasm-gate
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
bun run test
bun run lint
bun run typecheck
PLOY_PUBLIC_BASE=/ploy/ bun run --filter web build
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Behavioral acceptance:

- all three local modes start and accept legal move/rotation input;
- local saves resume and undo remains deterministic;
- the two-player computer opponent completes a turn without blocking the UI;
- local play works when all hosted-service environment variables are absent;
- `/ploy/` assets load under the production base;
- **Play online** navigates in the same tab to the official hosted application;
- source and dependency scans find no hosted backend, online client implementation, deployment credential, or private-service test;
- desktop check passes when platform prerequisites are installed, or the missing system prerequisite is reported exactly.
