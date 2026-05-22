---
id: c2d3e4f5-a6b7-4c89-d012-e3f4a5b6c7d8
feature: "Multi-provider agent sidepanel (Claudian parity + Cursor)"
area: MPS
slug: multi-provider-agent-sidepanel
current_stage: release-notes
status: active
last_updated: 2026-05-22
last_agent: dev
createdAt: 2026-05-21T00:00:00+02:00
updatedAt: 2026-05-22T00:00:00+02:00
artifacts:
  idea: complete
  research: skipped
  requirements: complete
  design: complete
  spec: complete
  tasks: complete
  implementation-log: complete
  test-plan: pending
  test-report: pending
  review: pending
  release-notes: complete
  retrospective: pending
predecessors:
  - claude-cli-chat-sidebar    # REQ-CCS-001..028 superseded / extended
  - agent-sidepanel-v3         # current AgentSidepanelView baseline
---

## Stage progress

| Stage | Status | Artifact | Notes |
|---|---|---|---|
| 1 — Idea | complete | `idea.md` | Authored by architect; pm sign-off pending review |
| 2 — Research | skipped | — | Authoritative Claudian analysis + current-state report supplied as upstream input |
| 3 — Requirements | complete | `requirements.md` | 47 EARS REQs (REQ-MPS-001..047), 14 NFRs (NFR-MPS-001..014) |
| 4 — Design | complete | `design.md` | Parts A (UX), B (UI), C (Architecture); 3 inline ADR drafts |
| 5 — Specification | complete | `spec.md` | Implementation-ready interfaces, data shapes, edge cases, 9 workstreams |
| 6 — Tasks | complete | `tasks.md`, `dispatch-plan.md` | 156 tasks across 10 workstreams (WS-1..WS-9 + WS-10 integration); TDD-ordered; per-workstream subagent prompts in dispatch-plan.md |
| 7 — Implementation | complete | `implementation-log.md` | WS-1..WS-10 merged on `develop` (tip `79d692c`). All 156 tasks accounted for in the implementation log. |
| 8 — Testing | folded into WS-10 verify | — | `npm run verify` green at integration tip; per-workstream test surfaces logged in `implementation-log.md`. |
| 9 — Review | pending | — | |
| 10 — Release | drafted | `release-notes.md` | Drafted at WS-10 closeout. Awaits release-manager sign-off. |
| 11 — Retrospective | pending | `retrospective.md` (stub) | Stub placed; formal retro is human-driven. |

## Blocks

None at spec stage. Three ADRs (rename `ClaudeCliPort`, provider×mode discriminator, Cursor provider with Secret Storage) must be filed in `decisions/` before any rename PR lands — flagged in design.md §C.ADR.

## Hand-off notes

| Date | From | To | Note |
|---|---|---|---|
| 2026-05-21 | architect | planner | spec.md complete. 9 workstreams identified for parallel decomposition (rename, Cursor API adapter, multi-thread UI, per-message actions, status panel, modeline modes, model selector, attachments, settings). REQ-MPS-001..047 and NFR-MPS-001..014 covered. Three open clarifications routed to planner — see below. |
| 2026-05-21 | planner | dev | tasks.md complete: 156 tasks (T-MPS-001..T-MPS-156) across 10 workstreams. WS-1→WS-2→WS-3 sequential; WS-4..WS-9 parallel fan-out from WS-3 tip; WS-10 final integration. First ready task: **T-MPS-001** (file ADR-MPS-001 for the `ClaudeCliPort` → `ChatTransportPort` rename). Per-workstream subagent dispatch prompts captured in `dispatch-plan.md`. CQ-MPS-01 routed into T-MPS-037 (research spike at start of WS-4). CQ-MPS-02 and CQ-MPS-03 remain open for pm / architect to close before WS-10 — not blockers. |
| 2026-05-21 | dev (WS-1) | dev (WS-2) | WS-1 complete on branch `feature/mps-ws-1-rename-port` (commits `cbc1cb7`, `c2b2d12`, `e3b80bf`). ADR-MPS-001 filed and indexed; ChatTransportPort.ts plus the seven renamed identifiers shipped; codemod `scripts/codemod/rename-claude-cli-port.mjs` and ESLint guard `eslint-rules/no-legacy-claude-cli-port-names.cjs` wired in; one-release deprecated shim at `src/ui/composables/useClaudeCliPort.ts`. `npm run verify` green (1872 tests, 93.34% statement coverage, plugin bundle 2.76 MB / 4 MB budget). Next ready task: **T-MPS-009** (file ADR-MPS-002 for the `ProviderSelection` discriminator). |
| 2026-05-21 | dev (WS-3) | dev (WS-4..WS-9 fan-out) | WS-3 complete on branch `feature/mps-ws-3-selector-wiring` (cut from WS-2 tip `df31b3f`; commits `97daffc` → `3d1b2e4` → `1dccec7` → `736ad6c` → `1e258c7` → `bccaf61` → `ab73dc2` → closeout). `selectTransport` reshaped to the 15-row SPEC-MPS-001 §4 truth table (`selectTransport(selection, deps)` → `TransportResolution`); `buildProviderRegistry` + `PROVIDER_REGISTRY_KEY` + `useProviderRegistry` composable wired through both views. `_routeTransport` adapter in `main.ts` maps the new resolution back to the legacy `TransportKind` for `ChatSidebar`'s `TRANSPORT_KIND_KEY` consumers so ccs-parity is bit-for-bit preserved. Cursor adapter slots are temporary `degradedClaudeCliPort` stubs flagged with `// WS-4/WS-5 will replace this stub` — every Cursor availability flag is hard-wired to `false` until those workstreams land. `npm run verify` green: 1953 unit tests across 164 files, plugin bundle 2.78 MB / 4 MB, standalone 0.26 MB / 2 MB, typedoc + workflow SHA-pin checks clean. **Fan-out unlocked:** WS-4 (T-MPS-036+), WS-5, WS-6, WS-7 (after WS-6 thread-record shape), WS-8, WS-9 may now branch from this tip in parallel; WS-10 integration waits on the fan-out. Rebase the fan-out branches onto `develop` once WS-3's PR squash-merges. |
| 2026-05-21 | dev (WS-9) | dev (WS-10 integration) | WS-9 complete on branch `feature/mps-ws-9-inline-approvals` (cut from WS-3 tip `b579a9f`; commits `f44f69d` → `d9a0adf` → `d99ddbf` → `456338d` → `3db8e9c` → `d37bb58` → closeout). Inline `ApprovalCard.vue` (three buttons, default focus on Deny, Escape = deny) + persistent `approvalRulesStore` (glob + bash-prefix matching, persisted under `_storedData.specorator.approvalRules`) + Settings tab Approvals section with Remove. `ChatTurnOrchestrator.sendTurn(input, { approveTool })` threads the per-turn resolver to `port.queryStream(...)`; the orchestrator's pure `resolveApproval` composition helper consults `findMatching` first (auto-true on hit, TST-MPS-30) and otherwise publishes a request onto `pendingApprovalsStore` for `MessageList` to render. Legacy `InlinePlanApprovalCard` / `ApprovalPort` / `PlanApproval.ts` / `MockApprovalPort` deleted along with their tests + stale i18n keys (no production callers). **Tests:** WS-9 surface 47 unit tests green; full unit suite 1974 tests green. **Lint:** 0 errors, 32 pre-existing warnings. **Typecheck:** clean. Pre-existing Storybook/Chromium failures (6 stories) are unrelated to WS-9 (Chromium addon-vitest setup-file fetch error). Next ready task: **T-MPS-144** (WS-10 integration once WS-4..WS-8 land) — WS-9 is unblocked for that cascade. |
| 2026-05-21 | dev (WS-2) | dev (WS-3) | WS-2 complete on branch `feature/mps-ws-2-provider-selection` (cut from WS-1 tip; commits `c5a96cb` → `16964dd` → `0b5a8e2` → `f304d34` → `3dece04` → `16e1b9e` → `c265b0a` → `d75b1d0` → `f4f55aa` → closeout). ADR-MPS-002 filed; `ProviderSelection` discriminator + `ProviderCapabilities` shape + `ProviderRegistry` interface added; `ChatThreadRecord` extended with `{ provider, mode }` transport, `title`, `forkParent`; `migrateProviderSelection` pure idempotent migration shipped at `src/application/migration/migrateProviderSelection.ts`; `PluginSettings` gained the six §2.7 fields with their documented defaults; migration wired into `loadSettings()` via `_runProviderSelectionMigration()` with `tryAsync` defence-in-depth. `npm run verify` green (full unit suite + plugin bundle 2.77 MB / 4 MB + standalone 0.26 MB / 2 MB + typedoc + workflow SHA-pin checks). **Deviation logged in implementation-log.md:** `transportKind` retained as a deprecated optional field on the `PluginSettings` type because WS-3-owned consumers (`TransportSelector`, `ChatSidebar`, `TurnInputBuilder`) still read it — final removal happens in T-MPS-029. Migration deletes the legacy key from `_storedData` so no half-migrated state can leak in. **CQ-MPS-03 closed** by ADR-MPS-002 (one-shot pure idempotent migration; no schema-version bump). Next ready task: **T-MPS-028** (selector truth table, 15 red rows from design §C4 / spec §11). |
| 2026-05-22 | dev | release-manager | WS-10 integration squash-merged on `develop` (tip `79d692c`). Implementation log marked complete; release-notes drafted. User-facing guide added at `docs/agent-sidepanel.md`. Workflow advanced to `release-notes`. Retrospective stub placed; formal retro is human-driven. Verification performed: docs-only branch, `npm run verify` deferred to PR CI on `docs/mps-user-docs`. Next agent: release-manager (or the human owner of release-notes sign-off). |

## Open clarifications

These do not block spec acceptance but the planner must close them before task breakdown.

- **CQ-MPS-01** — Cursor public HTTP API shape: confirm whether `cursor-agent` exposes a stable REST/SSE surface (or only the CLI). Until confirmed, treat the Cursor CLI as the primary `mode='cli'` adapter and the Cursor API adapter as a P2 research spike behind a `cursor.apiPreview` feature flag. Owner: dev (research spike T-MPS-RS-01).
- **CQ-MPS-02** — Legacy `/chat` route in `SpecoratorView`: confirm removal can be deferred to a follow-up release rather than blocking this feature. Owner: pm.
- **CQ-MPS-03** — *Closed by ADR-MPS-002 (WS-2).* One-shot, pure, idempotent
  migration at `loadSettings()` accepted; no `_storedData.schemaVersion`
  bump introduced. Migration translates both
  `settings.transportKind` and per-record
  `ChatThreadRecord.transport` strings to the v1 discriminator and
  removes the legacy keys.
