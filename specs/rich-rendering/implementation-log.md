---
id: IMPL-RR-001
title: Rich rendering (P2) — implementation log
stage: implementation
feature: rich-rendering
status: in-progress
owner: dev
epic: claudian-reboot
phase: P2
created: 2026-05-24
updated: 2026-05-24
---

# Implementation log — rich rendering (P2)

Chronological, append-only record of T-RR-* execution. Each entry names the task, files changed,
the gate state, the commit SHA, the spec reference, and (for TDD pairs) the RED-watched-then-GREEN
evidence. RED-test (qa) tasks record the failing state they establish; implementation (dev) tasks
record the GREEN convergence + commit SHA.

> TDD discipline (mission): RED test authored + watched fail **for the right reason**, then minimal
> code to green, re-run to confirm GREEN. Type-level contracts (`StreamChunk` member shapes, the new
> domain unions, `ChatMessage` growth) use compile-time `Equals<>` assertions that fail
> `npx vue-tsc --noEmit -p tsconfig.lint.json` (covering `tests/**`) — mirrors the P1
> `tests/domain/chat/StreamChunk.test.ts` pattern.

---

## Batch: domain foundation (T-RR-001..007, 039)

### T-RR-001 📐 — Baseline-capture: `claudian-main` P2 rich-render reference

- **Spec:** NFR-RR-011, NFR-RR-012, NFR-RR-014 (baseline leg).
- **Files:** `specs/rich-rendering/parity-screenshots.md` (new — per-renderer × 320/520/720 ×
  light/dark baseline matrix scaffolded, baseline column anchored to `D:\Projects\claudian-main`);
  `specs/rich-rendering/test-plan.md` (new — baseline reference + the NFR-RR-014 incremental-render
  qualitative baseline note recorded in the canonical sink; manual TEST-RR-026 / T-RR-043 legs
  scheduled). Both linked to #434.
- **Commit:** `d42bdde`.
- **Outcome:** done. No file under `src/` changed (DoD line 3). The Specorator column + the human
  visual capture happen at `/spec:review`.
- **Deviation:** none.

### T-RR-003 🔨 — Relax the deleted-symbol guard for `IconPort` / `SpIcon` / `ICON_PORT`

- **Spec:** SPEC-RR-009, SPEC-RR-025, NFR-RR-001. Mirrors P1's CLAR-CC-007 relaxation.
- **Files:** `eslint.config.js` — dropped `'@/domain/ports/IconPort'` from `DELETED_SUBSYSTEM_BAN.group`
  (lines ~147) and `'ICON_PORT'` from `DELETED_INJECTION_KEYS.importNames` (lines ~161); documented
  the relaxation inline in the guard's evolves-per-phase comment. `SpIcon` lives at the new UI path
  `@/ui/chat/SpIcon`, which no ban glob matches — already permitted by construction. Every OTHER
  P0-deleted symbol (`IBridge`/`BridgeKey`/`useBridge` via `PORTS_BAN_PATTERN`; `@/domain/feature/**`,
  the transport/MCP/secret/metadata/canvas ports + adapters via `DELETED_SUBSYSTEM_BAN`;
  `METADATA_CACHE_PORT`/`CANVAS_PORT`/… via `DELETED_INJECTION_KEYS`) stays forbidden.
- **Commit:** `80cdd71`.
- **Gate:** `npm run lint` → 0 errors (3 pre-existing warnings, unrelated). Positive control:
  `npx vitest run tests/architecture/no-deleted-subsystem-refs.test.ts` → 2 passed — TEST-PSR-016
  (no `src/**` violation) **and** TEST-PSR-017 (the fixture importing the still-deleted
  `@/domain/feature/Feature` still trips the ban, proving the guard still fires on a still-deleted
  symbol).
- **Outcome:** done. Lands before T-RR-007 so the `IconPort`/`ICON_PORT` imports resolve.
- **Deviation:** none.

### T-RR-002 🧪 — RED: domain types + `StreamChunk` typing + `ChatMessage` growth (qa)

- **Spec:** TEST-RR-001, TEST-RR-002, TEST-RR-003, SPEC-RR-001..008, REQ-RR-001, REQ-RR-010, REQ-RR-026.
- **Files (new, `tests/domain/chat/`):** `StreamChunk.rr.test.ts` (P2 members + typed `toolUseResult`;
  P1 members byte-identical; no rename), `ChatMessage.rr.test.ts` (additive `contentBlocks?`/`toolCalls?`;
  six P1 fields intact; excluded members absent), `ContentBlock.test.ts` (ordered union, `chat.ts:31`),
  `ToolCall.test.ts` (P2 subset — no `isExpanded`/`resolvedAnswers`), `Subagent.test.ts`
  (`SubagentInfo`/`SubagentMode`/`AsyncSubagentStatus`, no `isExpanded`), `TodoItem.test.ts`
  (`TodoItem` + `isValidTodoItem`), `diff/Diff.test.ts` (`DiffLine`/`DiffStats`/`ToolDiffData` +
  `ToolUseResult`/`StructuredPatchHunk`). Compile-time `Equals<>`/`HasKey<>` asserts mirroring the P1
  `StreamChunk.test.ts` idiom. (`TodoItem.test.ts` carries a file-level `no-warning-comments` disable
  because the type name `TodoItem` trips the `todo` term scanner — not a deferral marker.)
- **RED watched:** `npx vue-tsc --noEmit -p tsconfig.lint.json` → `TS2307 Cannot find module`
  (`@/domain/chat/diff/Diff`, `…/diff/ToolUseResult`, `…/ContentBlock`, `…/ToolCall`, `…/Subagent`,
  `…/TodoItem`) + `TS2322 Type 'true' is not assignable to type 'false'` on the `Equals<>` asserts
  (incl. `StreamChunk.rr` lines 43/47 — `toolUseResult?: unknown` ≠ `ToolUseResult`) +
  `TS2339`/`TS2353` on the not-yet-grown `ChatMessage`. The P1-member asserts stay green. Runtime:
  `TodoItem.test.ts` fails to load (missing value import); the other six are `import type`-only and
  the pre-existing P1 `StreamChunk.test.ts` still passes. Green target = T-RR-004/005/006.
- **Commit:** `7557246`.
- **Outcome:** done (RED established). Lint green on all seven test files.
- **Deviation:** none.

### T-RR-004 🔨 — Diff domain types (dev)

- **Spec:** SPEC-RR-002, SPEC-RR-003, REQ-RR-026; ADR-RR-001 §1.
- **Files (new, `src/domain/chat/diff/`):** `ToolUseResult.ts` (`StructuredPatchHunk` +
  `ToolUseResult` with the forward-compatible `[key:string]: unknown` bag, claudian `diff.ts:18/27`,
  SDK prefix dropped); `Diff.ts` (`DiffLine`/`DiffStats`/`ToolDiffData`, claudian `diff.ts:5/12` +
  `tools.ts:4`). Pure interfaces — no `obsidian`/`node:*`/class.
- **Gate:** TEST-RR-003 (`diff/Diff.test.ts`) → 5/5 pass; `npx eslint` on both files → 0;
  `vue-tsc` clean on the diff files.
- **Commit:** `e781f4e`.
- **Outcome:** done. **Deviation:** none.

### T-RR-005 🔨 — Block/tool/subagent/todo domain types (dev)

- **Spec:** SPEC-RR-004..007, REQ-RR-002/003/006/010/021/022/023; ADR-RR-001 §1.
- **Files (new, `src/domain/chat/`):** `ContentBlock.ts` (ordered union, `chat.ts:31`); `ToolCall.ts`
  (P2 subset — `isExpanded`/`resolvedAnswers` excluded); `Subagent.ts` (`SubagentMode`/
  `AsyncSubagentStatus`/`SubagentInfo`, `isExpanded` excluded); `TodoItem.ts` (`TodoItem` +
  `isValidTodoItem` guard, `todo.ts:9/17`). Pure interfaces + one total guard — no `obsidian`/`node:*`.
  (`TodoItem.ts` carries a file-level `no-warning-comments` disable: the domain noun "todo" trips the
  `todo` term scanner; not a deferral marker.)
- **Gate:** TEST-RR-002 (`ContentBlock`/`ToolCall`/`Subagent`/`TodoItem`) → 10/10 pass; `npx eslint`
  → 0; full `vue-tsc` shows only the expected remaining RED — 9 errors confined to `ChatMessage.rr`
  (needs `contentBlocks`/`toolCalls`) + `StreamChunk.rr` lines 43/47 (the typed `toolUseResult`),
  both greened by T-RR-006.
- **Commit:** `baf866e`.
- **Outcome:** done. **Deviation:** none.

### T-RR-006 🔨 — `StreamChunk` `toolUseResult` typing edit + additive `ChatMessage` growth (dev)

- **Spec:** SPEC-RR-001, SPEC-RR-008, REQ-RR-001, REQ-RR-010, NFR-RR-010.
- **Files:** `src/domain/chat/StreamChunk.ts` (import `ToolUseResult`; replace `toolUseResult?:
  unknown` → `toolUseResult?: ToolUseResult` on `tool_result` + `subagent_tool_result` — the ONLY
  edit to a declared P1 member; all other members byte-identical, no rename/removal);
  `src/domain/chat/ChatMessage.ts` (additive `contentBlocks?: ContentBlock[]` + `toolCalls?:
  ToolCall[]`; six P1 fields byte-identical; excluded members documented as later-phase; no
  migration); `src/ui/stores/chatStore.ts` (`$reset` switched from the object form of `$patch` to
  the mutator form — the object overload's `_DeepPartial` no longer resolves once `ChatMessage`
  carries the recursive `contentBlocks`/`toolCalls` fields; identical reset behaviour).
- **Gate:** TEST-RR-001 + TEST-RR-002 now pass; `npx vue-tsc --noEmit -p tsconfig.lint.json` → **0
  errors**; `chatStore.test.ts` 18/18 (incl. `$reset`); chat domain + application 48/48; `npx eslint`
  on the three files → 0.
- **Commit:** `39c4abc`.
- **Outcome:** done.
- **Deviation:** one P1 consumer touched (`chatStore.$reset`) — **necessitated** by the
  `ChatMessage` growth this task makes (the recursive type breaks Pinia's object-`$patch` overload).
  Behaviour-preserving (mutator-form reset). Not scope creep: it is the minimal edit required for
  T-RR-006's change to typecheck. No test assertion changed.

### T-RR-007 🔨 — `IconPort` + `IconNode` + `ICON_PORT` key + barrel re-export (dev)

- **Spec:** SPEC-RR-009, REQ-RR-019, REQ-RR-020, REQ-RR-022, NFR-RR-006; ADR-RR-001 §4.
- **Files:** `src/domain/ports/IconPort.ts` (new — `IconNode` `{tag,attrs,children}` DTO +
  one-method `setIcon(name): IconNode | null`, pure/total, never a DOM mutator);
  `src/domain/ports/index.ts` (re-export `IconPort`/`IconNode`); `src/infrastructure/bridge/ports.ts`
  (add `ICON_PORT: InjectionKey<IconPort>` alongside the existing keys; "no aggregate" header
  retained + extended).
- **Gate:** `npx vue-tsc --noEmit -p tsconfig.lint.json` → 0; `npx eslint` on the three files → 0;
  deleted-subsystem guard `npx vitest run tests/architecture/no-deleted-subsystem-refs.test.ts` →
  2 passed (the regrown `IconPort`/`ICON_PORT` imports in `ports.ts` no longer trip the ban — the
  T-RR-003 relax is now exercised by real imports; positive control still fires).
- **Commit:** `92464ed`.
- **Outcome:** done. Depends on T-RR-003 (guard relax) — landed earlier in the batch.
- **Deviation:** none.

### T-RR-039 🔨 — `--sp-*` rich-rendering tokens (§4.9) (dev)

- **Spec:** SPEC-RR-033, NFR-RR-007 (+ REQ-RR-013/016/017/020/021a/022/025/027).
- **Files:** `src/ui/styles/tokens.css` — added the `§4.9 — Rich rendering (P2)` block (tree-branch
  rail, thinking colour/pulse, tool-status ladder, async-subagent state ladder, todo colours + dot
  scale, diff insert/delete/add/del/gutter/max-height, subagent result max-height) + the
  reduced-motion guard zeroing `--sp-thinking-pulse-duration`; added `--sp-success-rgb: 22, 163, 74`
  to §4.1 for the diff insert wash. Diff/thinking derive from `--sp-success`/`--sp-error`/
  `--sp-accent` (not `#D97757`); colour literals confined to the token layer.
- **Gate:** `npm run lint:style-tokens` → clean (0 violations); `tokens.test.ts` 7/7; `vue-tsc` → 0;
  `prettier --check` + `git diff --check` clean.
- **Commit:** `5b10e30`.
- **Outcome:** done. No deps. **Deviation:** none.

---

## Batch close-out — domain foundation (T-RR-001..007, 039)

- **Typecheck:** `npx vue-tsc --noEmit -p tsconfig.lint.json` → **0 errors**.
- **Lint:** `npm run lint` → **0 errors** (3 pre-existing warnings: `eslint.config.js` max-lines + 2
  `ErrorBoundary.test.ts` one-component-per-file). `npm run lint:style-tokens` → clean.
- **Tests (touched surface):** 11 files / 49 tests pass — chat domain 48 (all seven RED tests now
  GREEN: TEST-RR-001/002/003), `chatStore` 18/18 (incl. `$reset`), `tokens` 7/7, deleted-subsystem
  guard 2/2.
- **Not run (deferred to the T-RR-044 gate):** full `npm run verify` / `build` / `build:web`.
- **Not pushed.** `manifest.json` untouched.
- **Next batch (infra, SPEC-RR-010..013):** T-RR-008 (qa RED — `createIconPort` on the 3 bridges +
  Mock/Fixture rich-chunk scripts) → T-RR-009/010/011. Obsidian backing half is coverage-excluded →
  manual leg of TEST-RR-026 (T-RR-043).
