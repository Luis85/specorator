---
id: TESTPLAN-CA-001
title: Context & Attachments (P5) — test plan
stage: testing
feature: context-attachments
area: CA
epic: claudian-reboot
phase: P5
owner: qa / dev
created: 2026-05-25
updated: 2026-05-25
---

# Test plan — Context & Attachments (P5)

Tracks the automated unit/component coverage plus the coverage-excluded manual
legs (TEST-CA-M1/M2/M3 + the real-CLI image turn) that ride the single final
epic-review human gate.

## Deleted-symbol guard verification (T-CA-001 / NFR-CA-001)

Confirmed against `eslint.config.js` (read 2026-05-25):

- `DELETED_INJECTION_KEYS.importNames` does **not** contain `AUX_MODEL_PORT`,
  `SELECTION_SOURCE_PORT`, or `SELECTION_HIGHLIGHT_PORT` — the three new
  InjectionKeys resolve clean.
- `DELETED_SUBSYSTEM_BAN.group` matches **none** of the new P5 paths:
  `@/domain/chat/attachments/**`, `@/domain/ports/{AuxModelPort,
  SelectionSourcePort,SelectionHighlightPort}`,
  `@/application/chat/{attachments,inlineEdit}/**`, the new `@/ui/chat/*` paths.
  (`@/domain/chat` regrew in P1; `VaultPort` is a live core port — never banned.)

Therefore **no guard-relaxation task is required** in P5. `npm run lint` over the
new domain/aux/infra surface confirms the imports resolve without a
`no-restricted-imports` violation.

## Coverage-excluded manual legs (human-run, final review gate)

| Leg | Surface | Scheduled by |
|---|---|---|
| TEST-CA-M1 | The three ObsidianBridge ports (aux cold-start, CM6 + canvas selection, highlight decoration) wire end-to-end | T-CA-009, T-CA-014 |
| TEST-CA-M2 | The two real Obsidian Modals (`InlineEditModal` reusing `DiffView`, `ImagePreviewModal`) render + dismiss + parity screenshots | T-CA-039, T-CA-044, T-CA-047 |
| TEST-CA-M3 | Real `VaultPort.readBinary` reads vault image bytes | T-CA-014 |
| TEST-CA-017 | Real CM6 editor + Obsidian canvas selection capture (250 ms poll fires `onSelectionChange`; transient read errors degrade to `null`) | T-CA-014 |
| TEST-CA-029 | Real-CLI image turn (base64 transport reaches the Claude CLI) | T-CA-047 |

> **T-CA-014 note (`supportsBrowserSelection`):** the `ObsidianSelectionSource`
> ships `supportsBrowserSelection: false` for P5 — an honest defer of the fragile
> embedded-view (browser) capture leg (REQ-CA-018, ADR-CA-003 §2), not a silent
> drop. The editor + canvas capture paths are live; the browser leg is gated off
> at the bridge until a later phase. `ObsidianSelectionPorts.ts` is the sole file
> importing `@codemirror/state`/`@codemirror/view` (Obsidian-provided runtime
> externals, already in `vite.config.ts` `ALL_EXTERNALS`) — no symbol leaks past
> it; coverage-excluded.

## Automated unit/component proof

The Mock scriptable aux/selection impls, the LocalStorage inert impls, the pure
transforms, the use cases, and the Vue components carry the unit/component
weight + the 80/70/80/80 coverage gate. Tracked per RED test task (qa-owned)
naming TEST-CA-001..032 (incl. 018b/023b/026b).
