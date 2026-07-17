# CLAUDE.md

## Project Overview

Specorator is an Obsidian plugin that embeds provider-backed chat runtimes in a sidebar and inline-edit flow. Claude is the default, full-feature provider. Codex, Opencode, and Cursor are opt-in and join the same conversation model through `Conversation.providerId` plus provider-owned `providerState`.

## Architecture Status

- Product status: Specorator is a multi-provider product hosting four chat backends.
  - **Claude** is the full-feature provider: send, stream, cancel, resume, history reload, fork, plan mode, image attachments, inline edit, `#` instruction mode, `/` commands, `$` skills, subagents, rewind, MCP management, and Claude plugin integration.
  - **Codex** supports send, stream, cancel, resume, history reload, fork, plan mode, image attachments, inline edit, `#` instruction mode, `$` skills, and subagents. Unsupported or gated surfaces are rewind, runtime-discovered provider commands, in-app MCP management, and Claude plugin integration.
  - **Opencode** runs via the Opencode CLI server and supports send, stream, cancel, resume, history reload, plan mode, image attachments, inline edit, `#` instruction mode, subagents, runtime-discovered slash commands, and Opencode-managed MCP. Plan turns route through Opencode's managed `plan` mode (toolbar toggle / Shift+Tab); when the turn produces assistant content, the runtime sets `planCompleted` and the shared post-plan approval card opens. Fork and rewind are gated.
  - **Cursor** runs over first-party ACP (`agent acp`) and supports send, stream, cancel, resume, history reload, plan mode, images, inline edit, interactive approvals, and in-turn blocking questions/plans. History reload probes ownership-checked ACP SQLite, legacy SQLite, then project JSONL; capture hot-reconciles and deep-redacts JSON; model discovery is CLI-identity scoped and TTL cached. Skills and writable subagents use Cursor-native project/global roots; live async `cursor/task` surfacing, rewind, and in-app MCP management remain gated.
- App shell: `src/app/` owns shared settings defaults and plugin-level storage helpers. `src/core/` owns provider-neutral runtime, registry, tool, and type contracts plus the shared event bus and leveled logger.
- Provider boundary: `src/core/runtime/` and `src/core/providers/` define the chat-facing seam. `ProviderRegistry` creates runtimes and provider-owned auxiliary services. `ProviderWorkspaceRegistry` owns workspace services such as command catalogs, agent mention providers, CLI resolution, MCP managers, and provider settings tabs.
- Shared transport: `src/providers/acp/` packages the Agent Client Protocol JSON-RPC client, subprocess wrapper, session config, tool stream adapter, and update normalizer. Opencode and Cursor both build their runtimes on top of it, each layering a small provider-dialect module for its own extensions: Opencode's permission-mapping helpers, and Cursor's `cursorAcpExtensions` (`cursor/ask_question`, `cursor/create_plan`, `cursor/task`, `cursor/update_todos`).
- Claude adaptor: `src/providers/claude/` owns the Claude runtime, prompt encoding, stream transforms, history hydration, CLI resolution, plugin and agent discovery, MCP storage, and Claude-specific settings UI. `ClaudeCommandCatalog` merges vault commands, vault skills, and runtime-supported commands behind the shared command catalog contract.
- Codex adaptor: `src/providers/codex/` owns the `codex app-server` runtime, JSON-RPC transport, prompt encoding, raw live stream projection, JSONL history reload, settings reconciliation, normalization, skill cataloging, subagent storage, and Codex settings UI. `CodexSkillCatalog` provides `$` skill discovery from `.codex/skills/` and `.agents/skills/` without relying on runtime command discovery.
- Opencode adaptor: `src/providers/opencode/` owns the Opencode runtime, ACP-backed transport, prompt encoding, history hydration, settings reconciliation, mode and model catalogs, command and skill discovery, subagent storage under `.opencode/agent/` (with legacy `.opencode/agents/` fallback), Opencode-managed MCP wiring, and Opencode settings UI.
- Cursor adaptor: `src/providers/cursor/` owns the persistent `agent acp` runtime over the shared ACP stack, Cursor dialect handlers, tool normalization, prompt encoding, settings, and plan-path conventions. History reload uses an ownership-checked ordered chain (ACP SQLite → legacy SQLite → project JSONL); diagnostics capture hot-reconciles on the running process and deep-redacts parsed JSON; model discovery caches per resolved CLI identity with TTL and serialized writes, and rejected model application fails the turn visibly.
- Conversations: `Conversation` carries `providerId` and opaque `providerState`. Claude state is typed behind `ClaudeProviderState`. Codex state is typed behind `CodexProviderState` and stores `threadId`, `sessionFilePath`, and optional fork metadata. Opencode state is typed behind `OpencodeProviderState` and stores an optional `databasePath`. Cursor state is typed behind `CursorProviderState` and stores the Cursor `chatSessionId`.
- Multi-view chat state is leaf-owned: each `SpecoratorView` persists its tab layout through Obsidian view state, while global tab-slot accounting, environment application, conversation quiescing, and work-order routing aggregate every live Specorator leaf.
- Transcript snapshots are conversation-scoped and revisioned; Vue resets window/scroll state on identity changes and rejects stale projections. Work-order terminal snapshots wait for the sidecar ledger writer to drain, and failed note finalization preserves the sidecar with a failure marker.

## Commands

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm run lint:fix
npm run test
npm run test:watch
npm run test:coverage
npm run test:vue        # Vue-surface tests (Vitest lane, tests/vue/)
npm run typecheck:vue   # SFC typecheck (vue-tsc)
npm run check:loc        # LOC ratchet guard (see docs/build-ci/quality-gates.md)
npm run check:css        # CSS !important ratchet guard (see docs/build-ci/quality-gates.md)
npm run check:artifacts  # post-build artifact smoke (run after npm run build)
npm run check:quality    # fallow metric ratchet vs scripts/quality-baseline.json (blocking CI gate)
npm run quality          # fallow: dead-code + dupes + health (advisory detail)
npm run quality:audit    # fallow audit: changed-files review vs main
npm run quality:health   # fallow health: score + hotspots + refactor targets
```

CI gates and the lint severity policy (errors block; warnings are a tracked,
non-blocking backlog) are catalogued in
[`docs/build-ci/quality-gates.md`](docs/build-ci/quality-gates.md).

## Architecture

| Layer | Purpose | Details |
|-------|---------|---------|
| **app** | Shared defaults and plugin-level storage helpers | `defaultSettings`, `SpecoratorSettingsStorage`, `SharedStorageService` |
| **core** | Provider-neutral contracts and infrastructure | See [`src/core/CLAUDE.md`](src/core/CLAUDE.md). Includes `runtime/`, `providers/`, `auxiliary/`, `bootstrap/`, `commands/`, `context/`, `events/`, `logging/`, `mcp/`, `prompt/`, `security/`, `storage/`, `tools/`, `types/` |
| **providers/acp** | Agent Client Protocol shared transport | JSON-RPC client, subprocess wrapper, session config, tool stream adapter, update normalizer |
| **providers/claude** | Claude SDK adaptor | See [`src/providers/claude/CLAUDE.md`](src/providers/claude/CLAUDE.md) |
| **providers/codex** | Codex app-server adaptor | See [`src/providers/codex/CLAUDE.md`](src/providers/codex/CLAUDE.md) |
| **providers/opencode** | Opencode adaptor over ACP | Runtime, prompt encoding, history, settings, modes, models, commands, subagent storage, MCP, settings UI |
| **providers/cursor** | Cursor Agent adaptor over first-party ACP (`agent acp`, not the retired stream-json path) | Persistent runtime, dialect handlers, tool normalization, ownership-checked ACP/legacy/JSONL history, hot-reconciled redacted capture, CLI-identity-scoped model catalog, settings, plan paths. See [`src/providers/cursor/CLAUDE.md`](src/providers/cursor/CLAUDE.md) |
| **features/chat** | Main sidebar interface | Two Vue 3 + Pinia islands (`ui/vue/`, ADR 0005) over the untouched imperative engine (`TabManager`, controllers, `ChatState`, stream state machines): the outer frame (header + tab-badge strip + tab-content host, sub-project 1) AND the per-tab transcript rendering (`MessageRenderer` + block renderers, sub-project 2 — streaming mutates reactive `ChatMessage` data, not DOM; the `.specorator-*` DOM contract is locked by `tests/vue/chat/transcript/domContract.test.ts`). Composer + side panels stay imperative (future sub-projects). See [`src/features/chat/CLAUDE.md`](src/features/chat/CLAUDE.md) |
| **features/inline-edit** | Inline edit modal and provider-backed edit services | `InlineEditModal` plus provider-owned inline edit services. Obsidian-native by decision (ADR 0006) — permanently out of Vue-migration scope, which is why the shared imperative `SlashCommandDropdown` is retained |
| **features/settings** | Settings shell + registry renderer | All seven tabs render through the settings registry (`registry/`, parity tests in `tests/integration/settings/`); provider-owned widgets mount via the `widgets` map on each provider's `settingsTabRenderer`. Obsidian-native by decision (ADR 0006) — permanently out of Vue-migration scope. Legacy imperative renderers remain as fallback until a dedicated deletion pass gated on manual vault verification (no version milestone — ADR 0003 retired the v4.0.0 framing) |
| **features/library** | Unified Library view (Vue 3 island) | `LibraryView` mounts a per-leaf Vue app unconditionally — the `useVueLibrary` flag and the legacy roster/skill/loop views were deleted 2026-07-04 (hard cut, ADR 0003; a stale saved leaf shows Obsidian's empty pane once). Four tabs: Agents, Skills, Loops, and Quick Actions (full management: run/edit/duplicate/favorite/delete). One "Open Library" ribbon (`library-big`); the palette commands `open-library`, `open-agent-roster`, `open-skill-library`, `open-loop-library`, `open-quick-actions` are registrar-path tab deep-links. Pinia stores wrap `LoopNoteStore`/`VaultSkillAggregator`/`AgentRosterStore`/`QuickActionStorage`. Tab switches pass a shared tab guard (`TAB_GUARD_KEY` — a dirty detail editor can veto), and the Pinia stores are reactive projections over the existing source stores (I/O stays in the wrapped stores, never duplicated state). Tests run in the Vitest lane (`npm run test:vue`, `tests/vue/`). Vue surfaces style through the `.specorator-vue` baseline + `--sp-*` tokens (`src/style/vue/`, spec `docs/superpowers/specs/2026-07-03-vue-style-baseline-design.md`); `library.css`/`agent-roster.css` carry only the imperative remnants (editor modals, embedded detail editor). |
| **features/tasks** | Agent Board work orders and run coordination | Board + all three editors are Vue 3 + Pinia islands (`ui/vue/`, ADR 0004) over the unchanged imperative run engine. See [`src/features/tasks/CLAUDE.md`](src/features/tasks/CLAUDE.md) |
| **features/quickActions** | Quick action parsing and storage | Vault-defined quick actions surfaced in chat; managed end-to-end in the Library's Quick Actions tab |
| **shared** | Reusable UI building blocks | Dropdowns, modals, mention UI, icons. Modals and settings helpers are Obsidian-native by decision (ADR 0006 — the Vue island set is closed: Library, Agent Board, chat); already-Vue modal internals (Agent Board editors) are grandfathered, not reverted |
| **i18n** | Internationalization | 10 locales |
| **utils** | Cross-cutting utilities | env, path, markdown, diff, context, file-link, image, browser, canvas, session, subagent helpers |
| **style** | Modular CSS | See [`src/style/CLAUDE.md`](src/style/CLAUDE.md) |

## Tests

```bash
npm run test -- --selectProjects unit
npm run test -- --selectProjects integration
npm run test:coverage -- --selectProjects unit
```

Tests mirror the `src/` layout under `tests/unit/` and `tests/integration/`.

### Performance suite (blocking CI gate since 2026-06-10)

```bash
npm run test:perf                                   # run scaling guard rails + metrics
SPECORATOR_PERF_JSON=perf.jsonl npm run test:perf     # also append trend records
```

`tests/perf/*.perf.test.ts` run via `jest.perf.config.js`, separate from
`npm test` and coverage, and gate CI via the `perf` job. Each spec pairs
deterministic scaling assertions (cost must track a bounded window, not
unbounded input) with a report-only metrics table for long-term trend
tracking; timings are never asserted, which is what makes the suite gateable
on noisy shared runners.

Current coverage, by user-visible path:

| Spec | Guards | Scales with |
|------|--------|-------------|
| `toolCallIndex.perf` | streaming tool lookup stays O(1)/chunk | tools per turn |
| `claudeHistory.perf` | `filterActiveBranch` stays ~linear | transcript length |
| `codexHistory.perf` | `parseCodexSessionContent` stays ~linear | transcript length |
| `conversationHistory.perf` | history-dropdown DOM growth (windowed) + `loadConversations` load/sort | conversation count |
| `navigationSidebar.perf` | prev/next scan stays O(mounted), bounded by render window | mounted messages |
| `taskRunCoordinator.perf` | launch validation stays O(1) vs active runs; drain pass bounded by slot cap × runnable, not board size | active runs / runnable cards |
| `multiTabStreaming.perf` | per-tab pending frames stay constant per flush; one tab's render work independent of other tabs | concurrent streaming tabs |

> The Agent Board render/heartbeat scaling guard (formerly `agentBoard.perf`)
> moved to the Vue component lane as `tests/vue/tasks/agentBoardScaling.test.ts`
> when the board became a Vue island: mounted DOM/listeners stay O(rendered
> cards), and one heartbeat updates exactly one `LiveStrip`. The engine's own
> scaling stays here in `taskRunCoordinator.perf`.
>
> The transcript render scaling guard (formerly `messageRenderer.perf`) moved
> to the Vue component lane as `tests/vue/chat/transcript/transcriptScaling.test.ts`
> when the transcript became a Vue island (ADR 0005 sub-project 2): mounted
> `.specorator-message` count stays ≤ `RENDER_WINDOW_SIZE`, and one stream
> mutation re-renders exactly one message (siblings keep node identity). The
> Jest perf lane stubs `.vue`/`mountTranscript`, so it can no longer mount a
> real transcript; `navigationSidebar.perf` (scans `.specorator-message-user`)
> and `multiTabStreaming.perf` stay here in the Jest perf lane.

## Storage

| Path | Contents |
|------|----------|
| `.claude/settings.json` | Claude Code-compatible project settings, permissions, and plugin overrides |
| `.specorator/specorator-settings.json` | Shared Specorator app settings plus provider-specific configuration |
| `.claude/mcp.json` | Specorator-managed MCP servers for Claude |
| `.claude/commands/**/*.md` | Claude slash commands |
| `.claude/skills/*/SKILL.md` | Claude vault skills (editable) |
| `~/.claude/skills/*/SKILL.md` | Claude user (global) skills — discovered read-only (view/run only; host-absolute path, outside the vault). Warm chat dropdown remains SDK-owned per `loadUserSettings` |
| `.claude/agents/*.md` | Claude vault agents |
| `.specorator/sessions/*.meta.json` | Provider-neutral session metadata |
| `.specorator/runs/<runId>/heartbeat.json` | Per-run sidecar heartbeat (`{ at, status, pauseReason? }`) — moved off the work-order note to avoid racing the agent's `Edit` tool; GC'd at terminal |
| `.specorator/runs/<runId>/ledger.jsonl` | Per-run sidecar ledger (stable entry IDs, serialized batch appends, deduping reads) — snapshotted only after writer drain at terminal |
| loop folder (default `Agent Board/loops/*.md`) | Loop definitions (`type: specorator-loop`): reusable playbooks (Use when / Approach / Steps / Verify / Notes) attachable to a work order or template |
| quick-actions folder (default `Quick Actions/*.md`, `quickActionsFolder` setting) | Quick action notes; managed via the Library's Quick Actions tab and the chat modal |
| `.codex/skills/*/SKILL.md` | Codex vault skills |
| `.agents/skills/*/SKILL.md` | Alternate Codex vault skill root |
| `~/.codex/skills/*/SKILL.md` (+ system/admin scopes) | Codex user (global) skills — app-server-discovered via `skills/list`, surfaced read-only (view/run only) |
| `.codex/agents/*.toml` | Codex vault subagent definitions |
| `.cursor/skills/*/SKILL.md` | Cursor vault (project) skills — editable in the Library's in-place editor (view/run/edit/clone/delete); Cursor owns authoring so there is no in-settings skill manager |
| `~/.cursor/skills/*/SKILL.md`, `~/.agents/skills/*/SKILL.md` | Cursor user (global) skills — discovered read-only (host-absolute, outside the vault) |
| `.cursor/agents/*.md` | Cursor vault subagent definitions (markdown frontmatter) |
| `~/.claude/projects/{vault}/*.jsonl` | Claude-native transcripts |
| `~/.codex/sessions/**/*.jsonl` | Codex-native transcripts |

> Provider API keys, MCP auth headers, and MCP env vars persist via Obsidian `SecretStorage` (keychain-backed), not in vault config files. Substrate: `src/core/security/secretStore.ts`, `secretIds.ts`, `src/core/mcp/mcpSecrets.ts`. Requires `minAppVersion` 1.11.5.

## Development Notes

- **Provider-native first**: Prefer the official Claude SDK and Codex app-server behavior over reimplementing provider features locally. When the provider already owns a capability, adapt to it instead of shadowing it.
- **Runtime exploration**: For provider integrations, inspect real runtime output first. Claude data lands under `~/.claude/` and Codex data under `~/.codex/`. Real transcripts beat guessed event shapes. Put throwaway local scripts and raw runtime captures in `.context/`; only promote durable tooling into `dev/`.
- **Comments**: Comment why, not what. Avoid narration and redundant JSDoc.
- **Clean code & refactoring**: Behavior-preserving cleanups follow [`docs/build-ci/clean-code-refactoring.md`](docs/build-ci/clean-code-refactoring.md) — small reversible steps, extract over rewrite, characterization tests before touching thin-coverage code, and locking improved metrics into the ratchet baselines in the same PR.
- **TDD workflow**: For new behavior or bug fixes, write the failing test first in the mirrored `tests/` path, make it pass, then refactor.
- Run `npm run typecheck && npm run lint && npm run test && npm run build` after editing.
- No `console.*` in production code.
- No `innerHTML`/`outerHTML`/`insertAdjacentHTML` in `src/` (lint-enforced via `no-restricted-syntax`). Build DOM with Obsidian `createEl`/`createDiv`/`createSpan`/`setText`/`.empty()`, and render markdown/agent content through `MarkdownRenderer`.
- **Docs vs `.context/`**: Durable design notes, plans, ADRs, handoffs, research, and reviews live under `docs/` as Markdown with YAML frontmatter (`title`, `date`, `status`, `scope`). ADRs go in `docs/adr/`, design specs in `docs/superpowers/specs/` and implementation plans in `docs/superpowers/plans/`, product specs in `docs/product/`, ideas in `docs/ideas/`, handoffs in `docs/handoffs/`, research in `docs/research/`, and reviews in `docs/reviews/`. `.context/` is for **throwaway only**: local scripts, raw patches, runtime captures, scratch notes that should never be committed or referenced as canonical. If a `.context/` file is worth keeping, promote it to `docs/` with proper frontmatter.
