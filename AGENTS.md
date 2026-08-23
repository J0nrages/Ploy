# Ploy Agent Instructions

## Start here

Before changing the repository, read these files in order:

1. `Instructions - Ploy (1970 - 3M Games).png` — sole authority for game rules and setup artwork.
2. `docs/implementation/ploy-remaster-execution.md` — canonical product, architecture, work-order, and acceptance contract.
3. `CONTEXT.md` — canonical domain terminology.
4. `docs/adr/0001-single-rules-core.md` — single Rust/WASM core decision.

The scan wins on rules. The execution plan wins on product scope, architecture, repository layout, and workflow unless the user's latest instruction explicitly changes it.

## Execution

- Begin with the next eligible work order whose dependencies have passed. The public repository owns the rules, AI, board, local web play, and desktop acceptance gates.
- Follow each work order's allowed paths and gate. Do not begin downstream waves early.
- Only the integrator edits root manifests, workspace configuration, shared TypeScript configuration, or lockfiles.
- Treat `docs/implementation/ploy-remaster-execution.md` as the only editable plan. `.cursor/plans/ploy_remaster_agents_05627304.plan.md` is a pointer for tool discovery.
- Stop and report a failed mandatory gate. Never create a second rules engine as a workaround.
- Hosted online play is implemented only in the private downstream repository. Public changes must not add its backend, bearer data, deployment configuration, or tests.
- Do not run a production deployment or publish changes unless the user explicitly asks.

## Completion

An individual work order is complete only when its stated gate passes. The remaster is complete only when every command and behavioral check in the plan's Final acceptance section passes.
