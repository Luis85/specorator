---
id: TRACE-MPS-001
title: "Multi-provider agent sidepanel — traceability matrix"
feature: multi-provider-agent-sidepanel
stage: spec
status: skeleton
owner: architect
inputs:
  - PRD-MPS-001
  - DES-MPS-001
  - SPEC-MPS-001
created: 2026-05-21
updated: 2026-05-21
---

# Traceability — Multi-provider agent sidepanel

This matrix is **regenerable** from the artifacts (idea, requirements, design, spec, tasks) per ADR-005. Tasks (`T-MPS-NNN`) and review findings (`R-MPS-NNN`) are filled in by the planner and reviewer respectively.

Legend: `—` = not yet allocated; `WS-N` = target workstream from `spec.md §12`.

## Requirements → Spec sections → Tests → Tasks

### Provider abstraction & migration (WS-1, WS-2, WS-3)

| REQ | Description | Spec section | Test scenarios | Workstream | Task ID(s) |
|---|---|---|---|---|---|
| REQ-MPS-001 | Rename `ClaudeCliPort` → `ChatTransportPort` | spec §2.1 (rename table), §1 file structure | TST-MPS-34 | WS-1 | — |
| REQ-MPS-002 | Rename associated error/option types | spec §2.1 | TST-MPS-34 | WS-1 | — |
| REQ-MPS-003 | `ProviderSelection` discriminator | spec §2.2 | TST-MPS-04..06 | WS-2 | — |
| REQ-MPS-004 | Migrate persisted `transportKind` | spec §3 | TST-MPS-01, 02 | WS-2 | — |
| REQ-MPS-005 | Migrate `ChatThreadRecord.transport` | spec §2.6, §3 | TST-MPS-03 | WS-2 | — |
| REQ-MPS-006 | `ProviderRegistry` domain module | spec §2.3 | TST-MPS-04 (registry consumed by selector) | WS-2 | — |
| REQ-MPS-007 | `TransportSelector` honours `ProviderSelection` | spec §4 | TST-MPS-04..06 | WS-3 | — |
| REQ-MPS-008 | `{ forced: 'auto' }` resolution precedence | spec §4 (truth table R10–R15) | TST-MPS-06 | WS-3 | — |
| REQ-MPS-009 | No legacy aggregate symbols re-introduced | spec §1 (eslint rule file) | TST-MPS-34 | WS-1 | — |

### Cursor provider — API & CLI (WS-4, WS-5)

| REQ | Description | Spec section | Test scenarios | Workstream | Task ID(s) |
|---|---|---|---|---|---|
| REQ-MPS-010 | `SECRET_ID_CURSOR` constant | spec §1 | TST-MPS-08 | WS-4 | — |
| REQ-MPS-011 | Cursor key only in Secret Storage | spec §5 (no body/header logging) | TST-MPS-09 | WS-4 | — |
| REQ-MPS-012 | Degraded notice when `secretStore.available === false` | spec §5 `isAvailable`; design §B1 `CursorKeyField.vue` | TST-MPS-05 | WS-4 | — |
| REQ-MPS-013 | `CursorApiAdapter` implements `ChatTransportPort` | spec §5 | TST-MPS-08 | WS-4 | — |
| REQ-MPS-014 | Cursor API feature-flag gate | spec §5 | TST-MPS-07 | WS-4 | — |
| REQ-MPS-015 | `CursorCliAdapter` + resolver | spec §6 | (component-level) | WS-5 | — |
| REQ-MPS-016 | Resolver ToS posture | spec §1 (file `CursorBinaryResolver.ts`); lint check | (lint test) | WS-5 | — |
| REQ-MPS-017 | `citation` StreamDelta variant | spec §2.1, §5 SSE mapping | (delta-fixture test) | WS-4 | — |

### Multi-thread switcher (WS-6)

| REQ | Description | Spec section | Test scenarios | Workstream | Task ID(s) |
|---|---|---|---|---|---|
| REQ-MPS-018 | Tab strip with all threads | design §B1; spec §8.1 | TST-MPS-10 | WS-6 | — |
| REQ-MPS-019 | New thread action | design §A1 Flow 3 | TST-MPS-10 | WS-6 | — |
| REQ-MPS-020 | Rename thread | design §A1 Flow 3 | TST-MPS-11 | WS-6 | — |
| REQ-MPS-021 | Default title derivation | spec §2.6 (`title: ''` default) | TST-MPS-11 | WS-6 | — |
| REQ-MPS-022 | Delete thread with Obsidian Modal | design §A1 Flow 3 | TST-MPS-12 | WS-6 | — |
| REQ-MPS-023 | Fork thread | spec §2.6 (`forkParent`) | TST-MPS-13 | WS-6 | — |
| REQ-MPS-024 | Active thread persisted across reloads | design §C6 (`activeThreadId`) | TST-MPS-10 (load path) | WS-6 | — |
| REQ-MPS-025 | Tab count cap | spec §7.1 (validation) | TST-MPS-14 | WS-6 | — |

### Per-message actions (WS-7)

| REQ | Description | Spec section | Test scenarios | Workstream | Task ID(s) |
|---|---|---|---|---|---|
| REQ-MPS-026 | Copy message | spec §8.3 | TST-MPS-15 | WS-7 | — |
| REQ-MPS-027 | Regenerate last response | spec §8.3 | TST-MPS-16 | WS-7 | — |
| REQ-MPS-028 | Edit-and-resend | spec §8.3 | TST-MPS-17 | WS-7 | — |
| REQ-MPS-029 | Per-message actions disabled while streaming | spec §8.3 | TST-MPS-18 | WS-7 | — |

### Status panel & modes (WS-8)

| REQ | Description | Spec section | Test scenarios | Workstream | Task ID(s) |
|---|---|---|---|---|---|
| REQ-MPS-030 | Todo list view | spec §2.1 (`todo-update` delta), §7.3 | TST-MPS-19 | WS-8 | — |
| REQ-MPS-031 | Bash output history, cap 50 FIFO | spec §7.3 | TST-MPS-20 | WS-8 | — |
| REQ-MPS-032 | Bash entry collapsible | design §B1; spec §8.6 | (component test) | WS-8 | — |
| REQ-MPS-033 | Per-thread collapse memory | spec §7.3 | TST-MPS-21 | WS-8 | — |
| REQ-MPS-034 | Slash-command dropdown enriched | spec §2.3 (`slashCommands()`) | (component test) | WS-8 | — |
| REQ-MPS-035 | Mention dropdown unchanged | — (carry-forward) | (regression) | WS-8 | — |
| REQ-MPS-036 | Plan-mode toggle | spec §7.2 | TST-MPS-22 | WS-8 | — |
| REQ-MPS-037 | Plan-mode forwarded to adapter | spec §6 args; §2.1 `planMode` | TST-MPS-23 | WS-8 | — |
| REQ-MPS-038 | Bang-bash mode hint | spec §7.2 | TST-MPS-24 | WS-8 | — |
| REQ-MPS-039 | Instruction mode | spec §7.2 | TST-MPS-25 | WS-8 | — |
| REQ-MPS-040 | Model selector per provider | design §B1; spec §2.4 | (selection test) | WS-8 | — |
| REQ-MPS-041 | Hide selector when empty | spec §8 | TST-MPS-26 | WS-8 | — |
| REQ-MPS-042 | Paste image attachment | spec §2.1 `attachments`; §7.4 | TST-MPS-27 | WS-8 | — |
| REQ-MPS-043 | Drag-drop vault file attachment | spec §2.1 (`kind: 'vault'`); §7.4 | TST-MPS-28 | WS-8 | — |
| REQ-MPS-044 | Attachment size cap | spec §7.4; §5 cap enforcement | TST-MPS-29 | WS-8 | — |

### Inline approvals (WS-9)

| REQ | Description | Spec section | Test scenarios | Workstream | Task ID(s) |
|---|---|---|---|---|---|
| REQ-MPS-045 | Approval card | spec §8.4 | TST-MPS-30 | WS-9 | — |
| REQ-MPS-046 | "Always allow" persists rule | spec §7.5 | TST-MPS-30 | WS-9 | — |
| REQ-MPS-047 | Manage rules in Settings | spec §1 (Approvals section) | TST-MPS-31 | WS-9 | — |

---

## NFRs → Spec / lint / test coverage

| NFR | Coverage |
|---|---|
| NFR-MPS-001 | spec §5 logging discipline; TST-MPS-09 grep test |
| NFR-MPS-002 | spec §5 `_mapError`; carry-forward of NFR-CCS-005 test pattern |
| NFR-MPS-003 | `ProviderRegistry` shape (`spec §2.3`) excludes secret values; structural unit test |
| NFR-MPS-004 | Storybook + Playwright budget test for provider switch on 100-message thread |
| NFR-MPS-005 | Component test for tab strip with 10 threads |
| NFR-MPS-006 | TST-MPS-02 idempotency |
| NFR-MPS-007 | Carry-forward of NFR-CCS-002 / NFR-CCS-007 — adapter `startup` / `shutdown` tests |
| NFR-MPS-008 | PageObject test asserting `aria-label` on each per-message action |
| NFR-MPS-009 | PageObject test for arrow-key tab navigation |
| NFR-MPS-010 | TST-MPS-22 aria-live assertion |
| NFR-MPS-011 | Forbidden-terms i18n test |
| NFR-MPS-012 | TST-MPS-35 import audit |
| NFR-MPS-013 | Code review checklist + grep for `node:https` / `HttpPort` in `CursorApiAdapter.ts` |
| NFR-MPS-014 | Mock adapter shape parity test against `MockClaudeCliPort` |

---

## Predecessor parity (REQ-CCS → REQ-MPS)

This feature must **not regress** any REQ-CCS-NNN. The Claude-provider regression suite is tagged `@ccs-parity` and gated by TST-MPS-33.

| REQ-CCS | Successor coverage |
|---|---|
| REQ-CCS-001..002 (API key field, trim) | Carried forward (existing settings field unchanged) |
| REQ-CCS-003..004 (startup / shutdown lifecycle) | Continues to live on `TransportLifecyclePort`; adapters all four wired |
| REQ-CCS-005..006 (active-file context) | Unchanged behaviour |
| REQ-CCS-007..008 (ribbon / URI handlers) | Extended in spec §9 with `?provider=` query param |
| REQ-CCS-009..011 (context chips) | Unchanged behaviour |
| REQ-CCS-012 (truncation notice) | Unchanged behaviour |
| REQ-CCS-013..017 (send, loading, error, retain) | Re-validated under each `(provider, mode)` selection |
| REQ-CCS-018..020 (degraded states) | Extended with Cursor-specific degraded variants per REQ-MPS-012 |
| REQ-CCS-021..023 (port narrow-port contract) | Replaced by `ChatTransportPort` — same discipline (REQ-MPS-001, NFR-MPS-012) |
| REQ-CCS-024 (settings re-check) | Same `bumpSettingsVersion` mechanism, now re-checks all four adapters |
| REQ-CCS-025..027 (prompt assembly / truncation algo) | Unchanged — `buildPrompt` is provider-agnostic |
| REQ-CCS-028 (Obsidian Sync disclosure) | Carried forward; **Cursor key is exempt** because it lives in Secret Storage (REQ-MPS-011) |

---

## ADRs → Decisions

| ADR | Status | Source | Covers |
|---|---|---|---|
| ADR-MPS-001 | Proposed (drafted in design §C12) | Architect | REQ-MPS-001, 002 |
| ADR-MPS-002 | Proposed (drafted in design §C12) | Architect | REQ-MPS-003, 004, 005, 007 |
| ADR-MPS-003 | Proposed (drafted in design §C12) | Architect | REQ-MPS-010..014 |

All three are flagged for filing under `decisions/` before the rename PR (WS-1) lands.

---

## Status

- All REQ rows have a spec section and at least one test scenario assigned.
- All NFR rows have a verification pathway.
- Tasks (`T-MPS-NNN`) and review findings (`R-MPS-NNN`) columns will be populated by the planner and reviewer respectively.
