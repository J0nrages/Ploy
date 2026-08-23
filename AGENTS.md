# Ploy Agent Instructions

## Start here

Before changing the repository, read these files in order:

1. `Instructions - Ploy (1970 - 3M Games).png` — sole authority for game rules and setup artwork.
2. `docs/implementation/ploy-remaster-execution.md` — canonical product, architecture, work-order, and acceptance contract.
3. `CONTEXT.md` — canonical domain terminology.
4. `docs/adr/0001-single-rules-core.md` — single Rust/WASM core decision.

The scan wins on rules. The execution plan wins on product scope, architecture, repository layout, and workflow unless the user's latest instruction explicitly changes it.

## Execution

- Begin with the next eligible work order whose dependencies have passed. Waves 0–1B are in place; finish the board, online rooms, and acceptance gates.
- Follow each work order's allowed paths and gate. Do not begin downstream waves early.
- Only the integrator edits root manifests, workspace configuration, shared TypeScript configuration, or lockfiles.
- Treat `docs/implementation/ploy-remaster-execution.md` as the only editable plan. `.cursor/plans/ploy_remaster_agents_05627304.plan.md` is a pointer for tool discovery.
- Stop and report a failed mandatory gate. Never create a second rules engine as a workaround.
- Do not run a production deployment or publish changes unless the user explicitly asks.

## Completion

An individual work order is complete only when its stated gate passes. The remaster is complete only when every command and behavioral check in the plan's Final acceptance section passes.

## Cursor Cloud specific instructions

This checkout is the single Ploy remaster repo (`github.com/j0nrages/ploy`). There is no sibling repo to clone. Stay on `main` unless the user names another branch. `origin/3d-and-ui` is a remaster UI branch ahead of `main`. `origin/legacy/pre-remaster` is frozen pre-remaster Python and is not the current product. Ignore `archive/` for remaster work.

Standard install, lint, test, and dev commands live in `README.md`. WASM artifacts are committed; rebuild with `bun run build:wasm` only when changing `crates/ploy-core` or `crates/ploy-wasm`.

### Services

| Service | When | How |
| --- | --- | --- |
| Vite web app | Required for local and online UI | `bun run dev` → `http://localhost:5173` |
| Anonymous Convex | Required only for online rooms | `CONVEX_AGENT_MODE=anonymous bun x convex dev` |
| Tauri desktop | Optional | `bun run dev:desktop` after platform WebKitGTK/pkg-config libs |

Do not run `convex deploy` or publish unless the user asks.

### Convex + Vite gotcha

`convex dev` writes `CONVEX_URL` (local default `http://127.0.0.1:3210`) into the repo-root gitignored `.env.local`. Vite's env root is `apps/web`, and the client only constructs Convex when `VITE_CONVEX_URL` is set, so put that same URL in `apps/web/.env.local` and restart Vite. `convex dev --once` pushes functions and exits; leave `convex dev` running for live rooms. On first configure, decline Convex AI-files setup (`bun x convex ai-files disable` if it prompts). Do not commit `.env.local`, `.convex/`, or CLI-only `convex.json` edits.
