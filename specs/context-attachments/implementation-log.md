---
id: IMPL-LOG-CA-001
title: Context & Attachments (P5) — Implementation Log
stage: implementation
feature: context-attachments
area: CA
epic: claudian-reboot
phase: P5
status: in-progress
owner: dev
integration_branch: next
created: 2026-05-25
updated: 2026-05-25
---

# Implementation Log — Context & Attachments (P5)

Append-only. One entry per task: files changed (line ranges), commit SHA, spec
reference, outcome, deviations. TDD per task — RED first (qa), then minimal impl
(dev) to green.

## T-CA-001 — Baseline-capture + guard verification (📐, doc-only)

- **Spec/req:** NFR-CA-007 (baseline leg), NFR-CA-001 (guard verification).
- **Files:** `specs/context-attachments/parity-screenshots.md` (new — baseline
  skeleton, four sub-surfaces × 320/520/720 × light/dark),
  `specs/context-attachments/test-plan.md` (new — guard-verification note + the
  M1/M2/M3 manual legs + TEST-CA status).
- **Outcome:** done.
- **Guard verification:** the three new keys (`AUX_MODEL_PORT` /
  `SELECTION_SOURCE_PORT` / `SELECTION_HIGHLIGHT_PORT`) and the new
  domain/app/ui paths match **no** `DELETED_SUBSYSTEM_BAN` /
  `DELETED_INJECTION_KEYS` glob — no relaxation task needed (recorded in
  `test-plan.md`).
- **Commit:** `4177d19`.
- **Deviation:** none.

## DOMAIN batch (T-CA-002..006)

### T-CA-002 — RED attachment DTOs + `CapturedSelection` union + 5 `ChatTurnRequest` fields (🧪 qa)

- **Spec/test:** TEST-CA-001/002/003 + TEST-CA-013 (type-shape leg);
  SPEC-CA-001/002/003/028.
- **Files:** `tests/domain/chat/attachments/Attachments.test.ts`,
  `tests/domain/chat/attachments/Selection.test.ts`,
  `tests/domain/chat/ChatTurn.ts.test.ts` (new).
- **Outcome:** done — RED confirmed (`vue-tsc -p tsconfig.lint.json` failed on
  the missing DTOs / union / five fields).
- **Commit:** `5436757`.

### T-CA-003 — Attachment DTOs + `CapturedSelection` union + barrel (🔨 dev)

- **Spec/req:** SPEC-CA-002/003; REQ-CA-001/007/010/013/017/018; NFR-CA-004.
- **Files:** `src/domain/chat/attachments/Attachments.ts` (new —
  `AttachedFileRef`, `ImageMimeType` four-member allow-list, `AttachedImage`),
  `src/domain/chat/attachments/Selection.ts` (new —
  `EditorSelectionContext`/`CanvasSelectionContext`/`BrowserSelectionContext` +
  the `CapturedSelection` union, `startLine` 0-based, `lineCount` ≥ 1),
  `src/domain/chat/attachments/index.ts` (new — barrel).
- **Outcome:** done — the TEST-CA-003 DTO legs + the TEST-CA-013 type-shape leg
  now green; plain `readonly` data, no `obsidian`/`node:*`/Vue/class.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 CA errors; `eslint` clean;
  `vitest run tests/domain/chat/attachments/` green.
- **Commit:** _this commit._
- **Deviation:** none.

### T-CA-004 — `ChatTurnRequest` five additive optional context fields (🔨 dev)

- **Spec/req:** SPEC-CA-001/028; REQ-CA-004/010/019; NFR-CA-001.
- **Files:** `src/domain/chat/ChatTurn.ts` (the five optional fields
  `attachedFiles?`/`images?`/`editorSelection?`/`canvasSelection?`/
  `browserSelection?` appended to `ChatTurnRequest`, DTOs imported from
  `./attachments/Attachments` + `./attachments/Selection`; the reserved
  comment replaced).
- **Outcome:** done — TEST-CA-001 (exact keys + per-field optional DTO types) +
  TEST-CA-002 now green; `text`/`currentNotePath` byte-identical; a
  `{ text }`-only request still serialises identically to P1;
  `PreparedChatTurn`/`ChatRuntimeQueryOptions`/`ChatRuntimeEnsureReadyOptions`
  unchanged.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 CA errors; `eslint` clean;
  `vitest run tests/domain/chat/attachments/ tests/domain/chat/ChatTurn.ts.test.ts`
  7/7 green.
- **Commit:** `0138abe`.
- **Deviation:** none.

### T-CA-005 — RED ports + `VaultPort.readBinary` shapes (🧪 qa)

- **Spec/test:** TEST-CA-010/021/028 (shape legs); SPEC-CA-004/005/006/028.
- **Files:** `tests/domain/ports/AuxModelPort.test.ts`,
  `tests/domain/ports/SelectionSourcePort.test.ts`,
  `tests/domain/ports/SelectionHighlightPort.test.ts`,
  `tests/domain/ports/VaultPort.ts.test.ts` (new).
- **Outcome:** done — RED confirmed (`vue-tsc -p tsconfig.lint.json` failed on
  the three missing ports / three keys / `readBinary` member).
- **Commit:** `1b…` (see `git log`).

### T-CA-006 — Three ports + 3 keys + barrels + `VaultPort.readBinary` (🔨 dev)

- **Spec/req:** SPEC-CA-004/005/006/028; REQ-CA-010/013/014/015/018/021;
  NFR-CA-001.
- **Files:** `src/domain/ports/AuxModelPort.ts`,
  `src/domain/ports/SelectionSourcePort.ts`,
  `src/domain/ports/SelectionHighlightPort.ts` (new);
  `src/domain/ports/VaultPort.ts` (`readBinary` appended — the seven P0–P4
  members byte-identical); `src/domain/ports/index.ts` (barrel re-exports);
  `src/infrastructure/bridge/ports.ts` (`AUX_MODEL_PORT` /
  `SELECTION_SOURCE_PORT` / `SELECTION_HIGHLIGHT_PORT` keys appended);
  `MockBridge.ts` / `LocalStorageBridge.ts` / `ObsidianBridge.ts` (throwing
  `readBinary` stubs — compile-satisfying only; real impls in T-CA-013/014).
- **Outcome:** done — all four T-CA-005 RED port tests now green.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors (full project — the three
  bridge stubs satisfy the widened `VaultPort`); `eslint` clean;
  `vitest run tests/domain/ports/{AuxModelPort,SelectionSourcePort,SelectionHighlightPort,VaultPort.ts}.test.ts`
  7/7 green.
- **Guard:** the three new keys + the new port paths match no
  `DELETED_SUBSYSTEM_BAN` / `DELETED_INJECTION_KEYS` glob — lint green,
  no relaxation.
- **Commit:** _this commit._
- **Deviation:** added throwing `readBinary` stubs to the three bridges inside
  T-CA-006 (not named in the task body) to keep the build green between the
  interface widening (T-CA-006) and the real impls (T-CA-013/014). The stubs
  throw, so T-CA-012's RED test (Mock `readBinary` reads bytes) is genuinely RED
  until T-CA-013 — TDD ordering preserved.

## Layer 2 batch — AuxModelPort impl + the re-point early (T-CA-007..011)

### T-CA-007 — RED three-bridge `AuxModelPort` impls + scriptable `fake-ports.auxModel` (🧪 qa)

- **Spec/test:** TEST-CA-021 (Mock-aux leg), TEST-CA-018 (aux backing);
  SPEC-CA-008/009/004; REQ-CA-021; NFR-CA-001/010.
- **Files:** `tests/infrastructure/mock/MockAuxModel.test.ts`,
  `tests/infrastructure/localstorage/LocalStorageAuxModel.test.ts` (new),
  `tests/__fakes__/fake-ports.test.ts` (extended — the scriptable `auxModel`
  member assertions).
- **Outcome:** done — RED confirmed (`vitest run` 5 failed: `MockAuxModel`/
  `LocalStorageAuxModel` not constructable, `ports.auxModel` undefined).
- **Commit:** `7128019`.

### T-CA-008 — `MockBridge` + `LocalStorageBridge` `AuxModelPort` impls + `fake-ports.auxModel` (🔨 dev)

- **Spec/req:** SPEC-CA-008/009/004; REQ-CA-021; NFR-CA-001/010.
- **Files:** `src/infrastructure/mock/MockAuxModel.ts` (new — scriptable
  `setAuxResponse`/`setAuxError`/`setAuxEmpty`, aborted `signal` → err, records
  `prompt`/`systemPrompt`, empty/whitespace → err; mirrors `MockShellExec`),
  `src/infrastructure/localstorage/LocalStorageComposerPorts.ts`
  (`LocalStorageAuxModel` appended — browser-safe canned/echo, never throws),
  `src/infrastructure/mock/MockBridge.ts` (`get auxModel()` over a private
  `MockAuxModel`), `src/infrastructure/localstorage/LocalStorageBridge.ts`
  (`get auxModel()` over a private `LocalStorageAuxModel`),
  `tests/__fakes__/fake-ports.ts` (`auxModel: bridge.auxModel` + the `FakePorts`
  member).
- **Outcome:** done — the T-CA-007 RED tests now green (20/20). No `node:*`,
  no spawn, no `obsidian` in Mock/LocalStorage; `Result`-mapped error/empty/abort.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors; `eslint` clean on the
  six changed files; `vitest run tests/infrastructure/mock/MockAuxModel.test.ts
  tests/infrastructure/localstorage/LocalStorageAuxModel.test.ts
  tests/__fakes__/fake-ports.test.ts` 20/20 green.
- **Commit:** `66fc361`.
- **Deviation:** an empty/whitespace `setAuxResponse(text)` maps to `err` (not
  `ok('')`) — parity with the real impls' empty-accumulated → err rule
  (SPEC-CA-004), so the re-pointed title/refine tests' "empty → err" cases stay
  driven by `setAuxResponse('')` as well as `setAuxEmpty()`. Within the SPEC-CA-008
  contract; noted for clarity.

### T-CA-009 — `ObsidianBridge` `AuxModelPort` (real cold-start, coverage-excluded) (🔨 dev)

- **Spec/req:** SPEC-CA-007 (aux leg), SPEC-CA-004; REQ-CA-021; NFR-CA-001
  (manual leg), NFR-CA-010.
- **Files:** `src/infrastructure/obsidian/ObsidianBridge.ts` —
  `createAuxModel(): AuxModelPort` builds a FRESH cold-start `ChatRuntimePort`
  via `this.createChatRuntime()`, drives
  `query(prepareTurn({ text: sys ? `${sys}\n\n${prompt}` : prompt }), [],
  { forceColdStart: true })`, accumulates `text` chunks (tool/thinking/usage
  ignored, `done` terminates), maps a streaming `error` chunk / an
  empty-accumulated result / an aborted `signal` → `Result.err`, the non-empty
  text → `ok(text)`; cold-start only (never resumes). The `signal` aborts the
  subprocess via the runtime's `cancel()` (listener registered for the in-flight
  query, removed after). Wrapped in `tryAsync` — never throws across the boundary.
  Added `AuxModelPort`/`AuxModelRunOptions` + `Result`/`ok`/`err` + `tryAsync`
  (merged into the existing `trySync` import) + `StreamChunk` imports; the drain
  loop + outcome map are split into private `drainAuxStream`/`mapAuxOutcome`
  statics (complexity/strict-boolean lint).
- **Outcome:** done (coverage-excluded; behaviour gated by the MANUAL leg
  TEST-CA-M1 + the real-CLI image turn TEST-CA-029, already scheduled in
  `test-plan.md` against T-CA-009). No `obsidian` symbol leaks past this file.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors; `eslint
  src/infrastructure/obsidian/ObsidianBridge.ts` clean; `vitest run
  tests/infrastructure` 252/252 green (no regression).
- **Commit:** `7470224`.
- **Deviation:** the abort is tracked via a small mutable holder object
  (`{ aborted: boolean }`) flipped by the `abort` listener, rather than re-reading
  `signal.aborted` after the await — TS flow-narrows `signal.aborted` to
  `false | undefined` after the early-return guard, making a post-loop
  `=== true` check unsatisfiable (TS2367). The holder is the standard escape; the
  behaviour (abort → err) is unchanged. Also split the drain/map into two private
  statics to clear the complexity-10 lint ceiling.

### T-CA-010 — RED re-point title-gen + instruction-refine onto `AuxModelPort` (🧪 qa)

- **Spec/test:** TEST-CA-018; SPEC-CA-018, ADR-CA-002 §3; REQ-CA-021;
  NFR-CA-004/010.
- **Files:** `tests/application/threads/GenerateTitleUseCase.test.ts`,
  `tests/application/chat/composer/RefineInstructionUseCase.test.ts` (migrated —
  inject the scriptable `MockAuxModel` instead of a `MockChatRuntime`; same
  observable assertions: title parsed / refined + clarification outcomes /
  err on empty / err on aux error / never surfaces `showError`; the prompt +
  systemPrompt passed to the aux are asserted; the chunk-scripting +
  "ignores tool/thinking" cases collapsed; a byte-identity block imports +
  calls `titleGeneration.ts` / `instructionRefine.ts` directly).
- **Outcome:** done — RED confirmed (`vue-tsc -p tsconfig.lint.json` fails: a
  `MockAuxModel` is not assignable to the constructors' still-`ChatRuntimePort`
  parameter — 9 TS2345 errors).
- **Commit:** `ab697a2`.

### T-CA-011 — Re-point `GenerateTitleUseCase` + `RefineInstructionUseCase` onto `AuxModelPort` (🔨 dev)

- **Spec/req:** SPEC-CA-018, ADR-CA-002 §3; REQ-CA-021; NFR-CA-004/010.
- **Files:**
  - `src/application/threads/GenerateTitleUseCase.ts` (ctor
    `(runtime: ChatRuntimePort)` → `(aux: AuxModelPort)`; the `prepareTurn` +
    `accumulate` drain loop + the `TitleStreamOutcome` interface + the `tryAsync`
    import deleted; body is `await this.aux.run(buildTitleGenerationPrompt(msg),
    { systemPrompt: TITLE_GENERATION_SYSTEM_PROMPT })`; outcome mapping unchanged
    — parse → ok / err(TITLE_GEN_FAILED_MESSAGE), no `showError`, no `providerId`
    branch);
  - `src/application/chat/composer/RefineInstructionUseCase.ts` (same shape —
    drain loop + `RefineStreamOutcome` deleted; body is `await this.aux.run(
    rawInstruction, { systemPrompt: buildRefineSystemPrompt(existing) })`; outcome
    mapping unchanged, still best-effort, no notice, no `providerId` branch);
  - `src/ui/chat/ChatSurface.vue` (inject `AUX_MODEL_PORT` optionally; `generateTitle`
    degrades to `Promise.resolve(err('aux model unavailable'))` when `aux` is absent
    — title-gen runs always but the production provide is deferred to T-CA-033;
    `refineInstruction` built only when `aux !== undefined`, else `undefined`
    (the arbiter's `refineInstruction` is optional));
  - `tests/ui/chat/composer/instructionLadder.test.ts` (the two `new
    RefineInstructionUseCase(runtime)` constructions migrated to a `MockAuxModel`
    — `setAuxResponse(<instruction>…)` for the refined-path assertion, `setAuxError()`
    for the EC-CP-9 fall-through; the `runtime` stays for the arbiter's other modes;
    assertions unchanged).
- **Outcome:** done — the T-CA-010 RED tests now green (the two re-pointed use
  cases keep their observable behaviour); the pure transforms byte-identical (the
  byte-identity blocks pass); the drain loops + no dead `ChatRuntimePort`
  side-query code remain. No `providerId` branch; `Result`-returning.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors; `eslint` clean on the six
  changed files; `vitest run tests/application/threads/GenerateTitleUseCase.test.ts
  tests/application/chat/composer/RefineInstructionUseCase.test.ts
  tests/ui/chat/composer/instructionLadder.test.ts` 20/20 green;
  `vitest run tests/ui/chat` 238 tests — `mount.rr.test.ts` re-confirmed 2/2 green
  in isolation (the one full-suite timeout was a load-induced flake at ~6× duration,
  not a regression; the wiring touches no rich-render path).
- **Commit:** `248b289`.
- **Deviation:** migrated `tests/ui/chat/composer/instructionLadder.test.ts` as part
  of T-CA-011 (not named in the task body, beyond the two T-CA-010 files) — it
  constructed `RefineInstructionUseCase(runtime)` and would not compile after the
  ctor change. Only the injected double changed (runtime → scripted `MockAuxModel`);
  the assertions are byte-identical. A runnability fix, not an assertion change.

## Layer 3 batch — INFRA selection + readBinary + image-encode (T-CA-012..016)

### T-CA-012 — RED Mock/LS selection ports + `readBinary` + `fake-ports` members (🧪 qa)

- **Spec/test:** TEST-CA-010/013/014/015; SPEC-CA-008/009; REQ-CA-013/017/018;
  NFR-CA-010.
- **Files:** `tests/infrastructure/mock/MockSelectionPorts.test.ts`,
  `tests/infrastructure/mock/MockReadBinary.test.ts`,
  `tests/infrastructure/localstorage/LocalStorageSelectionPorts.test.ts` (new),
  `tests/__fakes__/fake-ports.test.ts` (extended — the `selectionSource` /
  `selectionHighlight` member assertions).
- **Outcome:** done — RED confirmed (`vitest run` 8 failed: `MockSelectionPorts`
  module + `seedBinary` + `selectionSource` / `selectionHighlight` members absent;
  the throwing `readBinary` stub fails the readBinary cases).
- **Commit:** `e95331e`.
- **Deviation:** the commit also carries two test-only runnability fixes folded
  into the RED commit (not assertion changes): the `vi.fn<…>` generic switched to
  the Vitest-4 single-function-type form, and `expect(() => fn()).not.toThrow()`
  wrapped in braces for `no-confusing-void-expression`. Assertions unchanged.

### T-CA-013 — Mock/LS selection ports + `readBinary` + `fake-ports` members (🔨 dev)

- **Spec/req:** SPEC-CA-008/009; REQ-CA-013/017/018; NFR-CA-001/010.
- **Files:**
  - `src/infrastructure/mock/MockSelectionPorts.ts` (new — `MockSelectionSource`:
    inert by default, scriptable `setSelection(captured|null)` pushes to listeners
    + backs `getCurrentSelection`, `supportsBrowserSelection:false`, unsubscriber;
    `MockSelectionHighlight`: recording no-op `show`/`clear` → `.calls` array);
  - `src/infrastructure/mock/MockBridge.ts` (a `binaries` Map; real `readBinary`
    returns a defensive copy, missing path rejects; `seedBinary(path,bytes)` test
    helper; `get selectionSource()` / `get selectionHighlight()`);
  - `src/infrastructure/localstorage/LocalStorageComposerPorts.ts`
    (`LocalStorageSelectionSource`: inert, `onSelectionChange` registers but never
    fires; `LocalStorageSelectionHighlight`: no-op);
  - `src/infrastructure/localstorage/LocalStorageBridge.ts` (base64-backed
    `readBinary` over a `BINARY_PREFIX` key + `seedBinary`; `get selectionSource()`
    / `get selectionHighlight()`);
  - `tests/__fakes__/fake-ports.ts` (`selectionSource` / `selectionHighlight`
    members + `FakePorts` interface entries).
- **Outcome:** done — the T-CA-012 RED tests now green (31/31). No `node:*`, no
  `obsidian` in Mock/LocalStorage; `readBinary` rejects on a missing path (the
  contracted `Result.err` path of `AddImageUseCase`).
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors; `eslint` clean on the
  changed source + test files; `vitest run tests/infrastructure/mock/MockSelectionPorts.test.ts
  tests/infrastructure/mock/MockReadBinary.test.ts
  tests/infrastructure/localstorage/LocalStorageSelectionPorts.test.ts
  tests/__fakes__/fake-ports.test.ts` 31/31 green.
- **Commit:** _this commit._
- **Deviation:** the Mock binary store is a separate in-memory `Map<string,
  Uint8Array>` (seeded via `seedBinary`), distinct from the existing string
  `files` Map — bytes never round-trip through the UTF-8 string store. The LS
  store base64-encodes bytes under a `specorator:binary:` key prefix (parity with
  the string `specorator:file:` prefix) so the demo's localStorage stays a string
  store. `readBinary` returns a defensive copy of the seeded buffer. The
  `supportsBrowserSelection` value shipped by both Mock + LS is `false` (per the
  SPEC-CA-005 contract for these two bridges).

### T-CA-014 — `ObsidianBridge` selection ports + `readBinary` (coverage-excluded) (🔨 dev) 🪓

- **Spec/req:** SPEC-CA-007; REQ-CA-010/013/014/015/017/018; NFR-CA-001 (manual
  leg), NFR-CA-010.
- **Files:**
  - `src/infrastructure/obsidian/ObsidianSelectionPorts.ts` (new —
    `ObsidianSelectionSource`: CM6 editor-selection read (0-based `startLine`
    carried verbatim, `selectedText` non-empty) + Obsidian canvas-node-selection
    read, polled at 250 ms (parity claudian), fires `onSelectionChange` on a
    change keyed by a JSON snapshot, a transient read error swallowed → `null`
    (NFR-CA-010, EC-CA-12), `supportsBrowserSelection:false` honest defer
    (REQ-CA-018); `ObsidianSelectionHighlight`: paints/removes a CM6 `Decoration`
    over the captured editor range (`show`/`clear`, ported from claudian
    `SelectionHighlight.showSelectionHighlight`, `clear` idempotent));
  - `src/infrastructure/obsidian/ObsidianBridge.ts` (real `readBinary` —
    `vault.readBinary(file)` → `new Uint8Array(buffer)`, missing file rejects;
    lazily-created `get selectionSource()` / `get selectionHighlight()` mirroring
    the `get shellExec` idiom; `SelectionSourcePort`/`SelectionHighlightPort`
    imports);
  - `package.json` (`@codemirror/state` ^6.5.0 + `@codemirror/view` ^6.38.6 added
    to **devDependencies** — see deviation);
  - `specs/context-attachments/test-plan.md` (TEST-CA-017 real-capture manual leg
    added; the `supportsBrowserSelection:false` + codemirror-external note).
- **Outcome:** done (coverage-excluded `src/infrastructure/obsidian/**`).
  Behavioural gate is the MANUAL legs TEST-CA-M1 (the three ports wire
  end-to-end) + TEST-CA-M3 (real `readBinary`) + TEST-CA-017 (real CM6/canvas
  capture) — scheduled in `test-plan.md`, NOT self-claimed green. No `obsidian`
  or CM6 symbol leaks past `ObsidianSelectionPorts.ts` (the ports expose only
  domain DTOs).
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors; `eslint` on the two
  Obsidian files exit 0 (one pre-existing `max-lines` warning on the large
  `ObsidianBridge.ts`, not introduced by these ~22 added lines — a warning, not an
  error); `vitest run` of the four Layer-3 Mock/LS test files 31/31 green (no
  regression; the Obsidian leg has no automated coverage by design).
- **Commit:** _this commit._
- **Deviations:**
  1. **`supportsBrowserSelection: false`** — P5 ships the honest defer of the
     fragile embedded-view (browser) capture leg (REQ-CA-018, ADR-CA-003 §2,
     explicitly permitted by the spec "P5 may ship `false`"). The editor + canvas
     capture paths are live; the browser leg is gated off at the bridge.
  2. **`@codemirror/state` + `@codemirror/view` added to `devDependencies`** — the
     CM6 highlight `Decoration`/`StateField`/`StateEffect` require them. They are
     Obsidian-provided **runtime externals** (already declared in `vite.config.ts`
     `ALL_EXTERNALS` and already installed transitively), never bundled — exactly
     the posture of `obsidian` itself (also a devDependency). This is **not** a new
     runtime dependency (it does not enter the plugin bundle); it makes the
     already-present, already-externalized CM6 packages explicit so
     `import/no-extraneous-dependencies` passes. The brief's "no new package.json
     dependency" targets T-CA-016's pure encode (which adds none); the CM6
     externals are intrinsic to the ported `SelectionHighlight` decoration named in
     the T-CA-014 task body.
  3. `startLine` is the 0-based CM6 line (`editor.getCursor('from').line`) carried
     verbatim per SPEC-CA-003 (open item #1 resolved), NOT claudian's display
     `+1`.
