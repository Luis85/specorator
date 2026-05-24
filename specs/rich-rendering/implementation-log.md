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

---

## Batch: infra (T-RR-008..011, SPEC-RR-010..013)

### T-RR-008 🧪 — RED: `createIconPort` on the 3 bridges + Mock/Fixture rich-chunk scripts

- **Spec:** TEST-RR-024 (U leg), TEST-RR-026 (U leg), SPEC-RR-012, SPEC-RR-013, REQ-RR-019, NFR-RR-002.
- **Files (new):** `tests/infrastructure/mock/createIconPort.test.ts` (25 tests — `createIconPort()`
  on Mock/LocalStorage returns the declarative `IconNode` for the P2 icon set, unknown → `null`,
  shared map, no DOM/HTML sink); `tests/infrastructure/mock/MockChatRuntime.rr.test.ts` (rich default
  script — thinking/Read/Write+structuredPatch+3/−1/TodoWrite/subagent/async/usage, ordered, per-chunk
  yield, still injectable); `tests/infrastructure/localstorage/FixtureChatRuntime.rr.test.ts` (rich
  transcript — tool call + Write/Edit diff + TodoWrite, usage-before-done).
- **RED watched:** `createIconPort` → TS2339 (does not exist on `MockBridge`/`LocalStorageBridge`) =
  compile-failure RED (mirrors T-RR-002); the rich-chunk runtime tests fail at runtime (default
  scripts still `text…done` only). 34 failed / 4 passed (the 4 are the injectable-override + yield-
  boundary assertions that already hold for the P1 scripts).
- **Commit:** `b3d49e9` (RED). Lint fixup `80e825e` — three `as IconNode` casts → `!` assertions to
  satisfy `@typescript-eslint/non-nullable-type-assertion-style` (full type-aware config); no
  assertion change.
- **Outcome:** done (RED established). **Deviation:** none. Depends on T-RR-007 (done).

### T-RR-009 🔨 — `IconPort` impls on the three bridges

- **Spec:** SPEC-RR-012, REQ-RR-019, NFR-RR-002, NFR-RR-006.
- **Files (new):** `src/infrastructure/icons/iconNodeMap.ts` (static `Map<string,IconNode>` of the P2
  icon set — `check`/`x`/`shield-off`/`dot`/`wrench`/`file`/`terminal`/`search`/`bot`, lucide-style
  24×24 stroke SVG DTOs; `lookupIconNode` deep-copies, unknown → `null`);
  `src/infrastructure/icons/staticIconPort.ts` (shared stateless `IconPort` singleton);
  `src/infrastructure/obsidian/walkSvgElementToIconNode.ts` (pure DOM→`IconNode` walk, coverage-
  excluded). **Edited:** `MockBridge.ts` / `LocalStorageBridge.ts` (`createIconPort()` → shared
  `staticIconPort`); `ObsidianBridge.ts` (`createIconPort()` → `setIcon` into a detached `createDiv()`,
  `querySelector('svg')` → `walkSvgElementToIconNode`, `detach()` in `finally`; unknown name → no svg
  → `null`; no sink reaches UI).
- **Gate:** TEST-RR-024 U leg 25/25; existing bridge tests (Mock/LocalStorage/createChatRuntime) 36/36
  no regression. `vue-tsc` → 0; per-file `eslint` → 0.
- **Commit:** `514782f`.
- **Outcome:** done. Depends on T-RR-008 (done). **Deviation:** none. The Obsidian `setIcon` walk is
  coverage-excluded infra (`src/infrastructure/obsidian/**`) — its behavioural gate is the manual leg
  of TEST-RR-026 (T-RR-043).

### T-RR-010 🔨 — Mock/Fixture runtimes emit scripted rich chunks

- **Spec:** SPEC-RR-013, REQ-RR-001, NFR-RR-002, NFR-RR-014.
- **Files (edited):** `src/infrastructure/mock/MockChatRuntime.ts` (`DEFAULT_SCRIPT` → the rich turn:
  assistant_message_start → text → thinking → Read use/result → Write use/result (structuredPatch
  +3/−1) → TodoWrite use/result → subagent use/result → async_subagent_result(completed) → text →
  usage; `done` appended by the generator; still injectable per test);
  `src/infrastructure/localstorage/FixtureChatRuntime.ts` (`FIXTURE_TRANSCRIPT` → text → thinking →
  Edit use/result (structuredPatch) → TodoWrite use/result → usage).
- **Gate:** TEST-RR-026 U leg green (Mock 9/9 + Fixture 5/5); P1 runtime tests (`MockChatRuntime.test`,
  `FixtureChatRuntime.test`) still pass (default still contains text + single `done`). Full
  app/chat + infra suite 183/183. `vue-tsc` → 0; per-file `eslint` → 0.
- **Commit:** `1032af0`.
- **Outcome:** done. Depends on T-RR-008 + T-RR-006 (both done). **Deviation:** none. No subprocess /
  no `node:*` in either runtime; per-chunk yield boundary preserved (NFR-RR-014).

### T-RR-011 🔨 — `MarkdownRenderPort` Obsidian backing + node-model widening

- **Spec:** SPEC-RR-010, SPEC-RR-011, REQ-RR-020a, NFR-RR-006.
- **Files (edited):** `src/domain/ports/MarkdownRenderPort.ts` (widen `MarkdownInline` +`strong`/`em`,
  `MarkdownNode` +`heading`/`code_block`/`list`, **additively** — `SafeRenderResult.nodes` field
  contract UNCHANGED, ADR-RR-001 §3); `src/application/chat/safeMarkdownRender.ts` (return type
  narrowed to the paragraph-only subset `SafeParagraphRenderResult` so P1 callers/tests read `.spans`
  unchanged; assignable to the wider `SafeRenderResult`); `src/infrastructure/obsidian/ObsidianBridge.ts`
  (`createMarkdownRenderPort()` → `MarkdownRenderer.render` into a detached `createDiv()`, walk via
  `walkMarkdownFragment`, `detach()` in `finally`, degrade to `safeMarkdownRender` on empty/throw);
  `src/ui/chat/MarkdownBlock.vue` (`kind === 'paragraph'` filter + `v-else-if span.kind === 'text'` —
  behaviour-preserving); `tests/__fakes__/obsidian.stub.ts` (+`Component`, +`MarkdownRenderer.render`
  no-op stub). **Files (new):** `src/infrastructure/obsidian/walkMarkdownFragment.ts` (pure fragment→
  DTO walk, coverage-excluded).
- **Gate:** every P1 markdown test passes assertions unchanged (`safeMarkdownRender` 19/19,
  `safeMarkdownRenderPort` 3/3, `createChatRuntime` markdown leg, `MarkdownBlock` 6/6); touched-surface
  suite 261/261. `vue-tsc` → 0; `npm run lint` → 0 errors (3 pre-existing warnings only). Manual
  markdown leg of TEST-RR-026 already scheduled in `test-plan.md` (T-RR-043).
- **Commit:** `56de482`.
- **Outcome:** done. Depends on T-RR-002 (done). **Deviation (with rationale):** the union widening is
  blessed by ADR-RR-001 §3 / SPEC-RR-011 (the documented spec §12 watch item). It forced
  **behaviour-preserving** `kind`-narrows in three P1 consumers/tests that read `node.spans` /
  `span.value` directly: (a) `MarkdownBlock.vue` filters to `paragraph` nodes + `text`/`code` spans
  (richer kinds render via SPEC-RR-022 in the UI batch); (b) `safeMarkdownRender.test.ts`,
  `safeMarkdownRenderPort.test.ts`, `createChatRuntime.test.ts` add a `kind`-filter in their span-
  flatten helpers. NO test assertion changed — the narrows are compile-only (the pure backing still
  emits only `paragraph`/`text`/`code`, so runtime output is byte-identical). The
  `SafeRenderResult.nodes` field name/type contract is unchanged → **no return to ADR-RR-001 required**
  (matches the spec §12 conclusion). Also noted: `MarkdownRenderer.render` is async while the port is
  synchronous — the backing kicks it off and walks synchronously, degrading to the pure baseline when
  the fragment is not yet populated; this is the spec's "degrade to raw markdown, never throw" path
  realised within the sync contract (gated by the manual TEST-RR-026 leg on real Obsidian).

---

## Batch close-out — infra (T-RR-008..011)

- **Typecheck:** `npx vue-tsc --noEmit -p tsconfig.lint.json` → **0 errors**.
- **Lint:** `npm run lint` → **0 errors** (3 pre-existing warnings only: `eslint.config.js` max-lines +
  2 `ErrorBoundary.test.ts` one-component-per-file — unchanged from the domain-foundation batch).
- **Tests (touched surface):** 261/261 across `tests/application/chat`, `tests/infrastructure`,
  `tests/ui/chat`, `tests/domain/chat`, `tests/ui/stores`. TEST-RR-024 U leg 25/25; TEST-RR-026 U leg
  green (Mock + Fixture); every P1 markdown/runtime test green with assertions intact.
- **Not run (deferred to the T-RR-044 gate):** full `npm run verify` / `build` / `build:web` / coverage.
- **Manual legs (human-owned, T-RR-043):** the Obsidian `MarkdownRenderer`/`setIcon` production backing
  (TEST-RR-026 M leg) stays scheduled in `test-plan.md` — never agent-self-claimed.
- **Not pushed.** `manifest.json` untouched.
- **Commits:** `b3d49e9` (T-RR-008 RED), `514782f` (T-RR-009), `1032af0` (T-RR-010), `56de482`
  (T-RR-011), `80e825e` (T-RR-008 lint fixup).
- **Next batch (application, SPEC-RR-014..019):** **FIRST TASK = T-RR-012** (qa RED — `toolPresentation`
  pure transform: `toolName`/`toolSummary`/`toolLabel`, TEST-RR-014), greened by T-RR-013, then
  T-RR-014..021 (`computeDiff`, `renderTodos`, `resolveSubagentLifecycle`, `dispatchChunk` P2 handlers +
  the new `ChatTurnSink` legs). All application transforms are pure/total and fully unit-testable.
