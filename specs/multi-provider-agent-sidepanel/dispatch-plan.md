---
id: DISPATCH-MPS-001
title: "Multi-provider agent sidepanel — RALPH-loop dispatch plan"
feature: multi-provider-agent-sidepanel
stage: tasks
status: draft
owner: planner
inputs:
  - TASKS-MPS-001
  - SPEC-MPS-001
created: 2026-05-21
updated: 2026-05-21
---

# Dispatch plan — Multi-provider agent sidepanel

This document specifies how the 156 tasks in `tasks.md` are dispatched to parallel subagent worktrees under a RALPH (red→green→refactor) loop.

The dispatch model is **sequential prefix → six-way fan-out → integration**:

```
WS-1 ─► WS-2 ─► WS-3 ─┬─► WS-4 ─┐
                       ├─► WS-5 ─┤
                       ├─► WS-6 ─┼─► WS-10 (integration) ─► PR → develop
                       ├─► WS-7 ─┤
                       ├─► WS-8 ─┤
                       └─► WS-9 ─┘
```

WS-7 has an internal dependency on WS-6 task T-MPS-074 (thread-store extensions); the WS-7 subagent may begin WS-6's PR-review handoff once T-MPS-074 has merged to the WS-6 integration branch — no need to wait for the full WS-6 closeout.

---

## Worktree and branch conventions

| WS | Branch | Worktree path |
|---|---|---|
| WS-1 | `feature/mps-ws-1-rename-port` | `.worktrees/mps-ws-1-rename-port/` |
| WS-2 | `feature/mps-ws-2-provider-selection` | `.worktrees/mps-ws-2-provider-selection/` |
| WS-3 | `feature/mps-ws-3-selector-wiring` | `.worktrees/mps-ws-3-selector-wiring/` |
| WS-4 | `feature/mps-ws-4-cursor-api` | `.worktrees/mps-ws-4-cursor-api/` |
| WS-5 | `feature/mps-ws-5-cursor-cli` | `.worktrees/mps-ws-5-cursor-cli/` |
| WS-6 | `feature/mps-ws-6-multi-thread` | `.worktrees/mps-ws-6-multi-thread/` |
| WS-7 | `feature/mps-ws-7-message-actions` | `.worktrees/mps-ws-7-message-actions/` |
| WS-8 | `feature/mps-ws-8-status-modes-model-attach` | `.worktrees/mps-ws-8-status-modes-model-attach/` |
| WS-9 | `feature/mps-ws-9-inline-approvals` | `.worktrees/mps-ws-9-inline-approvals/` |
| WS-10 | `feature/mps-integration` | `.worktrees/mps-integration/` |

All branches cut from `develop` (WS-1, WS-2, WS-3) or from the immediate predecessor's tip (WS-4..WS-9 from `feature/mps-ws-3-selector-wiring` after T-MPS-035 lands; WS-10 from the merge of WS-4..WS-9).

Squash-merge on close. Delete branch + worktree post-merge.

---

## Sync points

| # | Event | Trigger task | Effect |
|---|---|---|---|
| S1 | WS-1 closes | T-MPS-008 | WS-2 may start |
| S2 | WS-2 closes | T-MPS-027 | WS-3 may start |
| S3 | WS-3 closes (selector live, ccs-parity green) | T-MPS-035 | WS-4, WS-5, WS-6, WS-8, WS-9 may start in parallel |
| S4 | WS-6 thread store extensions land | T-MPS-074 | WS-7 may start |
| S5 | All six fan-out branches merged to develop | T-MPS-053, 066, 083, 095, 131, 143 | WS-10 may start |
| S6 | Integration verify green | T-MPS-155 | Open final PR to develop (T-MPS-156) |

---

## Per-workstream subagent prompts

Each prompt below is self-contained for dispatch to a `dev` (or `qa` for test-only) subagent. The agent operates in the named worktree, reads `tasks.md` for the listed task IDs, and runs `npm run verify` before each commit.

---

### WS-1 prompt — Rename `ClaudeCliPort` → `ChatTransportPort`

```
ROLE: dev
BRANCH: feature/mps-ws-1-rename-port (cut from develop)
WORKTREE: .worktrees/mps-ws-1-rename-port/
TASKS: T-MPS-001 .. T-MPS-008 (inclusive, in order)
INPUTS: specs/multi-provider-agent-sidepanel/{spec.md §2.1, design.md §C2}
SCOPE:
- File ADR-MPS-001 at decisions/ADR-MPS-001-rename-claude-cli-port.md per template.
- Author failing lint tests (T-MPS-002, T-MPS-003) BEFORE renames.
- Rename src/domain/ports/ClaudeCliPort.ts → ChatTransportPort.ts. Rename
  the five exported types per spec §2.1 table. Add the two new error codes
  ATTACHMENT_TOO_LARGE and PROVIDER_UNAVAILABLE.
- Write scripts/codemod/rename-claude-cli-port.mjs; idempotent; --dry-run.
- Run codemod across src/ and tests/.
- Rename CLAUDE_CLI_PORT → CHAT_TRANSPORT_PORT in bridge/ports.ts.
- Rename composable; keep a one-release re-export shim at the old path.
- Author eslint-rules/no-legacy-claude-cli-port-names.mjs and wire it into
  eslint.config.mjs.
- Append WS-1 closeout entry to implementation-log.md and a hand-off note
  to workflow-state.md.
DO NOT:
- Touch ProviderSelection, ProviderRegistry, Cursor adapters, or UI stores
  — those are WS-2+.
- Add the new StreamDelta variants (tool-result, todo-update, citation) —
  WS-8 owns those.
DOD:
- T-MPS-002, T-MPS-003 pass.
- npm run verify green.
- Open PR to develop, title "feat(mps): rename ClaudeCliPort to ChatTransportPort (WS-1)".
- Squash-merge once review accepted.
EXIT: hand control to WS-2 lead.
```

---

### WS-2 prompt — `ProviderSelection`, `ProviderRegistry`, migration

```
ROLE: dev
BRANCH: feature/mps-ws-2-provider-selection (cut from develop AFTER WS-1 merged)
WORKTREE: .worktrees/mps-ws-2-provider-selection/
TASKS: T-MPS-009 .. T-MPS-027 (inclusive, in order)
INPUTS: specs/multi-provider-agent-sidepanel/{spec.md §§2.2–2.7, §3; design.md §§C3, C5, C6, C7}
SCOPE:
- File ADR-MPS-002 at decisions/ADR-MPS-002-provider-selection-discriminator.md.
- Implement domain types in order with TDD: ProviderSelection.ts,
  ProviderCapabilities.ts, ProviderRegistry.ts (interface only).
- Extend ChatThreadRecord with title (default ''), forkParent (default null),
  transport: { provider, mode }.
- Update PluginSettings: remove transportKind, add the six new fields with
  defaults from spec §2.7.
- Implement migrateProviderSelection.ts as a pure, idempotent function.
  Tests cover all four legacy transportKind values, both legacy
  ChatThreadRecord.transport values, idempotency, and malformed-record
  error capture.
- Wire migration into plugin/main.ts onload AFTER loadData() and BEFORE
  any adapter wiring.
- Integration test on three fixture data.json files (auto, api-key,
  subscription).
DO NOT:
- Touch TransportSelector or buildProviderRegistry — that's WS-3.
- Touch any UI components or stores.
- Implement Cursor adapters.
DOD: all WS-2 tests green; npm run verify green; ccs-parity suite still passes;
implementation-log entry + workflow-state hand-off to WS-3.
EXIT: hand control to WS-3 lead.
```

---

### WS-3 prompt — `TransportSelector` reshape + `buildProviderRegistry` + plugin wiring

```
ROLE: dev
BRANCH: feature/mps-ws-3-selector-wiring (cut from develop AFTER WS-2 merged)
WORKTREE: .worktrees/mps-ws-3-selector-wiring/
TASKS: T-MPS-028 .. T-MPS-035
INPUTS: specs/multi-provider-agent-sidepanel/{spec.md §4; design.md §C4 (truth table), §C11}
SCOPE:
- Author 15-row parameterised truth-table test BEFORE implementation.
- Rewrite src/plugin/transport/TransportSelector.ts to the new signature
  per spec §4. Synchronous, no I/O, first-match-wins.
- Implement src/plugin/transport/buildProviderRegistry.ts. Adapter
  references stay in the plugin layer; the registry returns metadata only.
- Add PROVIDER_REGISTRY_KEY to src/infrastructure/bridge/ports.ts.
- New composable useProviderRegistry.
- Wire selector + registry into plugin/main.ts. The Cursor adapter slots
  are filled with TEMPORARY stubs returning degraded — WS-4/WS-5 replace
  them later.
- Critical gate: run ccs-parity regression suite (T-MPS-034). Halt on red.
DO NOT:
- Implement Cursor API or CLI adapters.
- Touch UI stores other than the new useProviderRegistry composable.
DOD: ccs-parity green; npm run verify green; PR merged; workflow-state hand-off
to six parallel WS leads with the fan-out notice.
EXIT: WS-4, WS-5, WS-6, WS-8, WS-9 all start NOW; WS-7 waits on WS-6 T-MPS-074.
```

---

### WS-4 prompt — Cursor API adapter + Secret Storage + settings UX

```
ROLE: dev
BRANCH: feature/mps-ws-4-cursor-api (cut from feature/mps-ws-3-selector-wiring HEAD)
WORKTREE: .worktrees/mps-ws-4-cursor-api/
TASKS: T-MPS-036 .. T-MPS-053
INPUTS: specs/multi-provider-agent-sidepanel/{spec.md §§5, 2.1, 2.5; design.md §§C8, C12 (ADR-MPS-003)}
SCOPE:
- File ADR-MPS-003 at decisions/ADR-MPS-003-cursor-provider-secret-storage.md.
- Run research spike T-MPS-037 first; document outcome in
  specs/multi-provider-agent-sidepanel/research-cursor-api.md. If CQ-MPS-01
  remains open, keep cursorApiPreview defaulted to false and inject the
  base-URL constant via buildProviderRegistry.
- Add SECRET_ID_CURSOR to src/domain/ports/SecretStorePort.ts.
- TDD-author isAvailable truth table, late-key-read test, SSE event-mapping
  fixtures, no-key-in-logs test, attachment cap test.
- Implement src/infrastructure/cursor/CursorApiAdapter.ts per spec §5.
  Inject fetch. Never log key/body/headers.
- Implement Mock + co-located fake under tests/__fakes__.
- Implement src/ui/components/settings/CursorKeyField.vue (available +
  unavailable variants) with PageObject.
- Wire CursorKeyField + cursorApiPreview toggle + autoPreferProvider
  dropdown into Settings.
- E2E leakage test: post-save data.json contains zero matches for the key
  value.
- Replace WS-3 stub in buildProviderRegistry with the real adapter.
DO NOT:
- Touch CursorCliAdapter or CursorBinaryResolver — that's WS-5.
- Touch any thread/message/status-panel UI.
DOD: all WS-4 tests green; cursor-key-leakage test green; PR merged.
COORDINATION: WS-4 and WS-5 both touch src/plugin/transport/buildProviderRegistry.ts
and src/plugin/main.ts. Rebase WS-4 onto WS-5 (or vice versa) before merge,
whichever lands second. Conflict expected in availability projector.
```

---

### WS-5 prompt — Cursor CLI adapter + `CursorBinaryResolver`

```
ROLE: dev
BRANCH: feature/mps-ws-5-cursor-cli (cut from feature/mps-ws-3-selector-wiring HEAD)
WORKTREE: .worktrees/mps-ws-5-cursor-cli/
TASKS: T-MPS-054 .. T-MPS-066
INPUTS: specs/multi-provider-agent-sidepanel/{spec.md §6; design.md §C9}
SCOPE:
- TDD: posix resolve test, win32 resolve test, relative-path rejection,
  lint test that no ~/.cursor credential paths appear.
- Implement src/infrastructure/obsidian/CursorBinaryResolver.ts mirroring
  ClaudeBinaryResolver. 5s timeout. settings.cursorCliPath override.
- Pure src/infrastructure/obsidian/buildCursorSubprocessArgs.ts.
- Implement src/infrastructure/obsidian/CursorCliAdapter.ts mirroring
  ClaudeSubprocessAdapter shape (SubprocessLifecycle + NdjsonChannel).
- Implement Mock + fake under tests/__fakes__.
- Replace WS-3 stub in buildProviderRegistry; wire startup in main.ts.
DO NOT:
- Touch the Cursor API adapter, Settings UI, or any UI store.
DOD: WS-5 tests green; npm run verify green; PR merged.
COORDINATION: see WS-4 note about availability-projector conflict.
```

---

### WS-6 prompt — Multi-thread switcher UI

```
ROLE: dev
BRANCH: feature/mps-ws-6-multi-thread (cut from feature/mps-ws-3-selector-wiring HEAD)
WORKTREE: .worktrees/mps-ws-6-multi-thread/
TASKS: T-MPS-067 .. T-MPS-083
INPUTS: specs/multi-provider-agent-sidepanel/{spec.md §§7.x (thread store implied via §2.6, §8.1), 8.1; design.md §§A1 Flow 3, B1, A4}
SCOPE:
- TDD: chatThreadsStore actions (create, tab-cap, rename, default title,
  delete, fork, active-restore). One test file per action.
- Implement chatThreadsStore extensions per spec §2.6 record shape.
  NB: signal "T-MPS-074 merged" milestone to the WS-7 lead.
- TDD + implement ThreadTab.vue with PageObject (data-testids per spec §8.1).
- TDD + implement ThreadTabStrip.vue. Arrow-key nav (NFR-MPS-009).
  100ms render budget with 10 threads (NFR-MPS-005).
- ConfirmDeleteThreadModal subclass of Obsidian Modal — no native confirm.
- Mount ThreadTabStrip in AgentSidepanelRoot + AgentSidepanelHeader.
DO NOT:
- Touch MessageActions / per-message UI — that's WS-7.
- Touch StatusPanel / ChatInput modes — that's WS-8.
- Touch ApprovalCard — that's WS-9.
DOD: all WS-6 tests green; perf test green; PR merged.
HANDOFF: when T-MPS-074 lands, post a comment on the WS-7 tracking issue
naming the SHA so WS-7 can branch from that point even before WS-6 closes.
```

---

### WS-7 prompt — Per-message actions

```
ROLE: dev
BRANCH: feature/mps-ws-7-message-actions
  (cut from feature/mps-ws-6-multi-thread AT T-MPS-074 commit SHA — see WS-6 handoff)
WORKTREE: .worktrees/mps-ws-7-message-actions/
TASKS: T-MPS-084 .. T-MPS-095
INPUTS: specs/multi-provider-agent-sidepanel/{spec.md §8.3; design.md §§A1 Flows 4-5}
SCOPE:
- TDD: MessageActions.vue — Copy emits + writes clipboard; aria-label per
  action (NFR-MPS-008); Regenerate visible only for latest assistant;
  controls disabled while streaming (TST-MPS-18).
- TDD + implement messagesStore.removeLatestAssistant + truncateAfter.
- Wire Regenerate → orchestrator re-dispatch with resumeSessionId.
- Wire Edit → ChatInput repopulation + transcript truncation + re-dispatch.
DO NOT:
- Touch ThreadTabStrip or chatThreadsStore.
- Add bang/instruction modes — WS-8.
DOD: WS-7 tests green; npm run verify green; PR merged.
REBASE: rebase onto develop after WS-6 closes.
```

---

### WS-8 prompt — Status panel + modeline modes + model selector + attachments + provider menu

```
ROLE: dev
BRANCH: feature/mps-ws-8-status-modes-model-attach (cut from feature/mps-ws-3-selector-wiring HEAD)
WORKTREE: .worktrees/mps-ws-8-status-modes-model-attach/
TASKS: T-MPS-096 .. T-MPS-131
INPUTS: specs/multi-provider-agent-sidepanel/{spec.md §§7.2, 7.3, 7.4, 8.6, 2.1 (StreamDelta extensions); design.md §§A1 Flows 1, 6, 7, B1, A4}
SCOPE — five sub-batches (run in parallel where the dependency graph allows):
1. STATUS PANEL: statusPanelStore + StatusPanel.vue + TodoList + BashHistoryList.
   Adds StreamDelta variants tool-result, todo-update, citation
   (additive — do NOT change existing variants).
2. MODELINE MODES: chatInputModeStore + ChatInput Shift+Tab + ! / # prefix
   detection + aria-live + ModeIndicators.vue + ChatTurnOrchestrator
   forwarding (planMode → --permission-mode plan; #-content → systemPromptSuffix).
3. SLASH-COMMAND DROPDOWN: enrich with ProviderRegistry.getProvider().slashCommands().
4. MODEL SELECTOR + PROVIDER MENU: ModelSelector hidden when models empty.
   ProviderBadge + ProviderMenu with disabled-row reasons.
   chatProviderStore (validates against ProviderRegistry).
   Perf test: provider switch ≤ 200 ms on 100-message thread (NFR-MPS-004).
5. ATTACHMENTS: attachmentsStore size-cap; AttachmentStrip.vue paste +
   drag-drop; ChatTurnOrchestrator threads attachments into options.
DO NOT:
- Touch ApprovalCard or approval rules — WS-9.
- Touch ThreadTabStrip / MessageActions.
- Add bang-bash OS dispatch (NG7).
DOD: all sub-batch tests green; perf budgets green; PR merged.
COORDINATION: WS-8 may produce LARGE PR. Use the "may slice" annotation on
T-MPS-100 (StreamDelta extensions). The five sub-batches MAY be opened as
five sequential PRs against this branch if size becomes a review hazard.
```

---

### WS-9 prompt — Inline approvals

```
ROLE: dev
BRANCH: feature/mps-ws-9-inline-approvals (cut from feature/mps-ws-3-selector-wiring HEAD)
WORKTREE: .worktrees/mps-ws-9-inline-approvals/
TASKS: T-MPS-132 .. T-MPS-143
INPUTS: specs/multi-provider-agent-sidepanel/{spec.md §§7.5, 8.4; design.md §A1 Flow 8}
SCOPE:
- TDD: approvalRulesStore — glob + bash-prefix matching; persistence.
- Implement ApprovalRule type and approvalRulesStore.
- TDD + implement ApprovalCard.vue (three buttons, default focus on Deny,
  data-testids per spec §8.4).
- Wire ChatTurnOrchestrator approveTool callback → ApprovalCard via
  MessageList. Auto-resolve on findMatching hit.
- Settings: ApprovalRulesList.vue with Remove action (REQ-MPS-047).
- Delete legacy InlinePlanApprovalCard component (no callers must remain).
DO NOT:
- Touch any other store or component outside the approval flow.
DOD: WS-9 tests green; npm run verify green; PR merged.
```

---

### WS-10 prompt — Integration, parity, release prep

```
ROLE: dev (with qa support)
BRANCH: feature/mps-integration (cut from develop AFTER WS-4..WS-9 all merged)
WORKTREE: .worktrees/mps-integration/
TASKS: T-MPS-144 .. T-MPS-156
INPUTS: all preceding workstreams + spec.md §§9, 10, 11; release criteria.
SCOPE:
- T-MPS-144: ensure all six WS branches are merged. Resolve conflicts in
  main.ts, AgentSidepanelHeader.vue, ChatInput.vue, MessageList.vue,
  buildProviderRegistry.ts.
- T-MPS-145: integration test for provider switch mid-stream (spec §10 row 1).
- T-MPS-146: URI handler with ?provider= query param.
- T-MPS-147: specorator:switch-provider command palette entry.
- T-MPS-148: extend i18n forbidden-terms test (NFR-MPS-011).
- T-MPS-149: adapter startup/shutdown lifecycle parity across all four adapters.
- T-MPS-150: mock-adapter shape parity test.
- T-MPS-151: full @ccs-parity regression — release G7 gate.
- T-MPS-152: cursor-key-leak regex grep against fixtures.
- T-MPS-153: 1.11.3 / 1.11.4 settings smoke.
- T-MPS-154: docs/sink.md update + glossary entries.
- T-MPS-155: full `npm run verify`. MUST be green.
- T-MPS-156 (sre): open PR feature/mps-integration → develop. Draft
  release-notes.md. Reference ADR-MPS-001/002/003 and the six WS PRs.
DOD: PR opened against develop; verify gate green; all release criteria
ticked in spec.md §Release criteria. Hand off to reviewer.
```

---

## RALPH-loop posture per task

Every task in `tasks.md` is intentionally ≤ ½ day. The intra-task loop for
implementation tasks (🔨) is:

1. **Red**: run the upstream 🧪 task's test — assert it fails for the right reason.
2. **Green**: write the minimum code to flip the test green.
3. **Refactor**: rename, extract, dedupe. Re-run the test.
4. **Verify**: `npm run verify` green on the branch.
5. **Commit**: conventional commit referencing the REQ-MPS / NFR-MPS ID.
6. **Push**: open or update the workstream PR.

For 🧪 test-first tasks:

1. Write the test as specified in the task DoD.
2. Assert it fails on the unimplemented branch (red proof — capture in
   the implementation-log line).
3. Push. The implementation task is now unblocked.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| WS-4 & WS-5 both touch `buildProviderRegistry.ts` and `main.ts` | Coordinated rebase; second-to-merge owns conflict resolution. |
| WS-8 size — five sub-batches | Allow up to five sub-PRs against `feature/mps-ws-8-...`; final squash on close. |
| Research spike T-MPS-037 lands `cursorApiPreview` defaulted false | Acceptable; v1 ships with the flag off and the Cursor CLI is the primary `provider='cursor'` surface. |
| WS-7 starts before WS-6 closes | WS-7 cuts from the specific T-MPS-074 commit SHA; if WS-6 force-pushes the WS-7 lead must rebase. |
| `@ccs-parity` regression (T-MPS-034 / T-MPS-151) catches a behaviour drift in WS-3 | Halt fan-out; root-cause on WS-3 branch before opening WS-4..WS-9. |
| Adapter-lifecycle tests (T-MPS-149) reveal `shutdown()` is async on Cursor adapters | NFR-MPS-007 requires sync `shutdown`; fix on whichever WS introduced the async leak before WS-10 closes. |

---

## Status

This dispatch plan is regenerable from `tasks.md`. If a task is added or
renumbered, the matching subagent prompt and the dependency graph in
`tasks.md` must be updated together.
