---
id: IMPL-MPS-001
title: "Multi-provider agent sidepanel — Implementation log"
stage: implementation-log
feature: multi-provider-agent-sidepanel
status: in-progress
owner: dev
inputs:
  - SPEC-MPS-001
  - TASKS-MPS-001
created: 2026-05-21
updated: 2026-05-21
---

# Implementation log — Multi-provider agent sidepanel

Append-only record of executed tasks. Each entry: task ID, files touched,
commit SHA, spec reference, outcome, deviation (if any), green-evidence
line.

## WS-1 — Rename `ClaudeCliPort` → `ChatTransportPort`

### T-MPS-001 — File ADR-MPS-001 (done)

- **Commit:** `cbc1cb7`
- **Files:**
  - `decisions/ADR-MPS-001-rename-claude-cli-port.md` (new)
  - `decisions/README.md` (new — decisions index)
  - `specs/multi-provider-agent-sidepanel/*` (spec inputs committed alongside)
- **Spec:** SPEC-MPS-001 §2.1, DES-MPS-001 §C2 / §C12.
- **Outcome:** done.
- **Deviation:** the ADR ships with status `accepted` rather than the
  template default `proposed` because the design has already been signed
  off in `design.md` §C12 and the rename PR cannot land otherwise.
- **Green evidence:** `npm run verify` green; bundle size 2.76 MB / 4.00 MB
  budget; coverage statements 93.34%.

### T-MPS-002 + T-MPS-003 — red lint tests (done)

- **Commit:** `c2b2d12`
- **Files:**
  - `tests/lint/no-legacy-claude-cli-port-names.test.ts` (new)
  - `tests/domain/ports/ChatTransportPort.imports.test.ts` (new)
- **Spec:** SPEC-MPS-001 §2.1 / §14; TST-MPS-34, TST-MPS-35.
- **Outcome:** done. Two failing tests landed first to codify the
  rename deny-rules ahead of the implementation per RALPH discipline.
- **Deviation:** none — both tests turn green in `e3b80bf`.
- **Red evidence:** the lint test reported ~120 legacy occurrences in
  18 files; the import-cleanliness test failed because the renamed
  port file did not yet exist.

### T-MPS-004 + T-MPS-005 + T-MPS-006 + T-MPS-007 — rename + codemod + lint rule (done)

- **Commit:** `e3b80bf`
- **Files:**
  - `src/domain/ports/ChatTransportPort.ts` (renamed from `ClaudeCliPort.ts`)
  - `src/domain/ports/index.ts` (re-export pointers updated)
  - `src/infrastructure/bridge/ports.ts` (`CLAUDE_CLI_PORT` → `CHAT_TRANSPORT_PORT`)
  - `src/ui/composables/useChatTransportPort.ts` (new canonical composable)
  - `src/ui/composables/useClaudeCliPort.ts` (now a one-release `@deprecated` re-export shim, allow-listed by lint + codemod)
  - `scripts/codemod/rename-claude-cli-port.mjs` (new) + `tests/scripts/rename-claude-cli-port.test.ts` (new)
  - `eslint-rules/no-legacy-claude-cli-port-names.cjs` (new) + `eslint-rules/__tests__/no-legacy-claude-cli-port-names.test.cjs` (new)
  - `eslint.config.js` (rule wired in; shim path carved out)
  - `package.json` (`lint:rules` runs the new RuleTester suite)
  - 18 production source files + 18 test files swept by the codemod
    across `src/application/chat/**`, `src/infrastructure/**`,
    `src/plugin/**`, `src/ui/**`, and their `tests/` mirrors.
- **Spec:** SPEC-MPS-001 §2.1 (rename table) + §design.md C2 / C12.
  Adds the two additive `ChatTransportErrorCode` members
  `ATTACHMENT_TOO_LARGE` (REQ-MPS-044) and `PROVIDER_UNAVAILABLE`
  required by later workstreams; `StreamDelta` is shape-preserving in
  WS-1 — the new `tool-result` / `todo-update` / `citation` variants
  land in WS-8.
- **Outcome:** done. The seven retired identifiers (`ClaudeCliPort`,
  `ClaudeCliError`, `ClaudeCliErrorCode`, `ClaudeCliQueryOptions`,
  `ClaudeCliStreamOptions`, `CLAUDE_CLI_PORT`, `useClaudeCliPort`)
  appear nowhere in `src/` except inside the allow-listed shim file.
  The custom ESLint rule also defensively bans `useBridge` and
  `useChatTransports` per ADR-008 / ADR-MPS-001 §Compliance.
- **Deviation:** T-MPS-004..007 shipped as a single atomic commit
  rather than the planned slice (a) rename, (b) InjectionKey, (c)
  composable. Reason: the codemod cannot leave the tree green at
  intermediate slice boundaries because every consumer would
  reference both old and new identifiers; a single commit honours the
  user instruction that "Each task ends with `npm run verify` green
  on its branch". Tests `T-MPS-002` and `T-MPS-003` are the deliberate
  exception: their commit (`c2b2d12`) is intentionally red and turns
  green in this commit. Filename-bound legacy artefacts
  (`MockClaudeCliPort.ts`, `degradedClaudeCliPort.ts`,
  `ClaudeCliAdapter.ts` and their test mirrors) keep their current
  paths in WS-1; the spec routes those file renames to later
  workstreams that touch those files for other reasons.
- **Green evidence:** `npm run verify` green at HEAD `e3b80bf` —
  typecheck clean, lint 0 errors / 24 pre-existing warnings, 152 test
  files / 1872 tests passing, coverage 93.34% statements /
  87.15% branches / 92.08% functions / 94.47% lines, plugin bundle
  2.76 MB / 4 MB budget, standalone chunk 0.26 MB / 2 MB budget, all
  workflow files SHA-pinned, manifest valid. `npm run lint:rules`
  also green (RuleTester reports both rule suites pass).

### T-MPS-008 — WS-1 closeout note (this entry)

- **Commit:** *this commit* (workflow-state + tasks.md tick-off + log entry).
- **Files:**
  - `specs/multi-provider-agent-sidepanel/implementation-log.md` (this entry)
  - `specs/multi-provider-agent-sidepanel/workflow-state.md`
    (Stage 7 promoted to `in-progress`; WS-1 hand-off note appended)
  - `specs/multi-provider-agent-sidepanel/tasks.md` (DoD checkboxes
    ticked for T-MPS-001..008; deviations noted)
- **Spec:** REQ-MPS-001, REQ-MPS-002, REQ-MPS-009.
- **Outcome:** done. WS-1 closed; WS-2 next ready task is **T-MPS-009**
  (file ADR-MPS-002 for the `ProviderSelection` discriminator + migration).
- **Deviation:** none.
- **Green evidence:** prior `npm run verify` and `npm run lint:rules`
  green at `e3b80bf`. This entry is metadata-only and does not change
  any executable surface, so the gate's earlier green stands.

## Branch summary

- **Branch:** `feature/mps-ws-1-rename-port`
- **Commits (3):** `cbc1cb7` (ADR + spec inputs) → `c2b2d12` (red TDD
  tests) → `e3b80bf` (rename + codemod + lint rule).
- **Stage status at hand-off:** Stage 7 (implementation) `in-progress`;
  WS-1 complete; WS-2..WS-10 pending; no blockers.
- **Next agent:** dev (WS-2). First ready task: T-MPS-009.
