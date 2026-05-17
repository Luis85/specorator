# WP-17 loop state

Updated by the implementer subagent each RALPH iteration. The brief is `brief.md` in this folder.

> **Worktree context** — All implementation entries below describe work performed on `claude/asv3-wp17-plugin-core-split` inside `.worktrees/asv3-wp17/`. The brief was scaffolded from the main worktree on `claude/improve-sidepanel-chat-8pgcT` (PR #395 era).

## Iterations

### Iteration 1 — full extract + mirror tests + gate green

**Extracted from `src/core/plugin-core.ts` (was 476 LOC):**

- `src/core/module-validation.ts` (73 LOC) — exports `validateModules`, `validateSettingsKeys`, `validateUriActions`. Pure; no port dependencies.
- `src/core/module-topo-sort.ts` (54 LOC) — exports `topoSort(modules)`. Kahn's BFS with the `eslint-disable complexity` directive preserved on the function.
- `src/core/settings-migration.ts` (77 LOC) — exports `migrateSettings(modules, settings, logger)`. Single `LoggerPort` dependency; keeps the `eslint-disable complexity` directive.
- `src/core/mcp-server-lifecycle.ts` (100 LOC) — `McpServerLifecycle` class with `start`, `stop`, `isRunning`, `syncRunning`. Constructor takes `{ port?, isEnabled?, logger }`. Owns the `_syncChain` serial promise chain and the `_running` invariant.

**Modified `src/core/plugin-core.ts` (now 272 LOC; ~211 effective after eslint skipBlankLines/skipComments — well under the 220 target):**

- Imports + delegates to the four new modules.
- `PluginCore` constructor instantiates `McpServerLifecycle` from `ports.mcpServer`, `ports.isMcpServerEnabled`, `ports.logger`.
- `startMcpServer` / `stopMcpServer` / `isMcpServerRunning` delegate to the lifecycle.
- `notifySettingsChanged` calls `mcpLifecycle.syncRunning()`.
- `init` calls `validateModules` → `topoSort` → `migrateSettings` → init modules → `mcpLifecycle.start()`.
- `destroy` calls `mcpLifecycle.stop()` before `core:destroy-complete`.
- Public surface (`bus`, `degradedModules`, `allModules`, `getModuleSettings`, `handleUri`, `notifySettingsChanged`, `isMcpServerRunning`, `startMcpServer`, `stopMcpServer`, `init`, `destroy`) preserved bit-for-bit.

**New mirror tests (55 cases, all green without any port-mock plumbing):**

- `tests/core/module-validation.test.ts` (16 cases) — `validateModules` / `validateSettingsKeys` / `validateUriActions` direct unit tests.
- `tests/core/module-topo-sort.test.ts` (8 cases) — including 2- and 3-cycle detection, diamond dependency, and stable independent ordering.
- `tests/core/settings-migration.test.ts` (13 cases) — covers migrate-success, migrate-throw + fallback, validate-throw + fallback, downgrade no-op, corrupted `_moduleVersions` (string / array / null), missing key.
- `tests/core/mcp-server-lifecycle.test.ts` (18 cases) — start/stop/sync paths, idempotency, gate-closed and undefined-port no-ops, serialised concurrent syncs (start-wins-over-stop and last-enqueued-wins), adapter error logging without instantiating `PluginCore`.

**Existing tests:** `tests/core/plugin-core.test.ts` (78 cases) and `tests/core/plugin-core-mcp.test.ts` (16 cases) all pass without modification — proves the public surface is preserved.

**Pre-PR gate (all green):**

```
npm audit --audit-level=high --omit=dev   ✓ 0 vulnerabilities
npm run typecheck                          ✓
npm run lint                               ✓ 0 errors, 23 warnings (all pre-existing — none on src/core/*)
npm run test                               ✓ 1918 passed (153 files); up from 1863 by exactly +55 (the new tests)
npm run build                              ✓
npm run build:web                          ✓
npm run docs:api                           ✓
```

The `max-lines` warning on `src/core/plugin-core.ts` is **gone**. No new `max-lines` warnings introduced on any extracted file. The remaining `max-lines` warnings (`src/plugin/main.ts`, `MarkdownBlock.vue`, `MessageList.vue`, `ChatSidebar.vue`) and the unused `eslint-disable` on `src/plugin/main.ts:278` are pre-existing and explicitly out of scope (WP-6 / WP-16 territory).

## Carry-out items

_None — all in-scope DoD criteria met._
