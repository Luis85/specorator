# WP-17 — `src/core/plugin-core.ts` split (module registration / lifecycle / MCP wiring)

**Branch:** `claude/asv3-wp17-plugin-core-split` (cut from `origin/develop`)
**Lane:** Cleanup (orthogonal to v2 work)
**Estimated size:** medium (~400–550 LOC moved across new files; behaviour-preserving refactor; existing tests largely point at the same surface)

## Goal (one sentence)

Split the 476-LOC `src/core/plugin-core.ts` (audit recorded 362 LOC; file has grown since) into three focused modules along the boundaries already implicit in the code — `module-validation.ts` + `module-topo-sort.ts` (registration/validation), `settings-migration.ts` (per-module migration + validation), and `mcp-server-lifecycle.ts` (start/stop + sync) — leaving `plugin-core.ts` as a thin orchestrator of those three plus the existing module init/destroy lifecycle.

## Problem statement

`src/core/plugin-core.ts` (476 LOC, lint `max-lines > 350` warning per the 2026-05-17 audit) carries four conceptually independent concerns inside one file:

1. **Module validation** (`validateUriActions`, `validateSettingsKeys`, `validateModules` — lines 30–82). Pure functions that inspect the module descriptor array. No dependencies on `CorePorts`. Pure data validation.
2. **Module topological sort** (`topoSort` — lines 85–125). Kahn's BFS; pure function. No `CorePorts` dependency.
3. **Settings migration** (`migrateSettings` — lines 128–183). Per-module schema migration + validation with fall-back to defaults. Depends on `LoggerPort` only.
4. **Module lifecycle** (`PluginCore` class — lines 187+: `init`, `destroy`, `initModule`, `notifySettingsChanged`). Owns the module init/destroy ordering, the event bus, the leak-map, the URI dispatch map, and the settings-changed reconciliation.
5. **MCP server lifecycle** — woven into the `PluginCore` class: `_mcpRunning`, `_syncChain`, `_doSyncMcpRunning`, `startMcpServer`, `stopMcpServer`, `isMcpServerRunning`. Tangentially related to (4) (init triggers an auto-start, destroy triggers a stop) but otherwise independent.

The audit identified (1)+(2) and (3) and (5) as the three natural split points. The implementation has accreted because each concern was added incrementally with a clear seam already visible in the code. Splitting along those seams produces three files under 200 LOC each plus a slimmer `plugin-core.ts` (~200 LOC) that delegates.

## Scope — IN

**New `src/core/module-validation.ts`** (~100 LOC):

- Exports `validateModules(modules)`, `validateUriActions(modules)`, `validateSettingsKeys(modules)`. Pure; no `CorePorts`.

**New `src/core/module-topo-sort.ts`** (~50 LOC):

- Exports `topoSort(modules): ModuleDescriptor[]`. Pure; preserves the existing `// eslint-disable complexity` (Kahn's BFS is irreducible).

**New `src/core/settings-migration.ts`** (~80 LOC):

- Exports `migrateSettings(modules, settings, logger): void`. Takes `LoggerPort` (single port dep) so it stays pure of `CorePorts` aggregate.

**New `src/core/mcp-server-lifecycle.ts`** (~120 LOC):

- Exports an `McpServerLifecycle` class with `start()`, `stop()`, `isRunning()`, `syncRunning()` and the `_syncChain` debounce.
- Constructor takes `{ port?: ObsidianMcpServerPort, isEnabled?: () => boolean, logger: LoggerPort, bus: EventBus }`. The `_doSyncMcpRunning` body moves here verbatim.
- `PluginCore.notifySettingsChanged` calls `mcpLifecycle.syncRunning()` instead of `_doSyncMcpRunning`.
- `PluginCore.init` calls `mcpLifecycle.start()` after `core:init-complete`.
- `PluginCore.destroy` calls `mcpLifecycle.stop()` before `core:destroy-complete`.

**Modified `src/core/plugin-core.ts`** (target ≤ 220 LOC):

- Imports + re-exports from the four new modules.
- `PluginCore` class delegates the four concerns; its body shrinks to: constructor + event bus wiring + `init` (calls validate → topoSort → migrate → init modules → start MCP) + `destroy` + `initModule` + `notifySettingsChanged`.

**Tests follow the source.** Each new file gets its own mirror test under `tests/core/`. The existing `tests/core/plugin-core.test.ts` shrinks: tests that exercised the now-extracted helpers (validation, topo, migration, MCP sync) move to the new files. Tests of `PluginCore`'s end-to-end behaviour (init→degraded module path→destroy) stay.

## Scope — OUT

- The `ModuleDescriptor` shape — stable (ADR-010).
- `EventBus` mechanics — stable (ADR-011).
- The MCP server PORT interface (`ObsidianMcpServerPort`) — stable.
- `LoggerPort` filtering — stable.
- Adding new module-system features (e.g. lazy module init, hot-reload) — out of scope.
- The unused `eslint-disable` directive at `src/plugin/main.ts:270` (`obsidianmd/commands/no-plugin-id-in-command-id`) — **explicit carry-out for WP-6** per the audit. DO NOT touch in this WP.
- Splitting `src/plugin/main.ts` — that's the WP-16 candidate flagged in the audit. DO NOT touch here.
- Any module's `init`/`destroy` implementation — only `PluginCore`'s shape changes, not how modules behave.

## Approach

1. **Iteration 1 — extract pure modules.** Move `validateModules` + helpers to `module-validation.ts`. Move `topoSort` to `module-topo-sort.ts`. Move `migrateSettings` to `settings-migration.ts`. Update `plugin-core.ts` to import + re-export so external import paths don't break.
2. **Iteration 2 — extract `McpServerLifecycle`.** Move `_mcpRunning`, `_syncChain`, `_doSyncMcpRunning`, `startMcpServer`, `stopMcpServer`, `isMcpServerRunning` to the new class. Wire from `PluginCore.init` / `destroy` / `notifySettingsChanged`.
3. **Iteration 3 — relocate tests.** Move existing test cases for the extracted helpers into mirror files under `tests/core/`. Keep `tests/core/plugin-core.test.ts` for the end-to-end behaviour.
4. **Iteration 4 — verify `max-lines` warning gone.** Run lint; confirm `plugin-core.ts` ≤ 220 LOC; each new file ≤ 150 LOC. No new `max-lines` warning introduced.
5. **Run the full pre-PR gate every iteration.**

## Deliverables

**New files:**

- `src/core/module-validation.ts` + `tests/core/module-validation.test.ts`.
- `src/core/module-topo-sort.ts` + `tests/core/module-topo-sort.test.ts`.
- `src/core/settings-migration.ts` + `tests/core/settings-migration.test.ts`.
- `src/core/mcp-server-lifecycle.ts` + `tests/core/mcp-server-lifecycle.test.ts`.

**Modified files:**

- `src/core/plugin-core.ts` — shrinks to thin orchestrator (target ≤ 220 LOC).
- `tests/core/plugin-core.test.ts` — tests for extracted helpers move out; end-to-end tests stay.
- Any importer of the now-extracted helpers (likely only `src/core/plugin-core.ts` itself, but verify across `src/plugin/main.ts` and any test).

**Deleted (no back-compat shims, per CLAUDE.md):**

- The extracted function bodies inside `plugin-core.ts`. No re-export from `plugin-core` for the extracted helpers — consumers import from the new file paths. (If a re-export is needed transiently for the migration commit, it lands in the same commit that removes it — no dangling re-exports.)

## Definition of done

- [ ] `npm audit --audit-level=high --omit=dev` clean.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` 0 errors; `max-lines` warning on `src/core/plugin-core.ts` is **gone** (file ≤ 350, target ≤ 220 LOC); no new `max-lines` warning on any extracted file.
- [ ] `npm run test` passes; each new module's mirror test ≥ 90% statements/branches.
- [ ] `npm run build` + `npm run build:web` succeed.
- [ ] `npm run docs:api` succeeds.
- [ ] `npm run test:coverage` thresholds maintained or improved.
- [ ] **Public surface unchanged**: `PluginCore` class signature (`init`, `destroy`, `notifySettingsChanged`, `startMcpServer`, `stopMcpServer`, `isMcpServerRunning`, `bus`) stays identical. Verified by a smoke test asserting the export shape.
- [ ] **MCP lifecycle isolated**: `mcp-server-lifecycle.test.ts` exercises start / stop / sync paths without instantiating `PluginCore` — proves the seam holds.
- [ ] **Validation pure**: `module-validation.test.ts` and `module-topo-sort.test.ts` pass without any port mocks.
- [ ] PR opened against `develop`, title `refactor(asv3): plugin-core.ts split — validation / topo / migration / mcp (WP-17)`, body cites the audit's 362-LOC max-lines warning.

## Risks / known unknowns

`McpServerLifecycle`'s `_syncChain` is a serial promise chain — moving it preserves the `_doSyncMcpRunning` ordering invariant (each enqueued reconciliation re-reads `isMcpServerEnabled()` fresh). Write a deterministic test for the chain: enqueue two `syncRunning()` calls with conflicting `isEnabled()` returns, assert the second one wins. The MCP port may be `undefined` (test-only branch); preserve the existing `port === undefined → no-op` behaviour. The migration of `migrateSettings` keeps its `// eslint-disable complexity` directive on the function declaration in the new file — don't drop it.

The `core:init-complete` and `core:destroy-complete` event payloads (`degradedCount`, `leakCount`) must stay identical — these are observed by tests AND by external observers. Verify with a snapshot test of the event envelopes before and after the split.

## RALPH iteration template

```
loop:
  1. Read brief.md + loop-state.md.
  2. Pick the next failing check (audit → typecheck → lint → test → build → docs → DoD).
  3. Implement the smallest change that moves one check red→green.
     STAY IN SCOPE — no module-system feature additions, no main.ts split (WP-16),
     no carry-out for WP-6 (`src/plugin/main.ts:270` eslint-disable).
  4. Run from inside .worktrees/asv3-wp17:
       npm audit --audit-level=high --omit=dev \
         && npm run typecheck && npm run lint && npm run test \
         && npm run build && npm run build:web && npm run docs:api
  5. Update loop-state.md.
  6. If all gates green AND all DoD met → commit, push, open PR via gh.
     Else → goto 1.
  Hard cap: 10 RALPH iterations.
```

## Conventions

- **Worktree:** `.worktrees/asv3-wp17` (already created, branch `claude/asv3-wp17-plugin-core-split`).
- **Commits:** conventional, squash on merge. Prefix `refactor(asv3):`.
- **PR target:** `develop`. Ready for review.
- **Do not touch:** `src/plugin/main.ts` (that's WP-16 candidate territory), `src/plugin/main.ts:270` unused `eslint-disable` (WP-6 carry-out), `ModuleDescriptor`, `EventBus`, `ObsidianMcpServerPort`.
- **Coordinate with WP-14** (chat-threads repo). Both touch `src/plugin/main.ts` LOC indirectly (WP-14 removes the persistence helper; WP-17 doesn't touch `main.ts` at all). Should be conflict-free.
- **Never** push to `develop`. Never force-push.
