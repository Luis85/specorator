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
updated: 2026-05-25
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

---

## T-RR-012 / T-RR-013 — `toolPresentation` pure transform (2026-05-24, dev, implement — application batch)

- **RED (T-RR-012):** `tests/application/chat/toolPresentation.test.ts` (new, 19 cases, TEST-RR-014).
  Watched fail for the right reason (module resolution: `toolPresentation` did not exist). SHA `c3eed8d`.
- **GREEN (T-RR-013):** `src/application/chat/toolPresentation.ts` (new). `toolName`/`toolSummary`/
  `toolLabel` + exported `fileNameOnly`, reproducing claudian `getToolName`/`getToolSummary`/
  `getToolLabel`/`fileNameOnly` (`ToolCallRenderer.ts:60/79/119/181`) for the P2 common path. Reads
  `input.todos` via the domain `isValidTodoItem` guard for the TodoWrite count. `toolLabel` factored
  into `fileToolLabel`/`patternToolLabel`/`todoWriteLabel` helpers to satisfy `complexity ≤ 10`.
- **Spec:** SPEC-RR-014; REQ-RR-019a/023; NFR-RR-003/005. TEST-RR-014 19/19.
- **SHA:** `2b99242`. **Outcome:** done.
- **Deviation (with rationale):** the RED test (qa-authored) asserts `toolSummary('Read', {file_path: 123})
  === ''` — a **non-string** `file_path` degrades to `''`. Claudian's `getInputText`/`stringifyToolValue`
  would coerce `123` → `'123'`. SPEC-RR-014 is explicit ("Missing/**non-string** inputs degrade to
  `''`/`name`"), so the spec contract — not claudian's permissive coercion — is the source of truth
  (Constitution Art. I). Implemented `inputText` to treat any non-string (and empty string) as the
  degrade case. This is a strengthening of totality, not a behaviour the rendered header relied on.

## T-RR-014 / T-RR-015 — `computeDiff` pure transform (2026-05-24, dev, implement — application batch)

- **RED (T-RR-014):** `tests/application/chat/computeDiff.test.ts` (new, 11 cases, TEST-RR-018).
  Watched fail (module did not exist). SHA `fb2dde5`.
- **GREEN (T-RR-015):** `src/application/chat/computeDiff.ts` (new). `computeDiff(toolUseResult,
  toolCall)` → `{lines, stats}`, reproducing claudian `structuredPatchToDiffLines` +
  `countLineChanges` + `extractDiffData` + `diffFromToolInput` (`utils/diff.ts:9/33/130/147`) for the
  structuredPatch + Edit/Write-input paths. **No new runtime dependency** (NFR-RR-013); the
  apply-patch/file-update parsers stay deferred (CLAR-RR-005).
- **Spec:** SPEC-RR-015; REQ-RR-026; NFR-RR-003/005/013; EC-RR-3/4. TEST-RR-018 11/11.
- **SHA:** `9ab80ea`. **Outcome:** done.
- **Deviation (with rationale):** SPEC-RR-015 names "malformed bounds → empty" without prescribing
  per-hunk vs whole-result granularity. Implemented as: a hunk with non-finite/negative `oldStart`/
  `newStart` or a non-array `lines` is **dropped** (contributes nothing); non-string line entries
  within an otherwise-valid hunk are **skipped**. This keeps `computeDiff` total (EC-RR-4, never
  throws) while preserving the valid lines the RED test asserts. A structuredPatch that is present
  but yields zero usable lines does **not** fall back to the tool input (it is treated as "diff
  produced empty"), matching claudian's `extractDiffData` short-circuit; an absent/empty
  structuredPatch does fall back (EC-RR-3).

## T-RR-016 / T-RR-017 — `renderTodos`/`parseTodos` pure transform (2026-05-24, dev, implement — application batch)

- **RED (T-RR-016):** `tests/application/chat/renderTodos.test.ts` (new, 10 cases, TEST-RR-017).
  Watched fail (module did not exist). SHA `bbe0f97`.
- **GREEN (T-RR-017):** `src/application/chat/renderTodos.ts` (new). `renderTodos` → `TodoRow[]`
  (`iconName` check/dot + status + gerund/content text) + `parseTodos` (guard-filtered `input.todos`),
  reproducing claudian `getTodoStatusIcon`/`getTodoDisplayText` (`todoUtils.ts:5/9`) + `parseTodoInput`
  (`todo.ts:30`). Returns the icon NAME only (the IconPort resolves the node — NFR-RR-006).
- **Spec:** SPEC-RR-016; REQ-RR-022; NFR-RR-003/005; EC-RR-6. TEST-RR-017 (U leg) 10/10.
- **SHA:** `75d1f47`. **Outcome:** done. **Deviation:** none. (`no-warning-comments` disable added at
  the top of both src + test — the domain noun "todo" trips the term scanner, as in domain `TodoItem.ts`.)

## T-RR-018 / T-RR-019 — `resolveSubagentLifecycle` pure transform (2026-05-24, dev, implement — application batch)

- **RED (T-RR-018):** `tests/application/chat/resolveSubagentLifecycle.test.ts` (new, 13 cases,
  TEST-RR-021). Watched fail (module did not exist). SHA `f1f23dd`.
- **GREEN (T-RR-019):** `src/application/chat/resolveSubagentLifecycle.ts` (new).
  `resolveSubagentLifecycle(subagent)` → `{mode:'sync'}` | `{mode:'async', asyncStatus}` +
  `consolidateSubagent(spawn, asyncResult?)`, reproducing the Claude-path branch of claudian
  `renderTaskSubagent`/`resolveTaskSubagent`/`inferAsyncStatusFromTaskTool`. Provider-lifecycle
  (Codex/Opencode) consolidation stays deferred to P9 (CLAR-RR-004, NG7); a non-Claude shape degrades
  to `{mode:'sync'}`. `consolidate` is non-mutating (returns a fresh object); no result by turn end →
  `orphaned` (EC-RR-11).
- **Spec:** SPEC-RR-017; REQ-RR-021b; NFR-RR-003/005; EC-RR-10/11. TEST-RR-021 13/13.
- **SHA:** `86838f7`. **Outcome:** done. **Deviation:** none.

## T-RR-020 / T-RR-021 — `dispatchChunk` P2 handlers + `ChatTurnSink` P2 legs (2026-05-24, dev, implement — application batch)

- **RED (T-RR-020):** `tests/application/chat/RunChatTurnUseCase.rr.test.ts` (new, 16 cases,
  TEST-RR-005/006/007/009/012/027). Watched fail for the right reason (13/16 failed — the P2 sink
  legs + dispatch cases did not exist; 3 passed because `text`/`usage`/`error` already route via the
  P1 legs). SHA `d344476`.
- **GREEN (T-RR-021):** `src/application/chat/RunChatTurnUseCase.ts` (edited). Grew `ChatTurnSink`
  additively with the nine P2 legs (`onToolUse`/`onToolResult`/`onToolOutput`/`onThinking`/
  `onSubagentToolUse`/`onSubagentToolResult`/`onAsyncSubagentResult`/`onContextCompacted`/`onNotice`),
  the five P1 legs unchanged. `dispatchChunk` routes P2 members from its `default` branch through
  extracted `dispatchToolChunk` + `dispatchSubagentOrMiscChunk` helpers + a `logP2` helper — each
  method's `complexity ≤ 10` (the P1 switch is unchanged at 5 cases). The forward-compatible default
  branch and the streaming-error boundary (ADR-CC-001 §1: `error` chunk forwarded inline, runtime
  throw → synthetic error+done, never rethrown) are preserved.
- **Spec:** SPEC-RR-018/019; REQ-RR-001..007; NFR-RR-003; EC-RR-14. TEST-RR-005/006/007/009/012/027
  16/16; P1 `RunChatTurnUseCase.test.ts` 10/10 unchanged.
- **SHA:** `ca021de`. **Outcome:** done.
- **Deviation 1 (LoggerPort, with rationale):** SPEC-RR-018 §8 says the use case "logs a `debug` per
  dispatched P2 chunk type+id". The P1 `RunChatTurnUseCase` constructor took only `runtime`. Adding a
  **mandatory** logger would break the P1 `new RunChatTurnUseCase(runtime)` call in `ChatSurface.vue`
  (a UI-batch wire-in). Added the logger as an **optional** ctor arg (`logger?: LoggerPort`, no-op when
  absent) — additive, keeps the P1 instantiation valid, satisfies §8 when a logger is provided. The
  UI batch may pass `useLoggerPort()` when wiring; not required for this batch.
- **Deviation 2 (cross-batch type bridge, with rationale):** growing the `ChatTurnSink` interface
  forced two existing consumers to satisfy the wider type **now** (typecheck-0 is this batch's gate):
  `src/ui/stores/chatStore.ts` `_sink()` and the P1 `RunChatTurnUseCase.test.ts` `makeSink()` fixture.
  Both gained **inert P2-leg stubs** (no-ops). The concrete store behaviour (block/tool/subagent state,
  SPEC-RR-020) is owned by **T-RR-023** (UI batch) and driven by the **T-RR-022** RED tests — the
  stubs are explicitly marked "pending T-RR-023". No P1 test assertion changed (the stubs only make
  the P1 fixture runnable under the grown interface, per the dev/qa boundary rule). The store touch is
  the minimal type-bridge, not UI-batch implementation.

---

## Batch close-out — application (T-RR-012..021)

- **Typecheck:** `npm run typecheck` (`vue-tsc --noEmit -p tsconfig.lint.json`) → **0 errors**.
- **Lint:** `npx eslint` on every touched file → **0 errors / 0 warnings** (the `complexity ≤ 10`
  application-layer rule held: `dispatchChunk` + the two extracted P2 dispatch helpers + `toolLabel`
  all within budget).
- **Tests (touched surface):** `tests/application/chat` + `tests/ui/stores` → **113/113**. Full unit
  suite re-run → **566/566 across 73 files** (no regression). New: TEST-RR-014 19, TEST-RR-018 11,
  TEST-RR-017 10, TEST-RR-021 13, TEST-RR-005/006/007/009/012/027 16; P1 `RunChatTurnUseCase` 10/10.
- **Not run (deferred to the T-RR-044 gate):** full `npm run verify` / `build` / `build:web` /
  coverage / `npm audit`.
- **Not pushed.** `manifest.json` untouched. No new dependency added (NFR-RR-013 verified for
  `computeDiff`).
- **Commits:** `c3eed8d` (T-RR-012 RED), `2b99242` (T-RR-013), `fb2dde5` (T-RR-014 RED), `9ab80ea`
  (T-RR-015), `bbe0f97` (T-RR-016 RED), `75d1f47` (T-RR-017), `f1f23dd` (T-RR-018 RED), `86838f7`
  (T-RR-019), `d344476` (T-RR-020 RED), `ca021de` (T-RR-021).
- **Next batch (UI, SPEC-RR-020..032):** **FIRST TASK = T-RR-022** (qa RED — `chatStore` P2 sink-leg
  actions / state machine: `onToolUse`/`onToolResult`+`computeDiff`/`onToolOutput`/`onThinking`/
  subagent legs + EC-RR-1/2/9/10 + order preservation + no-op-when-not-streaming,
  `tests/ui/stores/chatStore.rr.test.ts`), greened by **T-RR-023** (which replaces the inert `_sink()`
  P2 stubs landed here with the real block/tool/subagent state mutations). Then T-RR-024 (`useIconPort`)
  and the components T-RR-025..038.

---

## UI batch 1 (T-RR-022..030) — store legs, composable, primitives, blocks

### T-RR-022 (RED) — `chatStore` P2 sink-leg tests (TEST-RR-005/006/007/009 store legs)

- **File:** `tests/ui/stores/chatStore.rr.test.ts` (new, 23 cases).
- **RED watched:** `npx vitest run tests/ui/stores/chatStore.rr.test.ts` → **23 failed** (`store.onToolUse is not a function` etc. — the P2 legs do not exist as actions).
- **Spec:** SPEC-RR-020; REQ-RR-002/003/004/006/011/021a; EC-RR-1/2/9/10. **SHA:** `bc1ae57`. **Outcome:** done (RED established).
- **Design note (subagent correlation):** SPEC-RR-020 leaves the subagent-registry shape "dev-stage". The tests assert a `Task`/`Agent` `onToolUse` *establishes* the `SubagentInfo` on the spawning `ToolCall` (id = spawn tool id), so `subagentId`/`agentId` correlate to the spawn id — no separate registry/`registerSubagent` action is introduced (the `SubagentInfo` rides the reactive `ToolCall.subagent` DTO, ADR-003).

### T-RR-023 (GREEN) — `chatStore` P2 sink-leg actions

- **Files:** `src/ui/stores/chatStore.ts` (P2 legs + `applyToolDiff`/`spawnDescription`/`spawnPrompt`/`_liveMessage`/`_findSubagent` helpers + `LoggerPort` dep), `src/ui/chat/ChatSurface.vue` (binds `useLoggerPort()` into `bindTurnRunner`), `tests/ui/stores/chatStore.rr.test.ts` (lint-fix only: `import type`, braced void arrow — runnable, no assertion change).
- **Behaviour:** legs mutate the live message's `contentBlocks`/`toolCalls` (DTO-only). `onToolUse` pushes `ToolCall{running}` + `{type:'tool_use'}` block (merge on repeat, no dup block; Task/Agent seeds `SubagentInfo`). `onToolResult` matches by id → status + `computeDiff` for Write/Edit. `onToolOutput` appends. `onThinking`/`onText` push/extend ordered blocks (REQ-RR-011). Subagent legs route via spawn-id; `onAsyncSubagentResult` calls `consolidateSubagent`. `onContextCompacted`/`onNotice` render-only. EC-RR-1/2/9 → `LoggerPort.warn` + ignore (no buffer). Every leg no-ops when `liveAssistantId === null` or `status !== 'streaming'`; `$reset` clears all (subagents ride the cleared messages).
- **GREEN:** `chatStore.rr` 23/23 + P1 `chatStore` 18/18 + `ChatSurface` 7/7 = 48/48. Typecheck 0, lint 0.
- **Spec:** SPEC-RR-020; REQ-RR-002/003/004/006/011/021a; EC-RR-1/2/9/10; §8. **SHA:** `109a655`. **Outcome:** done.
- **Deviation (LoggerPort wiring, with rationale):** the store needs a `LoggerPort` for the §8 degrade `warn`s but must not import `obsidian`. Added it as an **optional third arg** to `bindTurnRunner` (defaulting to a no-op logger) — keeps the P1 two-arg call valid, mirrors the existing non-reactive `deps` WeakMap pattern (runner + notifier). `ChatSurface` now passes `useLoggerPort()`. This is the wire-in the application batch (T-RR-021 deviation 1) anticipated.

### T-RR-024 (dev) — `useIconPort()` composable

- **File:** `src/ui/composables/useIconPort.ts` (new).
- **Behaviour:** inject-or-throw mirror of `useChatRuntimePort`/`useMarkdownRenderPort` (ADR-008): injects `ICON_PORT`, throws a clear "was not provided" error when absent. No `obsidian`/`node:*`.
- **Gate:** typecheck 0, lint 0. **Spec:** SPEC-RR-021; REQ-RR-019; NFR-RR-001. **SHA:** `270aac8`. **Outcome:** done.

### T-RR-025 (RED) — `SpCollapsible` + `SpIcon` tests/PageObjects (TEST-RR-010/011/024 A leg)

- **Files:** `tests/ui/chat/SpCollapsible.{po,test}.ts`, `tests/ui/chat/SpIcon.{po,test}.ts` (new).
- **RED watched:** both files fail to import (the components do not exist) → **2 files failed, no tests collected**.
- **Spec:** SPEC-RR-024/025; REQ-RR-015..019; NFR-RR-006/007/008. **SHA:** `435fea9`. **Outcome:** done (RED).

### T-RR-026 (GREEN) — `SpCollapsible.vue` + `useCollapsible` + `SpIcon.vue`

- **Files:** `src/ui/composables/useCollapsible.ts`, `src/ui/chat/SpCollapsible.vue`, `src/ui/chat/SpIcon.vue` (new).
- **Behaviour:** `useCollapsible` holds ephemeral `isExpanded` + `toggle`/`collapse`/`expand` (never on the DTO; function-property typing keeps destructured callers `unbound-method`-clean). `SpCollapsible` — collapsed by default, focusable `role="button"`/`tabindex="0"` header, click/Enter/Space toggle (keyboard `preventDefault`), `aria-expanded`, dynamic `aria-label` (`"<label> - click to expand/collapse"`), the 2px rail via logical-property `--sp-tool-rail*`/`--sp-thinking-rail-indent` tokens, reduced-motion + forced-colors guards, `header`/`default` slots, `defineExpose({ isExpanded, collapse })` for the thinking finalise. `SpIcon` — recursive `h(node.tag, node.attrs, children)` VNode tree from `useIconPort()`, `wrench` fallback, decorative `aria-hidden`; **no `v-html`**.
- **GREEN:** TEST-RR-010/011/024 (A leg) 11/11. Typecheck 0, lint 0.
- **Spec:** SPEC-RR-024/025; REQ-RR-015..019; NFR-RR-004/006/007/008. **SHA:** `77af3ad`. **Outcome:** done.

### T-RR-027 (RED) — `ToolCallBlock` + `TodoList` tests/PageObjects (TEST-RR-013/015/017 A leg)

- **Files:** `tests/ui/chat/ToolCallBlock.{po,test}.ts`, `tests/ui/chat/TodoList.{po,test}.ts` (new).
- **RED watched:** both files fail to import (components missing) → **2 files failed, no tests collected**.
- **Spec:** SPEC-RR-026/028; REQ-RR-019/020/020a/022; NFR-RR-006/007; EC-RR-XSS/EC-RR-6. **SHA:** `0fe655e`. **Outcome:** done (RED).

### T-RR-028 (GREEN) — `ToolCallBlock.vue` + `TodoList.vue`

- **Files:** `src/ui/chat/ToolCallBlock.vue`, `src/ui/chat/TodoList.vue` (new); `src/application/chat/toolPresentation.ts` (edited — added pure `toolIcon`).
- **Behaviour:** `ToolCallBlock` wraps `SpCollapsible` — header `SpIcon`(`toolIcon`) + monospace `toolName` + `toolSummary` (hidden when empty) + end-pinned status (`--sp-status-*` token class + terminal icon `check`/`x`/`shield-off`, running has none) with `aria-label` (never colour-only); generic body renders the JSON-stringified input + `result` as escaped pre-wrapped declarative `<pre>{{ }}` text — a `<script>` shows verbatim (REQ-RR-020a); TodoWrite renders `TodoList` in the body. `TodoList` — one row per `renderTodos` item, status icon + `--sp-todo-*` class + `data-status`, empty → no rows (EC-RR-6). **No `v-html`.**
- **GREEN:** TEST-RR-013/015/017 (A leg) 8/8; `toolPresentation` 19/19 unchanged (the additive `toolIcon` did not alter prior assertions).
- **Spec:** SPEC-RR-026/028; REQ-RR-019/020/020a/022; NFR-RR-004/006/007. **SHA:** `5ddd4a9`. **Outcome:** done.
- **Deviation (toolIcon placement, with rationale):** SPEC-RR-026 says the header icon comes from a "`getToolIcon`-equivalent map". claudian's `core/tools/toolIcons.ts` uses richer lucide names (`file-text`/`file-plus`/…) than the P2 static icon-name set (`file`/`terminal`/`search`/`bot`/`wrench`, `iconNodeMap.ts`). Added a pure, total `toolIcon(name)` to `toolPresentation.ts` (the application transform that already owns the tool heuristics) mapping to the available P2 names; the `SpIcon` `wrench` fallback covers anything unmapped. Additive export, no prior assertion changed.

### T-RR-029 (RED) — `ThinkingBlock` test/PageObject (TEST-RR-016)

- **Files:** `tests/ui/chat/ThinkingBlock.{po,test}.ts` (new, fake timers).
- **RED watched:** the file fails to import (component missing) → **1 file failed, no tests collected**.
- **Spec:** SPEC-RR-027; REQ-RR-013/014; NFR-RR-006; EC-RR-7. **SHA:** `8a65287`. **Outcome:** done (RED).

### T-RR-030 (GREEN) — `ThinkingBlock.vue`

- **File:** `src/ui/chat/ThinkingBlock.vue` (new).
- **Behaviour:** wraps `SpCollapsible` (`thinking` rail variant). Live: a 1s interval renders brand-italic `"Thinking Ns…"` (pulse via `--sp-thinking-pulse-duration`, `0s` under reduced-motion). On finalise (`live` → false): stop the interval, freeze the label to `"Thought for Ns"`, auto-collapse via the exposed `SpCollapsible.collapse()`. A stored non-live block renders frozen to `block.durationSeconds`. Interval cleared on finalise AND `onBeforeUnmount` (EC-RR-7). Reasoning text via `MarkdownBlock` (no `v-html`).
- **GREEN:** TEST-RR-016 4/4 (count-up, freeze + auto-collapse, unmount cleanup, stored block).
- **Spec:** SPEC-RR-027; REQ-RR-013/014; NFR-RR-004/006/007. **SHA:** `f2985fe`. **Outcome:** done.
- **Note (label glyph):** the spec text uses the single `…` ellipsis glyph (`"Thinking Ns…"`); claudian's imperative renderer used three dots `...`. Followed the spec (the contract) — the RED test asserts the `…` glyph.

---

## Batch close-out — UI batch 1 (T-RR-022..030)

- **Typecheck:** `npm run typecheck` (`vue-tsc --noEmit -p tsconfig.lint.json`) → **0 errors**.
- **Lint:** `npm run lint` → **0 errors** (3 pre-existing warnings unrelated to this batch: `ErrorBoundary.test.ts` `vue/one-component-per-file` ×2, a `max-lines` warning). Every touched file is clean.
- **Tests (full unit suite):** **612/612 across 79 files** (was 566/566 ×73 — +46 from 6 new test files: `chatStore.rr` 23, `SpCollapsible` 6, `SpIcon` 5, `ToolCallBlock` 5, `TodoList` 3, `ThinkingBlock` 4). No regression.
- **Not run (deferred to the T-RR-044 gate):** full `npm run verify` / `build` / `build:web` / coverage / `npm audit`.
- **Not pushed.** `manifest.json` untouched. No new dependency added.
- **Commits:** `bc1ae57` (T-RR-022 RED), `109a655` (T-RR-023), `270aac8` (T-RR-024), `435fea9` (T-RR-025 RED), `77af3ad` (T-RR-026), `0fe655e` (T-RR-027 RED), `5ddd4a9` (T-RR-028), `8a65287` (T-RR-029 RED), `f2985fe` (T-RR-030).
- **Next batch (UI batch 2, SPEC-RR-029..032):** **FIRST TASK = T-RR-031** (qa RED — `WriteEditBlock.vue` + `DiffView.vue` PageObjects: per-line declarative diff spans with gutter + token backgrounds, `NEW_FILE_DISPLAY_CAP=20` truncation footer (EC-RR-5), stat chip non-zero `+N`/`-N`, no-`diffData` generic body (EC-RR-3); `tests/ui/chat/WriteEditBlock.{po,test}.ts` + `DiffView.{po,test}.ts`), greened by **T-RR-032**. Then T-RR-033/034 (`SubagentBlock`), T-RR-035/036 (`MessageBlocks` dispatcher + `MessageTurn` fork + `ContextCompactedBlock`/`UsageInfo`), and the wire-in/gate tasks T-RR-037/038.

---

## 2026-05-25 (dev, implement — ui batch 2)

Executed UI BATCH 2 (T-RR-031..038, SPEC-RR-029/030/031/032/022/023) on `feature/rich-rendering` with strict TDD, one Conventional commit per task. The RED test for each contract was watched to fail (component import error) before the implementation greened it.

### T-RR-031 (RED) — `WriteEditBlock` + `DiffView` test/PageObjects (TEST-RR-019)

- **Files:** `tests/ui/chat/DiffView.{po,test}.ts`, `tests/ui/chat/WriteEditBlock.{po,test}.ts` (new).
- **RED watched:** both files fail to import the missing components → **2 files failed, no tests collected**. After the impl greened them, two test-authoring literals were corrected in the RED commit (amend, local-only): the delete-gutter glyph asserted is the SPEC-RR-029 U+2212 minus `−` (not ASCII `-`), and the empty-line single-space assertion reads raw `textContent` (vue-test-utils `.text()` trims) via a new `lineRawTexts()` PageObject method.
- **Spec:** SPEC-RR-029; REQ-RR-025/027; NFR-RR-006/007; EC-RR-3/5. **SHA:** `c1dfe7b`. **Outcome:** done (RED).

### T-RR-032 (GREEN) — `DiffView.vue` + `WriteEditBlock.vue`

- **Files:** `src/ui/chat/DiffView.vue`, `src/ui/chat/WriteEditBlock.vue` (new).
- **Behaviour:** `DiffView` renders each `DiffLine` as a per-line declarative row — a centred `--sp-diff-gutter` (16px) monospace prefix span (`+`/`−`/space, `aria-hidden`) + a text span (`text || ' '`, parity `DiffRenderer.ts:131`); per-type background via `--sp-diff-insert-bg`/`--sp-diff-delete-bg` classes (equal muted), **background-highlight only, no `text-decoration`/strikethrough** (REQ-RR-025); body scrolls within `--sp-diff-max-height`; an **all-insert** new file longer than `NEW_FILE_DISPLAY_CAP` (= 20, reproduced from `DiffRenderer.ts:76`) shows the first 20 + a `"... N more lines"` footer (EC-RR-5). `WriteEditBlock` wraps `SpCollapsible` — file `SpIcon`, name, `toolSummary`, end-pinned `--sp-status-*` status with `aria-label`, and a stat chip rendering only the non-zero `+N`(`--sp-diff-add-fg`)/`-N`(`--sp-diff-del-fg`) counts (REQ-RR-027); body embeds `DiffView` with `toolCall.diffData`, degrading to a generic `<pre>` result body when `diffData` is absent (EC-RR-3). **No `v-html`.**
- **GREEN:** TEST-RR-019 13/13 (DiffView 6 + WriteEditBlock 7).
- **Spec:** SPEC-RR-029; REQ-RR-025/027; NFR-RR-004/006/007. **SHA:** `306b605`. **Outcome:** done.

### T-RR-033 (RED) — `SubagentBlock` test/PageObject (TEST-RR-020)

- **Files:** `tests/ui/chat/SubagentBlock.{po,test}.ts` (new).
- **RED watched:** the file fails to import the missing component → **1 file failed, no tests collected**. The `expandAll()` PageObject helper re-queries collapsed headers across passes (nested-section headers only mount once their parent expands) — folded into the RED commit (amend, local-only).
- **Spec:** SPEC-RR-030; REQ-RR-021/021a; NFR-RR-006/007/008; EC-RR-10/11. **SHA:** `1937e1d`. **Outcome:** done (RED).

### T-RR-034 (GREEN) — `SubagentBlock.vue`

- **File:** `src/ui/chat/SubagentBlock.vue` (new).
- **Behaviour:** wraps `SpCollapsible` (accent `bot` `SpIcon`); collapsible prompt/result sections (result scrolls within `--sp-subagent-result-max-height`) + the nested `toolCalls` rendered via `ToolCallBlock` at `--sp-font-size-xs`. The async pill (`subagent-status`) is coloured by the resolved `asyncStatus` via `--sp-state-*` and **names** the state (`data-state` + text, never colour-only — NFR-RR-008); sync-vs-async classified by `resolveSubagentLifecycle` — sync subagents show nested tools inline with **no pill**. EC-RR-10 (error + no result → error pill, empty result) and EC-RR-11 (orphaned) ride the resolved status. Markdown via `MarkdownBlock`; **no `v-html`**.
- **GREEN:** TEST-RR-020 6/6 (completed pill, nested tools, prompt/result, EC-RR-10 error, EC-RR-11 orphaned, sync no-pill).
- **Spec:** SPEC-RR-030; REQ-RR-021/021a; NFR-RR-004/006/007/008. **SHA:** `b6add34`. **Outcome:** done.

### T-RR-035 (RED) — `UsageInfo` + `ContextCompactedBlock` test/PageObjects (TEST-RR-004/022/025)

- **Files:** `tests/ui/chat/UsageInfo.{po,test}.ts`, `tests/ui/chat/ContextCompactedBlock.{po,test}.ts` (new).
- **RED watched:** both files fail to import the missing components → **2 files failed, no tests collected**.
- **Spec:** SPEC-RR-031/032; REQ-RR-005/007/024/024a; NFR-RR-006; EC-RR-12. **SHA:** `a879220`. **Outcome:** done (RED).

### T-RR-036 (GREEN) — `UsageInfo.vue` + `ContextCompactedBlock.vue`

- **Files:** `src/ui/chat/UsageInfo.vue`, `src/ui/chat/ContextCompactedBlock.vue` (new).
- **Behaviour:** `UsageInfo` is turn-level (NOT a content block) — reads `useChatStore().usage` and renders the context tokens used, `~percentage` (omitted when `contextWindow` is missing/zero), and an optional `model` as `--sp-*`-tokened declarative text; renders **nothing** when `usage === null` (EC-RR-12). It is the simple inline token display, not the P6 arc meter (NG5). `ContextCompactedBlock` is a static render-only notice (NG1). **No `v-html`.**
- **GREEN:** TEST-RR-004/022/025 6/6 (UsageInfo 5 + ContextCompacted 1).
- **Spec:** SPEC-RR-031/032; REQ-RR-005/007/024/024a; NFR-RR-004/006. **SHA:** `d413954`. **Outcome:** done.

### T-RR-037 (RED) — `MessageBlocks` dispatcher + `MessageTurn` fork test/PageObjects (TEST-RR-008/023)

- **Files:** `tests/ui/chat/MessageBlocks.{po,test}.ts` (new), `tests/ui/chat/MessageTurn.rr.test.ts` (new), `tests/ui/chat/MessageTurn.po.ts` (extended additively — `hasBlocks()`/`hasMarkdownBlock()`, the P1 methods untouched).
- **RED watched:** `MessageBlocks` import fails (missing component) and the `MessageTurn` blocks-path assertion fails (fork not implemented) → **2 files failed, 1 of the MessageTurn-fork tests failed**; the existing P1 `MessageTurn.test.ts` stayed **green** alongside.
- **Spec:** SPEC-RR-022/023; REQ-RR-011/012/018; NFR-RR-006; EC-RR-1/13. **SHA:** `bddff93`. **Outcome:** done (RED).

### T-RR-038 (GREEN) — `MessageBlocks.vue` dispatcher + `MessageTurn.vue` fork

- **Files:** `src/ui/chat/MessageBlocks.vue` (new), `src/ui/chat/MessageTurn.vue` (forked), `src/ui/stores/chatStore.ts` (reconciliation — see deviation).
- **Behaviour:** `MessageBlocks` iterates `message.contentBlocks` IN ORDER (keyed by index) and dispatches one child per kind — `text`→`MarkdownBlock`, `thinking`→`ThinkingBlock`, `tool_use`→`WriteEditBlock` for Write/Edit else `ToolCallBlock` (TodoWrite renders `TodoList` in its body), `subagent`→`SubagentBlock`, `context_compacted`→`ContextCompactedBlock`. A dangling `tool_use`/`subagent` reference is dropped from the render list so it emits **nothing** (EC-RR-1). Each child carries `data-block-kind` so order is assertable. `MessageTurn` forks: `contentBlocks` present → `MessageBlocks`, else the P1 `MarkdownBlock`/`content` path (EC-RR-13); the assistant marker, `data-streaming`, the Interrupted badge, and `dir="auto"` are unchanged. **No `v-html`.**
- **GREEN:** TEST-RR-008/023 13/13 (MessageBlocks 6 + MessageTurn-fork 5 + the P1 MessageTurn 7 still green); full chat-UI dir 97 → all green after the store reconciliation.
- **Spec:** SPEC-RR-022/023; REQ-RR-011/012/018; NFR-RR-004/006. **SHA:** `2f8256a`. **Outcome:** done.
- **Deviation (CLAR-RR-007 — inline-error/notice reconciliation with the fork, with rationale):** the `MessageTurn` fork revealed an interaction the spec table did not reconcile. `onText` (T-RR-023) pushes a `{type:'text'}` block, so once any text streams, `message.contentBlocks` exists and the fork routes to `MessageBlocks`. But the P1 `onErrorChunk`/`onNotice` legs append their inline text to `message.content` **only**, so under the fork the inline error/notice text became invisible (caught by the existing P1 `ChatSurface` `TEST-CC-013 A leg` — `'partial [failed]'`). Fix: extracted a private `_extendTextBlock(message, content)` helper from `onText`, and `onErrorChunk`/`onNotice` now **also** extend the trailing text block **when the live message already renders via blocks** (`contentBlocks !== undefined`); a pure-P1 turn that emitted no blocks keeps the plain `content`-only path untouched. This preserves the streaming-error boundary (ADR-CC-001 §1 — still the `{type:'error'}` chunk, no per-chunk `Result`/throw) and REQ-RR-011 order; the P1 store test `onErrorChunk` (`content === 'partial boom'`) stays green. Stays within ADR-RR-001 — sink degrade/render policy, no type/seam change. The change touches `chatStore.ts` (T-RR-023 territory) only as far as needed for the T-RR-038 fork not to regress P1 (the task's explicit DoD). Logged as CLAR-RR-007 for the reviewer.

---

## Batch close-out — UI batch 2 (T-RR-031..038)

- **Typecheck:** `npm run typecheck` (`vue-tsc --noEmit -p tsconfig.lint.json`) → **0 errors**.
- **Lint:** `npx eslint` on every touched file → **0 errors / 0 warnings**.
- **Tests (full unit suite):** **647/647 across 85 files** (was 612/612 ×79 — +35 from 6 new test files: `DiffView` 6, `WriteEditBlock` 7, `SubagentBlock` 6, `UsageInfo` 5, `ContextCompactedBlock` 1, `MessageBlocks` 6, `MessageTurn.rr` 5 — minus the count absorbed by the existing `ChatSurface`/`MessageTurn` suites). No regression; **the P1 `MessageTurn.test.ts` (7) and `ChatSurface.test.ts` stay green** (the fork is additive + the inline-error reconciliation keeps the P1 content path intact).
- **Not run (deferred to the T-RR-044 gate):** full `npm run verify` / `build` / `build:web` / `docs:api` / coverage / `npm audit`.
- **Not pushed.** `manifest.json` untouched. No new dependency added.
- **Commits:** `c1dfe7b` (T-RR-031 RED), `306b605` (T-RR-032), `1937e1d` (T-RR-033 RED), `b6add34` (T-RR-034), `a879220` (T-RR-035 RED), `d413954` (T-RR-036), `bddff93` (T-RR-037 RED), `2f8256a` (T-RR-038).
- **Next batch (WIRE-IN, SPEC-RR-021 provide + demo):** **FIRST TASK = T-RR-040** (qa RED — assert `ICON_PORT` is provided from `bridge.createIconPort()` alongside the existing ports in both `AgentSidebarView` and `src/ui/main.ts`, and that a mounted `MessageBlocks`/`ToolCallBlock` resolves icons through it; `tests/ui/chat/mount.rr.test.ts` or the extended P1 mount test), greened by **T-RR-041** (provide `ICON_PORT` in `AgentSidebarView` + `src/ui/main.ts` + demo wiring). Then T-RR-042 (`npm run dev` rich-render smoke — TEST-RR-026 dev leg, qa). Then the GATE: T-RR-043 (MANUAL Obsidian `MarkdownRenderer`/`setIcon` backing + real-CLI rich turn — human-owned, never agent-self-claimed) and T-RR-044 (full verify + parity #434 + draft PR into `next`).
