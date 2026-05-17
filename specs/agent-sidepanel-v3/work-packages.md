# Agent Sidepanel v3 — Work Packages

15 PR-sized work packages, derived from six parallel reviewer reports against the merged agent-sidepanel v2 stack. Each WP is the scope of one RALPH-loop implementer subagent; one PR per WP, all targeting `develop`.

## Index

| # | Title | Lane | Status | Depends on | Branch |
| --- | --- | --- | --- | --- | --- |
| WP-1 | StreamDelta codec seam + subprocess dedup | Spine | review (PR [#397](https://github.com/Luis85/specorator/pull/397)) | — | `claude/asv3-wp01-stream-codec-seam` |
| WP-2 | ChatTurnOrchestrator + drop doubled output panel | Store + UX | in-progress | WP-3 ✓ | `claude/asv3-wp02-chat-turn-orchestrator` |
| WP-3 | chatStore → Threads / StreamingTurn / Proposals | Store + UX | **merged** ([#396](https://github.com/Luis85/specorator/pull/396)) | — | `claude/asv3-wp03-chatstore-split` |
| WP-4 | Markdown port as only path + bypass during stream + safeHref tighten | Markdown | queued | — | `claude/asv3-wp04-markdown-hardening` |
| WP-5 | SessionLogWriter O(turn) append + Mirror facade | Log | queued | — | `claude/asv3-wp05-session-log-append` |
| WP-6 | VueSidepanelHost + ReactiveClaudeCliPort + resolve OQ-ASV-3 | Mount | queued | — | `claude/asv3-wp06-mount-unification` |
| WP-7 | A11y P1 wave: live regions, focus, combobox, focus-return, Esc-aborts | Store + UX | queued | WP-3 | `claude/asv3-wp07-a11y-p1-wave` |
| WP-8 | UX polish wave: inline /help, scroll-pin, empty state, Stop, plan persistence, pills, EN strings, ContextFileChip | Store + UX | queued | WP-2 | `claude/asv3-wp08-ux-polish-wave` |
| WP-9 | Security hardening pass | Security | queued | — | `claude/asv3-wp09-security-hardening` |
| WP-10 | Perf: tool-call shallowRef, chunk-array, scroll rAF, mention/slash caches, buffer cap | Perf | queued | WP-2, WP-3 | `claude/asv3-wp10-perf-hardening` |
| WP-11 | ClaudeSubprocessAdapter split (Lifecycle / NdjsonChannel / runStructured) | Spine | queued | WP-1 | `claude/asv3-wp11-subprocess-split` |
| WP-12 | ClaudeCliPort: queryStream-only + lifecycle port | Spine | queued | WP-1 | `claude/asv3-wp12-claudecli-port-cleanup` |
| WP-13 | Test catch-up: secret store, markdown adapter, POs, slash loader edges | Tests | queued | — | `claude/asv3-wp13-test-catchup` |
| WP-14 | ChatThreadsRepository port + domain VO tests | Tests | queued | — | `claude/asv3-wp14-chat-threads-repo` |
| WP-15 | degradedClaudeCliPort → first-class adapter + TurnInputBuilder | Cleanup | queued | WP-2 | `claude/asv3-wp15-degraded-port-and-turninput` |

## Lanes (parallel execution)

```
Spine    : WP-1 ─┬─ WP-11
                 └─ WP-12
Store+UX : WP-3 ── WP-2 ── WP-7
                          \─ WP-8
Markdown : WP-4 (independent)
Log      : WP-5 (independent)
Mount    : WP-6 (independent)
Security : WP-9 (independent)
Perf     : (after WP-2 + WP-3) ── WP-10
Tests    : WP-13, WP-14 (independent)
Cleanup  : WP-15 (last)
```

Five lanes can run concurrently. PM elected to launch the Spine and Store+UX lanes first.

## RALPH loop (uniform across implementers)

Each implementer subagent runs this loop, scoped to its WP folder, until done or stuck:

```
loop:
  1. Read brief.md and loop-state.md from this WP folder.
  2. Pick the next failing check (audit → typecheck → lint → test → build → docs → DoD criterion).
  3. Implement the smallest change that moves one check red→green.
  4. Run the full AGENTS.md §3 pre-PR gate, every iteration, no exemptions:
       npm audit --audit-level=high --omit=dev \
         && npm run typecheck \
         && npm run lint \
         && npm run test \
         && npm run build \
         && npm run build:web \
         && npm run docs:api
  5. Update loop-state.md: what just changed, what remains red, blockers if any.
  6. If all gates green AND all DoD criteria met → commit, push, open PR via gh MCP.
     Else → goto 1.
  Hard cap: 8 loop iterations. If stuck, write a blocker note in loop-state.md and exit.
```

The persistent `loop-state.md` is the RALPH heuristic — it survives subagent context recycling and lets the loop restart cleanly across sessions.

## Lint / coverage audit (2026-05-17)

Ran `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run format:check` against the `develop` HEAD before launching implementers. Findings that don't map cleanly to existing WPs:

**Lint warnings (0 errors, 24 warnings):**

- **`max-lines > 350`** confirms the architecture review's god-module list and adds two new candidates:

  | File | LOC | WP coverage |
  | --- | --- | --- |
  | `src/infrastructure/obsidian/ClaudeSubprocessAdapter.ts` | 902 | WP-11 (subprocess split) |
  | `src/ui/components/chat/ChatSidebar.vue` | 860 | WP-2 (orchestrator extraction) |
  | `src/infrastructure/obsidian/ClaudeCliAdapter.ts` | 459 | WP-1 (codec extraction shrinks it) |
  | **`src/plugin/main.ts`** | **387** | **WP-16 candidate — not yet in any WP** |
  | **`src/core/plugin-core.ts`** | **362** | **WP-17 candidate — orthogonal to v2 work** |
  | `src/ui/components/agent/MarkdownBlock.vue` | 351 | WP-4 (markdown port as only path shrinks it) |
  | `eslint.config.js` | 451 | tooling, out of scope |

- **Fixed in this PR — deprecated `KeyboardEvent.keyCode === 229` IME-guard fallback** in `InlinePlanApprovalCard.vue:107` + `ChatInput.vue:245`. Replaced with a tracked `isImeComposing` ref driven by the W3C `compositionstart` / `compositionend` events on the textarea, combined with `event.isComposing` for first-keydown-of-composition coverage. This is the canonical engineered solution — no deprecated APIs, no `eslint-disable`, no `event.key`/`keyCode` inconsistencies — and explicitly covers Safari's confirm-Enter bug where `event.isComposing === false` while composition is still logically active (compositionend has not yet fired). Regression tests fire `compositionstart` then keydown to simulate that path; a second test pins that Ctrl+Enter works again after `compositionend`.

- **Unused `eslint-disable` directives** — left for the in-flight WP that owns each file to clean up alongside its main refactor:
  - `src/infrastructure/obsidian/ClaudeCliAdapter.ts:111` (`@typescript-eslint/no-require-imports`) → **carry-out for WP-1**
  - `src/plugin/main.ts:270` (`obsidianmd/commands/no-plugin-id-in-command-id`) → **carry-out for WP-6** (mount unification touches this region)

- **`vue/one-component-per-file` + `vue/require-prop-types`** in test files — these are test-helper component patterns (inline `<RouterLink>` stubs). Out of scope; rule already loosened for tests in most repos. Defer.

**Coverage report — all thresholds met:**

| Layer | % Stmts | % Branches | % Funcs | % Lines | Threshold |
| --- | --- | --- | --- | --- | --- |
| All files | 92.21 | 85.66 | 89.39 | 93.5 | 80 / 70 / 80 / 80 |

Low-coverage hotspots that the existing WP list addresses:

- `bridge/degradedClaudeCliPort.ts` — 16.66% stmts → **WP-15** (first-class adapter brings real coverage)
- `mock/MockApprovalPort.ts` — 0% / `localstorage/LocalStorageSecretStore.ts` — 0% / `mock/MockSecretStore.ts` — 58% → **WP-13** (test catch-up)
- `application/chat/SessionLogWriter.ts` — 83.21% stmts → **WP-5** (writer rework adds test surface)

Low-coverage gaps that the WP list does NOT cover yet — added as testing carry-outs to **WP-13**:

- `src/domain/feature/Feature.ts` — 83.33% lines (75% branches) — `activate`/`advanceStep`/`archive` error paths under-tested
- `src/application/feature/AdvanceFeatureStageUseCase.ts` — 85.71% stmts, 71.42% branches — lines 28, 41, 49–58 uncovered

**Format:** `npm run format:check` reports 522 files with Prettier issues — pre-existing across the entire repo (templates, source, tests). Not in the AGENTS.md §3 mandatory pre-PR gate, so not a regression. Flagged for a separate housekeeping PR (out of scope for v3).

### New WP candidates surfaced by the audit

| # | Title | Lane | Trigger |
| --- | --- | --- | --- |
| WP-16 | `src/plugin/main.ts` split — extract chat-handlers, URI handler, command registration, leaf-loader wiring into focused modules | Mount | 387-LOC max-lines warning + sibling of WP-6 |
| WP-17 | `src/core/plugin-core.ts` split — separate module registration, lifecycle, MCP wiring | Cleanup | 362-LOC max-lines warning + orthogonal to v2 work |

These do not block the in-flight Spine / Store-UX lanes; queued behind WP-15.

## Conventions per implementer

- **Branch** — `claude/asv3-wpNN-<slug>`, cut from `origin/develop`.
- **Worktree** — `git worktree add .worktrees/asv3-wpNN -b <branch> origin/develop`.
- **PR** — `feat(asv3): <WP title> (WP-NN)` or `refactor(asv3): …` / `fix(asv3): …` per the change shape. Body cites the reviewer findings the WP closes.
- **Commit prefix** — same as PR title prefix.
- **Tests-mirror layout (ADR-009)** — every new src file gets a co-located test under `tests/`; every Vue mount test gets a co-located PageObject under the same folder.
- **Squash-merge** — one squash commit per WP into `develop`.
- **Do not touch other WPs' files** — if a change feels in another WP's scope, write a note in your loop-state.md and stay in your lane.
