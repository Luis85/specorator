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

### T-CA-015 — RED bounded base64 image-encode + gate constants (🧪 qa)

- **Spec/test:** TEST-CA-010 (encode leg), TEST-CA-012 (gate-constant leg);
  SPEC-CA-010; REQ-CA-010/012; NFR-CA-009/011.
- **Files:** `tests/infrastructure/image/imageEncode.test.ts` (new — the 8 MiB
  constant, the exact four-member allow-list, the pure `encodeImageBase64` (no
  data-URI prefix, deterministic, atob round-trip, empty → ''), and
  `resolveImageMime` mapping `.png`/`.jpg`/`.jpeg`/`.webp`/`.gif` (case-insensitive)
  → allow-list member and `.exe`/`.md`/`.svg`/`.bmp`/`.ico`/extensionless → null).
- **Outcome:** done — RED confirmed (`vitest run` import of
  `@/infrastructure/image/imageEncode` fails to resolve; the test file errors at
  import time).
- **Commit:** `c9496c0`.

### T-CA-016 — Bounded base64 image-encode + `MAX_IMAGE_BYTES` / `IMAGE_MIME_ALLOW_LIST` (🔨 dev)

- **Spec/req:** SPEC-CA-010; REQ-CA-010/012; NFR-CA-009/011.
- **Files:** `src/infrastructure/image/imageEncode.ts` (new — `MAX_IMAGE_BYTES =
  8 * 1024 * 1024`; `IMAGE_MIME_ALLOW_LIST` the exact four members; the pure
  `encodeImageBase64(bytes, mime)` — `btoa` over a chunked byte→char fold in
  browser/Obsidian, `Buffer` fallback in Node, no data-URI prefix, empty → '';
  `resolveImageMime(path)` extension→allow-list resolver, case-insensitive, `.exe`
  + any non-image → null per EC-CA-2).
- **Outcome:** done — the T-CA-015 RED tests now green (11/11). Pure/total, never
  throws on valid input; no `obsidian` import; no data-URI prefix; no new
  `package.json` runtime dependency. The 8 MiB gate ORDER is enforced later by
  `AddImageUseCase` (T-CA-020) — this file is only the constants + transforms.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors; `eslint
  src/infrastructure/image/imageEncode.ts tests/infrastructure/image/imageEncode.test.ts`
  exit 0; `vitest run tests/infrastructure/image/imageEncode.test.ts` 11/11 green.
- **Commit:** _this commit._
- **Deviation:** file path is `src/infrastructure/image/imageEncode.ts` (the
  spec's `src/infrastructure/.../imageEncode.ts`) — a new `image/` subdir kept OUT
  of the coverage-excluded `src/infrastructure/obsidian/**` so the pure transform
  carries the 80/70/80/80 coverage weight. The encode signature takes the
  `mimeType` for the caller's contract clarity (the resolved + gated MIME), though
  it is not embedded in the output (no data-URI prefix) — the parameter is
  underscore-prefixed to mark it intentionally unused in the byte fold.

## APPLICATION batch (T-CA-017..028)

### T-CA-017 — RED pure `computeWordDiff` (🧪 qa)

- **Spec/test:** TEST-CA-023 (U leg), TEST-CA-023b; SPEC-CA-011; REQ-CA-023;
  NFR-CA-011; EC-CA-10.
- **Files:** `tests/application/chat/inlineEdit/computeWordDiff.test.ts` (new —
  the REQ-CA-023 bank→riverbank acceptance asserted by per-type token sets +
  reconstructing each side from equal+insert / equal+delete; stats `{added:1,
  removed:1}`; EC-CA-10 identical → all-equal `{added:0,removed:0}`; empty inputs
  → empty diff; one-sided empty → clean all-insert/all-delete; never-throws).
- **Outcome:** done — RED confirmed (`vitest run` cannot resolve
  `@/application/chat/inlineEdit/computeWordDiff`; the file errors at import time).
- **Commit:** `12814ce`.

### T-CA-018 — `computeWordDiff.ts` (pure word-level DP/LCS → `ToolDiffData`) (🔨 dev)

- **Spec/req:** SPEC-CA-011; REQ-CA-023; NFR-CA-011.
- **Files:** `src/application/chat/inlineEdit/computeWordDiff.ts` (new —
  `tokenise` on `split(/(\s+)/)` (empty string → zero tokens, no phantom `''`),
  `lcsTable` classic DP, `backtrace` into a token-granular `DiffLine[]` (one entry
  per token, no coalescing — per SPEC "each token is an entry"), `countChanges`
  counting non-whitespace insert/delete tokens; `filePath` `''`).
- **Outcome:** done — the T-CA-017 RED tests now green (7/7). Pure/total, never
  throws; identical inputs → all-equal no-op (EC-CA-10); empty → empty diff. The
  `ToolDiffData` feeds the UNCHANGED P2 `DiffView` verbatim (the renderer reuse,
  asserted at the UI layer). No new `package.json` runtime dependency; no
  `obsidian`/`node:*`/Vue import.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors; `eslint` on the two files
  exit 0; `vitest run tests/application/chat/inlineEdit/computeWordDiff.test.ts`
  7/7 green.
- **Commit:** _this commit._
- **Deviation:** the DP/back-trace is decomposed into `tokenise`/`lcsTable`/
  `backtrace`/`countChanges` helpers (vs claudian's single in-file `computeDiff`)
  to satisfy the project ESLint `complexity ≤ 10` rule — matches the accepted
  P2 `src/application/chat/computeDiff.ts` decomposition style. Per SPEC-CA-011
  ("each token is an entry") the back-trace emits **one `DiffLine` per token** and
  does NOT coalesce consecutive same-type ops (claudian's `InlineEditModal.ts:171`
  does coalesce — an intentional divergence so the word-granular acceptance holds
  at the token level).

### T-CA-019 — RED `parseInlineEditResponse` + `inlineEditPrompt` (🧪 qa)

- **Spec/test:** TEST-CA-022, TEST-CA-021 (prompt leg); SPEC-CA-012/013;
  REQ-CA-021/022; NFR-CA-004.
- **Files:** `tests/application/chat/inlineEdit/parseInlineEditResponse.test.ts`
  (new — replacement (trimmed inner, first-match, wins over insertion) / insertion
  / clarification (trimmed) / failure (empty + whitespace); the REQ-CA-022
  acceptances; never-throws), `tests/application/chat/inlineEdit/inlineEditPrompt.test.ts`
  (new — `INLINE_EDIT_SYSTEM_PROMPT` non-empty + documents the
  `<replacement>`/`<insertion>`/clarification contract; `buildInlineEditPrompt`
  frames instruction + selection + optional notePath; pure/deterministic).
- **Outcome:** done — RED confirmed (both modules unresolved at import time).
- **Commit:** `4bef1f1`.

### T-CA-020 — `parseInlineEditResponse.ts` + `inlineEditPrompt.ts` (🔨 dev)

- **Spec/req:** SPEC-CA-012/013; REQ-CA-021/022; NFR-CA-004.
- **Files:** `src/application/chat/inlineEdit/parseInlineEditResponse.ts` (new —
  the `InlineEditParse` union + the parse, ported from claudian
  `core/prompt/inlineEdit.ts:9`: first `<replacement>` (regex `exec`, `[\s\S]*?`,
  trimmed inner) → replacement; else `<insertion>` → insertion; else non-empty
  trimmed → clarification; else failure),
  `src/application/chat/inlineEdit/inlineEditPrompt.ts` (new —
  `INLINE_EDIT_SYSTEM_PROMPT` ported from claudian (selection-mode leg) +
  `buildInlineEditPrompt(selectedText, instruction, notePath?)` framing the
  instruction + `<editor_selection>` tag).
- **Outcome:** done — the T-CA-019 RED tests now green (parse 9/9, prompt 5/5).
  Pure/total, never throws; no side effects; no `obsidian`/Vue import.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors; `eslint` on the four files
  exit 0; `vitest run` on the two test files 14/14 green.
- **Commit:** _this commit._
- **Deviation:** two intentional divergences from a strict verbatim port: (1) the
  parse **trims** the `<replacement>`/`<insertion>` inner per SPEC-CA-012 ("trimmed
  inner") — claudian's `replacementMatch[1]` is raw. (2) `INLINE_EDIT_SYSTEM_PROMPT`
  drops claudian's leading `Today is ${getTodayDate()}` interpolation and the
  cursor-mode sections — the date interpolation would break the pure/total +
  stable-constant contract (SPEC-CA-013), and P5 captures editor selections, not
  cursor positions, so `buildInlineEditPrompt` frames only `<editor_selection>`.

### T-CA-021 — RED `AddFileContextUseCase` (🧪 qa)

- **Spec/test:** TEST-CA-001 (add leg), TEST-CA-003 (displayName leg);
  SPEC-CA-014; REQ-CA-001/002/003; NFR-CA-004; EC-CA-3/4.
- **Files:** `tests/application/chat/attachments/AddFileContextUseCase.test.ts`
  (new — add to empty/existing set; displayName basename-without-extension
  (`report.final.md` → `report.final`; `README` → `README`); EC-CA-3 idempotent
  re-add; EC-CA-4 remove; remove-absent no-op; empty/whitespace path → `err`).
- **Outcome:** done — RED confirmed (`AddFileContextUseCase` unresolved at import).
- **Commit:** `e9cbf1e`.

### T-CA-022 — `AddFileContextUseCase` (pure file-set ops) (🔨 dev)

- **Spec/req:** SPEC-CA-014; REQ-CA-001/002/003; NFR-CA-004.
- **Files:** `src/application/chat/attachments/AddFileContextUseCase.ts` (new —
  `add`/`remove` over `readonly AttachedFileRef[]`, path-unique idempotent add,
  `basenameWithoutExtension` helper (strips the final extension only, keeps
  dotfiles whole, handles `/` + `\` separators), empty path → `err`; **no port**).
- **Outcome:** done — the T-CA-021 RED tests now green (9/9). `Result`-returning,
  pure, never throws; no `obsidian`/Vue import.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors; `eslint` on the two files
  exit 0; `vitest run` 9/9 green.
- **Commit:** `b292341`.
- **Deviation:** none.

### T-CA-023 — RED `AddImageUseCase` (🧪 qa)

- **Spec/test:** TEST-CA-007 (U leg), TEST-CA-012, TEST-CA-030 (no-secret leg);
  SPEC-CA-015; REQ-CA-007/012; NFR-CA-009/004; EC-CA-1/2.
- **Files:** `tests/application/chat/attachments/AddImageUseCase.test.ts` (new —
  happy path (PNG → encoded `AttachedImage` matching `encodeImageBase64`);
  no-secret payload (exactly the four fields, base64 alphabet only); EC-CA-2
  `.exe` → err (bytes seeded under the path to prove the MIME gate rejects before
  read); missing file → err; EC-CA-1 oversize `> MAX_IMAGE_BYTES` → err; the 8 MiB
  boundary accepted; never-throws on missing file).
- **Outcome:** done — RED confirmed (`AddImageUseCase` unresolved at import).
- **Commit:** `58f51b5`.

### T-CA-024 — `AddImageUseCase` (allow-list + 8 MiB gate + readBinary + base64) (🔨 dev)

- **Spec/req:** SPEC-CA-015; REQ-CA-007/012; NFR-CA-009/004.
- **Files:** `src/application/chat/attachments/AddImageUseCase.ts` (new —
  constructor `(vault: VaultPort)`; `execute(path)` gate order: `resolveImageMime`
  → `null` ⇒ err before read; `vault.readBinary` in `tryAsync` ⇒ missing → err;
  `byteSize = bytes.byteLength > MAX_IMAGE_BYTES` ⇒ err measured before encode;
  else `encodeImageBase64` → `ok({ path, mimeType, byteSize, dataBase64 })`).
- **Outcome:** done — the T-CA-023 RED tests now green (7/7). `Result`-returning,
  never throws; gate order enforced (oversize measured before encode); no secret /
  `data.json` write; no provider branch. Imports the T-CA-016 encode helper from
  `@/infrastructure/image/imageEncode` (the application→infra import sanctioned by
  SPEC-CA-010 — only domain→infra and UI→infra are ESLint-banned). No
  `obsidian`/Vue import.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors; `eslint` on the two files
  exit 0; `vitest run` 7/7 green.
- **Commit:** `71f2d2f`.
- **Deviation:** `resolveImageMime` returns `null` (not `undefined` as the batch-4
  brief summarised) — the use case branches on `=== null`. The behaviour (`.exe` /
  non-image rejected before read) is exactly the DoD.

### T-CA-025 — RED `CaptureSelectionUseCase` (🧪 qa)

- **Spec/test:** TEST-CA-013/014/015/016 (U legs), TEST-CA-018b (U leg);
  SPEC-CA-016; REQ-CA-013..018; NFR-CA-010; EC-CA-5-clear; EC-CA-11.
- **Files:** `tests/application/chat/attachments/CaptureSelectionUseCase.test.ts`
  (new — editor → `show` + capture; null+no-focus → `clear` + null (EC-CA-5-clear);
  null+focus → retain prior, no extra clear (EC-CA-11); canvas + browser capture
  with empty `highlight.calls`; `current()` starts null; never-throws — over the
  `MockSelectionSource` + recording `MockSelectionHighlight`).
- **Outcome:** done — RED confirmed (`CaptureSelectionUseCase` unresolved at import).
- **Commit:** `c078a32`.

### T-CA-026 — `CaptureSelectionUseCase` (🔨 dev)

- **Spec/req:** SPEC-CA-016; REQ-CA-013..018; NFR-CA-010.
- **Files:** `src/application/chat/attachments/CaptureSelectionUseCase.ts` (new —
  constructor `(source, highlight)`; `onChange(sel, focusWithinChat)`: editor →
  `highlight.show`; null+no-focus → `clear` + drop; null+focus → retain (no clear);
  canvas/browser → capture, no highlight; `current()` seeds from
  `source.getCurrentSelection()` until the first observed tick, then the tracked
  value is authoritative; all `Result.ok`).
- **Outcome:** done — the T-CA-025 RED tests now green (7/7). `Result`-returning,
  never throws; no provider branch; no `obsidian`/Vue import.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors; `eslint` exit 0;
  `vitest run` 7/7 green.
- **Commit:** _this commit._
- **Deviation:** the retain/clear semantics match the DoD exactly (focus hand-off
  retains; a genuine deselection clears). One implementation choice beyond the
  literal contract: `current()` reads `source.getCurrentSelection()` as a SEED only
  **before** the first `onChange` tick (an `observed` flag), so a freshly-mounted
  consumer sees the live selection without waiting for a poll while an explicit
  deselection never resurrects a stale source read. This also gives the injected
  `source` port a real use (it would otherwise be an unused-private TS6138 error) —
  the constructor signature is unchanged from the spec.

### T-CA-027 — RED `InlineEditUseCase` (🧪 qa)

- **Spec/test:** TEST-CA-021 (use-case leg), TEST-CA-026, TEST-CA-027;
  SPEC-CA-017; REQ-CA-021/022/026/027/028; NFR-CA-004/010; EC-CA-8/9.
- **Files:** `tests/application/chat/inlineEdit/InlineEditUseCase.test.ts` (new —
  aux wiring (prompt + system prompt asserted); replacement → ok + the
  `computeWordDiff` preview; insertion → ok; clarification → ok (TEST-CA-026);
  aux error / empty / aborted-signal → err (EC-CA-8/9); empty/whitespace
  instruction → err with NO aux query (`lastPrompt` stays null); `continue`
  re-frames the prior exchange + reply and re-runs; never-throws — over the
  scriptable `MockAuxModel`).
- **Outcome:** done — RED confirmed (`InlineEditUseCase` unresolved at import).
- **Commit:** `a82acf1`.

### T-CA-028 — `InlineEditUseCase` (over `AuxModelPort`, no provider branch) (🔨 dev)

- **Spec/req:** SPEC-CA-017; REQ-CA-021/022/026/027/028; NFR-CA-004/010.
- **Files:** `src/application/chat/inlineEdit/InlineEditUseCase.ts` (new — the
  `InlineEditOutcome` union (`replacement` carries `diff: computeWordDiff(...)`);
  constructor `(aux: AuxModelPort)`; `execute` guards an empty instruction → err,
  else `aux.run(buildInlineEditPrompt(...), { systemPrompt:
  INLINE_EDIT_SYSTEM_PROMPT, signal })` → a shared `run` mapping via
  `parseInlineEditResponse` (replacement → ok+diff, insertion → ok, clarification
  → ok, failure / aux-err → err); `continue` re-frames the prior exchange + reply
  into one instruction and re-runs through the same path).
- **Outcome:** done — the T-CA-027 RED tests now green (12/12). `Result`-returning,
  never throws (`aux.run` maps error/empty/abort; parse + `computeWordDiff` are
  pure/total); the `replacement` outcome carries the word-diff; NO `providerId`
  branch (SPEC-CA-029); no `obsidian`/Vue import.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors; `eslint` on the two files
  exit 0; `vitest run` 12/12 green.
- **Commit:** _this commit._
- **Deviation:** abort is handled at the port boundary — the spec passes `signal`
  into `aux.run`, and the scriptable `MockAuxModel` (and the real Obsidian aux)
  resolve `err` on an already-aborted/cancelled signal; the use case maps any
  aux `err` to `Result.err`, so there is no separate abort branch in the use case
  (matches the EC-CA-8 expectation). The clarification loop is modelled by
  `continue` re-framing the `priorExchange` turns + the `reply` into a single
  re-run instruction (the modal owns the conversation transcript — DESIGN-CA-001).

## T-CA-029 — RED port composables + useCapturedSelection (🧪 qa)

- **Spec/test:** TEST-CA-013 (composable leg), TEST-CA-016 (composable leg);
  SPEC-CA-025; REQ-CA-013/016/021; NFR-CA-002.
- **Files:** `tests/ui/composables/useAuxModelPort.test.ts`,
  `tests/ui/composables/useSelectionSourcePort.test.ts`,
  `tests/ui/composables/useSelectionHighlightPort.test.ts` (new — each
  inject-or-throw, mirroring `useShellExecPort`), and
  `tests/ui/composables/useCapturedSelection.test.ts` (new — editor capture →
  highlight show; null+focus-outside → clear; null+focus-inside → retain
  (EC-CA-11); `clear()` drops + clears).
- **Outcome:** done — RED confirmed (the four composables under
  `src/ui/composables/` unresolved at import; run with `--no-file-parallelism`
  to dodge the machine-load worker timeout).
- **Commit:** `0294fc1`.

## T-CA-030 — Port composables + useCapturedSelection (🔨 dev)

- **Spec/req:** SPEC-CA-025; REQ-CA-013/016/021; NFR-CA-002/004.
- **Files:** `src/ui/composables/useAuxModelPort.ts`,
  `src/ui/composables/useSelectionSourcePort.ts`,
  `src/ui/composables/useSelectionHighlightPort.ts` (new — inject the
  `AUX_MODEL_PORT` / `SELECTION_SOURCE_PORT` / `SELECTION_HIGHLIGHT_PORT` keys,
  throw a helpful "was not provided" error otherwise — mirrors `useVaultPort`),
  `src/ui/composables/useCapturedSelection.ts` (new — subscribes
  `source.onSelectionChange`, computes focus-within-chat from `document.activeElement`
  relative to a `chatRoot` ref, feeds `CaptureSelectionUseCase.onChange`, exposes
  a `shallowRef` `current` + `clear()`, tears the subscription down via
  `onScopeDispose`).
- **Outcome:** done — the T-CA-029 RED tests now green (10/10). No `obsidian`
  import under `src/ui/**`; DTO-only.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors; `eslint` on the four
  files exit 0; `vitest run` 10/10 green.
- **Commit:** _this commit._
- **Deviation:** `useCapturedSelection` takes the chat-surface element as a
  `Ref<HTMLElement | null>` (`chatRoot`) so the focus-within-chat signal is
  computed from `document.activeElement.contains` — the spec says "compute the
  focus-within-chat signal from the active element relative to the chat surface"
  without fixing the parameter shape, so the ref is the host's binding seam. An
  explicit `clear()` is treated as a deselection regardless of focus (it cannot
  be a focus hand-off).

## T-CA-031 — RED FileChips.vue + PageObject (🧪 qa)

- **Spec/test:** TEST-CA-001 (A leg), TEST-CA-003 (A leg), TEST-CA-005,
  TEST-CA-031 (file leg); SPEC-CA-019; REQ-CA-001/003/005; NFR-CA-002/003/005/008.
- **Files:** `tests/ui/chat/FileChips.test.ts`, `tests/ui/chat/FileChips.po.ts`
  (new — one chip per file showing displayName; wikilink `[[path]]` on the
  declarative `title` attr; Enter/Space → open; labelled remove → remove;
  EC-CA-14 `<script>` renders verbatim/escaped; data-testid only).
- **Outcome:** done — RED confirmed (`FileChips.vue` unresolved at import).
- **Commit:** `892d8a0`.

## T-CA-032 — FileChips.vue (🔨 dev)

- **Spec/req:** SPEC-CA-019; REQ-CA-001/003/005; NFR-CA-002/003/008.
- **Files:** `src/ui/chat/FileChips.vue` (new — `<script setup>`; props
  `files`; emits `remove`/`open`; each chip is a `<button>` showing `displayName`
  with the wikilink `[[path]]` on a declarative `:title`, Enter/Space → `open`;
  a labelled `×` remove button, Enter/Space → `remove`; chips in a labelled
  `<ul>`), `src/ui/i18n/locales/en.ts` + `de.ts` (new
  `agent.chat.context.{files,images,selection}` string group — NFR-CA-013),
  `tests/ui/chat/FileChips.test.ts` + `FileChips.po.ts` (EC-CA-14 assertion
  tightened — see deviation).
- **Outcome:** done — the T-CA-031 RED tests now green (10/10). No `v-html`/
  `innerHTML`; no `obsidian` import; no `window.confirm`/`alert`/`prompt`.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors; `eslint` on the changed
  files exit 0; `vitest run` 10/10 green.
- **Commit:** _this commit._
- **Deviation:** the EC-CA-14 RED assertion was tightened in the same batch:
  jsdom serializes `<`/`>` literally inside ATTRIBUTE values (`title`/`aria-label`),
  so a blanket `innerHTML.not.toContain('<script>…')` is a false positive. The
  real contract (a `<script>` never parses into a live ELEMENT; the displayName
  TEXT renders escaped) is asserted via `wrapper.find('script').exists() === false`
  + `&lt;script&gt;` in the serialized markup. The `--sp-chip-*` /
  `--sp-context-bar-gap` tokens the styles reference are minted in Layer 6
  (T-CA-042) — CSS vars resolve at runtime, so this is forward-compatible.

## T-CA-033 — RED ImageContextBar.vue + ImageThumb.vue + POs (🧪 qa)

- **Spec/test:** TEST-CA-007 (A leg), TEST-CA-009, TEST-CA-011; SPEC-CA-020;
  REQ-CA-007/008/009/011; NFR-CA-002/003/005/008.
- **Files:** `tests/ui/chat/ImageContextBar.test.ts` + `ImageContextBar.po.ts`,
  `tests/ui/chat/ImageThumb.test.ts` + `ImageThumb.po.ts` (new — declarative
  `:src` via `resolveThumbSrc`; alt = basename; preview/remove emits; empty bar;
  data-testid only).
- **Outcome:** done — RED confirmed (both components unresolved at import).
- **Commit:** `d4029ee`.

## T-CA-034 — ImageContextBar.vue + ImageThumb.vue (🔨 dev)

- **Spec/req:** SPEC-CA-020; REQ-CA-007/008/009/011; NFR-CA-002/003/008.
- **Files:** `src/ui/chat/ImageThumb.vue` (new — a thumb button binding
  `<img :src="resolveThumbSrc(path)">` declaratively, `alt` = basename, click +
  Enter/Space → `preview`; a labelled `×` remove button → `remove`),
  `src/ui/chat/ImageContextBar.vue` (new — labelled `role=group` row of
  `ImageThumb`s, re-emitting `preview`/`remove`; `resolveThumbSrc` injected so no
  `obsidian` import).
- **Outcome:** done — the T-CA-033 RED tests now green (11/11). No `v-html`/
  `innerHTML`; no `obsidian` import; no `window.confirm`/`alert`/`prompt`; the
  resource path is display-only (the payload stays base64).
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors; `eslint` exit 0;
  `vitest run` 11/11 green.
- **Commit:** _this commit._
- **Deviation:** none. Tokens `--sp-image-thumb-size` / `--sp-chip-*` /
  `--sp-context-bar-gap` are minted in Layer 6 (T-CA-042); CSS vars resolve at
  runtime so this is forward-compatible.
