# Agent Sidepanel v3 — Work Packages

15 PR-sized work packages, derived from six parallel reviewer reports against the merged agent-sidepanel v2 stack. Each WP is the scope of one RALPH-loop implementer subagent; one PR per WP, all targeting `develop`.

## Index

| # | Title | Lane | Status | Depends on | Branch |
| --- | --- | --- | --- | --- | --- |
| WP-1 | StreamDelta codec seam + subprocess dedup | Spine | in-progress | — | `claude/asv3-wp01-stream-codec-seam` |
| WP-2 | ChatTurnOrchestrator + drop doubled output panel | Store + UX | queued | WP-3 | `claude/asv3-wp02-chat-turn-orchestrator` |
| WP-3 | chatStore → Threads / StreamingTurn / Proposals | Store + UX | in-progress | — | `claude/asv3-wp03-chatstore-split` |
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
  4. Run the full AGENTS.md §3 pre-PR gate:
       npm audit --audit-level=high --omit=dev \
         && npm run typecheck \
         && npm run lint \
         && npm run test \
         && npm run build \
         && npm run build:web \
         && npm run docs:api
     (`build:web` is required only when the change touches the standalone-web surface or
      shared composables; everything else runs every iteration.)
  5. Update loop-state.md: what just changed, what remains red, blockers if any.
  6. If all gates green AND all DoD criteria met → commit, push, open PR via gh MCP.
     Else → goto 1.
  Hard cap: 8 loop iterations. If stuck, write a blocker note in loop-state.md and exit.
```

The persistent `loop-state.md` is the RALPH heuristic — it survives subagent context recycling and lets the loop restart cleanly across sessions.

## Conventions per implementer

- **Branch** — `claude/asv3-wpNN-<slug>`, cut from `origin/develop`.
- **Worktree** — `git worktree add .worktrees/asv3-wpNN -b <branch> origin/develop`.
- **PR** — `feat(asv3): <WP title> (WP-NN)` or `refactor(asv3): …` / `fix(asv3): …` per the change shape. Body cites the reviewer findings the WP closes.
- **Commit prefix** — same as PR title prefix.
- **Tests-mirror layout (ADR-009)** — every new src file gets a co-located test under `tests/`; every Vue mount test gets a co-located PageObject under the same folder.
- **Squash-merge** — one squash commit per WP into `develop`.
- **Do not touch other WPs' files** — if a change feels in another WP's scope, write a note in your loop-state.md and stay in your lane.
