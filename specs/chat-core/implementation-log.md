---
id: IMPL-CC-001
title: Chat core (P1) — implementation log
stage: implementation
feature: chat-core
status: in-progress
owner: dev
epic: claudian-reboot
phase: P1
created: 2026-05-24
updated: 2026-05-24
---

# Implementation log — chat core (P1)

Chronological, append-only record of T-CC-* execution. Each entry names the task, files changed,
the gate state, and (for TDD pairs) the RED-watched-then-GREEN evidence. RED-test (qa) tasks record
the failing state they establish; implementation (dev) tasks record the GREEN convergence + commit
SHA.

> TDD discipline (mission): RED test authored + watched fail **for the right reason**, then minimal
> code to green, re-run to confirm GREEN. Type-level contracts (`StreamChunk` union exactness,
> `ChatRuntimePort` 9-member keys) use a compile-time `Equals<>` assertion that fails
> `npm run typecheck` (`tsconfig.lint.json`, covering `tests/**`) — mirrors the P0
> `tests/domain/ports/WorkspacePort.test.ts` pattern.

---

## Batch: domain foundation (T-CC-001..007, 027)

### T-CC-001 📐 — Baseline-capture: `claudian-main` P1-surface reference

- **Spec:** NFR-CC-011, NFR-CC-013, NFR-CC-014 (baseline leg).
- **Files:** `specs/chat-core/parity-screenshots.md` (new — 3×2×5 baseline matrix scaffolded,
  baseline column anchored to `D:\Projects\claudian-main`); `specs/chat-core/test-plan.md` (new —
  baseline reference + the qualitative streaming-feel note recorded in the canonical sink).
- **Outcome:** done. No file under `src/` changed (DoD line 3). The baseline screenshot grid is
  scaffolded; the Specorator column + the human visual capture happen at `/spec:review` (T-CC-032).
- **Deviation:** none.

### T-CC-002 🧪 — RED: `StreamChunk` union + `ChatRuntimePort` 9-member shape (qa)

- **Spec:** TEST-CC-002, TEST-CC-003, SPEC-CC-001, SPEC-CC-002, REQ-CC-001a, REQ-CC-002a.
- **Files:** `tests/domain/chat/StreamChunk.test.ts` (new — compile-time `Equals<>` asserts the
  five P1 member shapes + the absence of `text-delta`/`final`); `tests/domain/ports/ChatRuntimePort.test.ts`
  (new — `Equals<keyof ChatRuntimePort, <nine keys>>` exact-key assertion + deferred-member
  absence). Mirrors the P0 `WorkspacePort.test.ts` `Equals<>` idiom.
- **RED watched:** `npx vue-tsc --noEmit -p tsconfig.lint.json` →
  `StreamChunk.test.ts: TS2307 Cannot find module '@/domain/chat/StreamChunk'` + `'@/domain/chat/UsageInfo'`;
  `ChatRuntimePort.test.ts: TS2307 Cannot find module '@/domain/ports/ChatRuntimePort'` + `TS2322 Type 'true' is not assignable to type 'false'`.
  The RED signal for these type-level contracts is the **typecheck** failure (the runtime sentinels
  pass under vitest because `import type` is erased — same as the P0 pattern). Green target =
  T-CC-003 (types) + T-CC-004 (port).
- **Outcome:** done (RED established). Lint + prettier green on the two test files.
- **Deviation:** none.

### T-CC-003 🔨 — Domain chat types (dev)

- **Spec:** SPEC-CC-002..006, REQ-CC-001a, REQ-CC-005a, REQ-CC-006.
- **Files (new, `src/domain/chat/`):** `StreamChunk.ts` (full union mirroring `chat.ts:137`, P1
  subset documented; `toolUseResult?: unknown` per spec), `UsageInfo.ts` (`chat.ts:165` fields),
  `ChatMessage.ts` (P1 subset + per-field rules), `ChatTurn.ts` (`ChatTurnRequest`,
  `PreparedChatTurn`, `ChatRuntimeQueryOptions`, `ChatRuntimeEnsureReadyOptions`), `ProviderId.ts`
  (`'claude'`). Pure interfaces/unions — no `obsidian`, no `node:*`, no class.
- **GREEN:** `npx vitest run --project unit tests/domain/chat/StreamChunk.test.ts` → 2 passed; the
  TEST-CC-002 TS2307 errors for `@/domain/chat/StreamChunk` + `@/domain/chat/UsageInfo` are gone
  from `npm run typecheck`. (The `ChatRuntimePort.test.ts` typecheck errors remain — intended-RED,
  T-CC-004's target.)
- **Outcome:** done. eslint + prettier green on `src/domain/chat/**`; no `obsidian`/`node:*` import.
- **Deviation:** none.

### T-CC-004 🔨 — `ChatRuntimePort` + `MarkdownRenderPort` + barrel re-exports (dev)

- **Spec:** SPEC-CC-001, SPEC-CC-007, SPEC-CC-009, REQ-CC-001, REQ-CC-002a, REQ-CC-006.
- **Files:** `src/domain/ports/ChatRuntimePort.ts` (new — exact 9-member interface, verbatim from
  SPEC-CC-001 + ADR-CC-001 Decision block, with the error-as-chunk convention documented);
  `src/domain/ports/MarkdownRenderPort.ts` (new — `MarkdownInline`/`MarkdownNode`/`SafeRenderResult`
  + one-method `render`); `src/domain/ports/index.ts` (edited — added the chat-port + chat-domain
  re-exports, kept + extended the "do NOT compose into an aggregate" header per ADR-CC-001 §5).
- **GREEN:** the prior RED test TEST-CC-003 (`tests/domain/ports/ChatRuntimePort.test.ts`) now
  passes — `npm run typecheck` exit 0 (the `Equals<keyof ChatRuntimePort, <nine keys>>` assertion
  resolves `true`; the TS2307/TS2322 errors are gone). `npx vitest run --project unit
  tests/domain/ports/ChatRuntimePort.test.ts tests/domain/chat/StreamChunk.test.ts` → 3 passed.
- **Outcome:** done. eslint + prettier green.
- **Deviation:** `MarkdownNode` is declared as an `interface` (not the spec's `type {…}` literal) to
  satisfy the repo's `@typescript-eslint/consistent-type-definitions` rule. Structurally identical
  (same shape, same barrel re-export, same declarative consumption) — a lint-conformance form, not a
  contract change. `MarkdownInline` (a union) stays a `type`.

### T-CC-006 🧪 — RED: `MockChatRuntime` scripted streaming + cancel (qa)

- **Spec:** TEST-CC-001, SPEC-CC-011, REQ-CC-001, REQ-CC-001a, REQ-CC-014.
- **Files:** `tests/infrastructure/mock/MockChatRuntime.test.ts` (new) — scripted `["Hel","lo"]`+`done`
  in order, concat `"Hello"`, generator exhausts after `done`, per-chunk yield boundary via stepwise
  `gen.next()`, `cancel()` stops further yields, scripted `error`/`usage` chunks, default `text…done`
  script, synthetic `getSessionId`/`resetSession`, `onReadyStateChange` unsubscriber.
- **RED watched:** `npm run typecheck` → `TS2307 Cannot find module '@/infrastructure/mock/MockChatRuntime'`;
  `npx vitest run --project unit tests/infrastructure/mock/MockChatRuntime.test.ts` → 1 file failed
  (transform/import error — runtime does not exist). Green target = T-CC-007.
- **Outcome:** done (RED established). eslint + prettier green.
- **Deviation:** none.

### T-CC-007 🔨 — `MockChatRuntime` (scripted in-memory runtime) (dev)

- **Spec:** SPEC-CC-011, REQ-CC-014, NFR-CC-014.
- **Files:** `src/infrastructure/mock/MockChatRuntime.ts` (new) — implements `ChatRuntimePort` (9
  members); optional `MockChatScriptEntry[]` script (string → `text` chunk; default deterministic
  `text…` reply); `providerId='claude'`; `prepareTurn` builds the P1 `PreparedChatTurn`;
  `ensureReady→true`; `isReady→true`; no-op `onReadyStateChange` unsubscriber; synthetic
  `getSessionId`/`resetSession`; `query` is an `async *` yielding each scripted chunk behind a
  per-chunk `await Promise.resolve()` boundary then a single `done`; `cancel()` sets a flag the loop
  reads via `isCancelled()` and stops yielding. No subprocess.
- **GREEN:** `npx vitest run --project unit tests/infrastructure/mock/MockChatRuntime.test.ts` →
  11 passed (TEST-CC-001 incl. the cancel + error + usage legs). `npm run typecheck` exit 0.
- **Outcome:** done. eslint + prettier green.
- **Deviation:** imports the chat types via the `@/domain/ports` barrel (SPEC-CC-009 one-stop import)
  rather than deep `@/domain/chat/*` paths — required because the P0 `DELETED_SUBSYSTEM_BAN` ESLint
  rule (eslint.config.js) still bans deep `@/domain/chat/**` imports outside `src/domain/**`. The
  barrel is the sanctioned consumer import; no ESLint config change needed for this batch. (A later
  batch that needs a deep chat import from infra/ui would update that ban — flagged, not done here.)

### T-CC-027 🔨 — `--sp-*` token additions (token layer only) (dev)

- **Spec:** SPEC-CC-023, NFR-CC-012, REQ-CC-006, REQ-CC-007, REQ-CC-011.
- **Files:** `src/ui/styles/tokens.css` (edited) — new `§4.8 — Chat surface (P1)` block with the 8
  tokens: `--sp-msg-gap` (`var(--sp-space-5)`), `--sp-scrollbar-width` (6px), `--sp-msg-user-bg`
  (`rgba(0,0,0,0.3)`), `--sp-msg-user-max-width` (95%), `--sp-interrupt` (`#d45d5d`),
  `--sp-input-min-h` (140px), `--sp-textarea-min-h` (60px), `--sp-textarea-max-h` (`none`). Color
  literals confined to the token layer (NFR-CC-012).
- **GREEN:** `npm run lint:style-tokens` → "clean (0 violations across guarded paths)"; `npm run lint`
  unaffected (CSS not ESLint-linted). No chat component file exists yet to carry a hex/raw var, so
  zero leaks by construction.
- **Outcome:** done.
- **Deviation:** `--sp-textarea-max-h` set to `none` (spec left the value unspecified) — matches the
  claudian-main parity source (`input.css:84` `max-height: var(--claudian-textarea-max-height, none)`);
  the textarea grows uncapped within the `--sp-input-min-h` wrapper.

---

## Batch: infrastructure-runtimes + InjectionKeys (T-CC-005, 008..012, 015)

### T-CC-005 🔨 — InjectionKeys: `CHAT_RUNTIME_PORT` + `MARKDOWN_RENDER_PORT` (dev)

- **Spec:** SPEC-CC-008, REQ-CC-002, REQ-CC-015.
- **Files:** `src/infrastructure/bridge/ports.ts` (edited) — added `CHAT_RUNTIME_PORT:
  InjectionKey<ChatRuntimePort>` + `MARKDOWN_RENDER_PORT: InjectionKey<MarkdownRenderPort>` after the
  six core keys, typed against the `@/domain/ports` barrel; extended the header comment (no aggregate,
  ADR-CC-001 §5). No deleted-symbol re-introduced.
- **GREEN:** `npx vue-tsc --noEmit -p tsconfig.lint.json` exit 0; `npx eslint src/infrastructure/bridge/ports.ts`
  exit 0 (the `DELETED_INJECTION_KEYS` ban fires on *importing* the name FROM this module, not on
  *declaring/exporting* it here — declaration is clean).
- **Commit:** `ccfdfa4`.
- **Outcome:** done. Unblocks the UI batch.
- **Deviation:** none. (Flag for the UI batch: a consumer that `import { MARKDOWN_RENDER_PORT } from
  '@/infrastructure/bridge/ports'` will trip `DELETED_INJECTION_KEYS` since the name is still in that
  ban list — that is a known UI-batch eslint.config.js reconciliation, out of scope here.)

### T-CC-008 🧪 — RED: `FixtureChatRuntime` replays bundled transcript (dev, RED-first)

- **Spec:** TEST-CC-016 (U leg), SPEC-CC-012, REQ-CC-014.
- **Files:** `tests/infrastructure/localstorage/FixtureChatRuntime.test.ts` (new) — providerId
  `'claude'` + `isReady`, `ensureReady→true`, replays a canned `text…usage…done` transcript (≥1 text,
  exactly one usage, terminal done), usage-before-done ordering, non-empty concatenated text, per-chunk
  yield boundary, `cancel()` stops yields (no terminal done after cancel), synthetic
  `getSessionId`/`resetSession`, `onReadyStateChange` unsubscriber.
- **RED watched:** `npx vitest run --project unit tests/infrastructure/localstorage/FixtureChatRuntime.test.ts`
  → 1 file failed, "no tests" (Vite transform import error — `@/infrastructure/localstorage/FixtureChatRuntime`
  does not resolve). Green target = T-CC-009.
- **Commit:** `aff9f5f`.
- **Outcome:** done (RED established). eslint + prettier green.
- **Deviation:** none.

### T-CC-009 🔨 — `FixtureChatRuntime` (GitHub Pages demo runtime) (dev)

- **Spec:** SPEC-CC-012, REQ-CC-014.
- **Files:** `src/infrastructure/localstorage/FixtureChatRuntime.ts` (new) — implements
  `ChatRuntimePort` (9 members); replays a module-const `FIXTURE_TRANSCRIPT` (`text×3 → usage`) then a
  generator-appended `done`, behind a per-chunk `await Promise.resolve()` boundary; `providerId='claude'`,
  `ensureReady→true`, `isReady→true`, no-op `onReadyStateChange` unsubscriber, synthetic
  `getSessionId`/`resetSession`; `cancel()` sets a flag the loop reads via `isCancelled()`. No `node:*`,
  no subprocess — runs in a plain browser.
- **GREEN:** `npx vitest run --project unit tests/infrastructure/localstorage/FixtureChatRuntime.test.ts`
  → 9 passed. `npx vue-tsc --noEmit -p tsconfig.lint.json` exit 0; eslint exit 0.
- **Commit:** `a361e4f`.
- **Outcome:** done. Imports the chat types via the `@/domain/ports` barrel (SPEC-CC-009), matching the
  T-CC-007 `MockChatRuntime` precedent and the `DELETED_SUBSYSTEM_BAN` deep-import constraint.
- **Deviation:** none.

### T-CC-010 🔨 — `ClaudeCliChatRuntime` (spawn + NDJSON→`StreamChunk` reduce) (dev)

- **Spec:** SPEC-CC-010, REQ-CC-013, NFR-CC-006, NFR-CC-003 (EC-13). Coverage-excluded infra
  (`src/infrastructure/obsidian/**`); behavioural gate is the manual TEST-CC-017.
- **Files:**
  - `src/infrastructure/obsidian/reduceClaudeStream.ts` (new) — `ClaudeStreamReducer`, the **pure,
    deterministic** NDJSON→`StreamChunk` reducer (the testable seam): `system/init` captures
    `session_id`; `assistant` text blocks → optional `assistant_message_start` (once) + `text` chunks
    (accumulate, no `text-delta`); `result` → optional `usage`(+sessionId) then `done`, or `error`+`done`
    for an error result; unparseable line → friendly `error`; blank line → no chunk; `synthesizeError()`
    helper for EC-13. Never throws.
  - `src/infrastructure/obsidian/ClaudeCliChatRuntime.ts` (new) — implements `ChatRuntimePort` (9
    members). Spawns the resolved `claude` CLI (`--print --output-format stream-json --verbose`;
    `--resume`/`--model` when applicable) via `node:child_process`, writes the prompt to stdin and pumps
    stdout lines through the reducer; `cancel()` kills the child **manually** (`child.kill()`, no
    `AbortSignal`); `query` catches any unexpected throw → synthetic `error`+`done` then returns (never
    rethrows). `_resolveBinary()` scans common install dirs + every PATH entry (`node:fs.existsSync`) so
    `ensureReady()` can report `false` before a turn (EC-7). `_buildEnv()` augments PATH for
    GUI-launched Obsidian. **No `data.json`/secret read or write** (NFR-CC-006) — auth is the user's own
    `claude` login.
  - `tests/infrastructure/obsidian/reduceClaudeStream.test.ts` (new) — 9 fixture-driven unit tests for
    the pure reducer (session capture, accumulate-not-delta, single `assistant_message_start`,
    usage+sessionId, error result, unparseable line, blank line, full transcript order, synthesizeError).
- **RED→GREEN:** the reducer is the testable seam (tasks.md gives T-CC-010 no separate RED task; the
  next RED is T-CC-011). RED watched: `npx vitest run --project unit
  tests/infrastructure/obsidian/reduceClaudeStream.test.ts` → 1 file failed, "no tests" (module
  `@/infrastructure/obsidian/reduceClaudeStream` did not resolve). GREEN after impl → 9 passed.
- **GREEN:** `npx vue-tsc --noEmit -p tsconfig.lint.json` exit 0; `npx eslint` on all three files exit 0.
- **Commit:** `72ee148`.
- **Outcome:** done. The real-CLI spawn is the **manual TEST-CC-017** (T-CC-031, human-run); scheduled in
  `test-plan.md`. No CI unit test greens the spawn path (coverage-excluded) — its DoD is structural +
  lint + typecheck + the no-secret review hand-off + the pure-reducer unit tests.
- **Deviation:** `ensureReady()` resolves `true` whenever a `claude` binary is found on PATH/common dirs
  but does **not** verify the user is logged in (a login probe would itself spawn the CLI — deferred to
  P2 hardening per SPEC-CC-010 "Exact flag set is a dev-stage detail"). A not-logged-in state surfaces
  mid-turn as the `error` chunk (the spec's accepted fallback: "mid-turn it is the `error` chunk"). The
  pure reducer lives alongside the runtime under `src/infrastructure/obsidian/**` (coverage-excluded) so
  the spawner stays the sole owner of CLI wire-format; the reducer is still fully unit-tested.

### T-CC-011 🧪 — RED: per-bridge `createChatRuntime()` factory (dev, RED-first)

- **Spec:** TEST-CC-016, SPEC-CC-013, REQ-CC-014, ADR-CC-001 §6.
- **Files:** `tests/infrastructure/mock/createChatRuntime.test.ts` (new) — `MockBridge.createChatRuntime()`
  → `MockChatRuntime`, `LocalStorageBridge.createChatRuntime()` → `FixtureChatRuntime`, each a fresh
  instance per call (`a !== b`), `providerId==='claude'`.
- **RED watched:** `npx vitest run --project unit tests/infrastructure/mock/createChatRuntime.test.ts`
  → 4 failed (`createChatRuntime is not a function`). Green target = T-CC-012.
- **Commit:** `a914d4c`.
- **Outcome:** done (RED established). eslint + prettier green.
- **Deviation:** scope-narrowed to the **runtime-factory leg** only. The `MarkdownRenderPort` leg of
  TEST-CC-016/SPEC-CC-013 is deferred (CLAR-CC-007 — `DELETED_SUBSYSTEM_BAN` blocker, below). The
  `ObsidianBridge` row is covered structurally (its runtime is coverage-excluded, manual TEST-CC-017), so
  the RED test does not instantiate it.

### T-CC-012 🔨 — `createChatRuntime()` factory on all three bridges (dev, slice a+b runtime leg)

- **Spec:** SPEC-CC-013 (runtime leg), REQ-CC-014, ADR-CC-001 §6.
- **Files:** `src/infrastructure/mock/MockBridge.ts` (→ `new MockChatRuntime()`),
  `src/infrastructure/localstorage/LocalStorageBridge.ts` (→ `new FixtureChatRuntime()`),
  `src/infrastructure/obsidian/ObsidianBridge.ts` (→ `new ClaudeCliChatRuntime(this, getVaultBasePath())`).
  Each `createChatRuntime(): ChatRuntimePort` returns a **fresh** per-conversation instance.
- **GREEN:** `npx vitest run --project unit tests/infrastructure/mock/createChatRuntime.test.ts` → 4 passed;
  full chat-infra surface (`tests/infrastructure/mock|localstorage` + reducer) → 62 passed. `npx vue-tsc
  --noEmit -p tsconfig.lint.json` exit 0; eslint exit 0 on all three bridges (the ObsidianBridge import of
  `./ClaudeCliChatRuntime` is allowed — the adapter layer has `no-restricted-imports: off`).
- **Commit:** `07e27f8`.
- **Outcome:** done for the **runtime-factory leg** (tasks.md slice plan a+b). T-CC-011 RED greened.
- **Deviation / DEFERRED (CLAR-CC-007 — escalated, see workflow-state.md):** the
  `safeMarkdownRender`-backed `MarkdownRenderPort` leg of SPEC-CC-013 (and its prerequisites T-CC-013 RED
  / T-CC-014 `safeMarkdownRender` / T-CC-015 adapter) is **NOT delivered in this batch**. The active
  `DELETED_SUBSYSTEM_BAN` (eslint.config.js, ADR-PSR-001) still bans the exact paths SPEC-CC-009/014
  regrow: `@/application/chat/**` (so the mock/localstorage bridges — base-config layer — cannot import
  `@/application/chat/safeMarkdownRender`; verified by an eslint probe), `@/domain/ports/MarkdownRenderPort`
  (deep import — the barrel re-export is allowed), and the `MARKDOWN_RENDER_PORT` InjectionKey name in
  `DELETED_INJECTION_KEYS` (so the UI batch cannot import it from `@/infrastructure/bridge/ports`).
  Delivering the markdown leg as specified requires dropping those entries from the ban lists in
  eslint.config.js — which the batch brief forbids editing. Per Constitution Art. I.3 / IX.3 this is
  handed back to architect/pm rather than worked around by relocating the renderer off its spec'd path.

---

## Batch: application + markdown (T-CC-013..017) — CLAR-CC-007 RESOLVED

> CLAR-CC-007 was resolved upstream: `eslint.config.js` `DELETED_SUBSYSTEM_BAN.group` no longer
> lists `@/application/chat` / `@/application/chat/**` / `@/domain/ports/MarkdownRenderPort`, and
> `DELETED_INJECTION_KEYS.importNames` no longer lists `MARKDOWN_RENDER_PORT`. The chat/markdown
> paths the spec regrows are now importable directly. `@/domain/chat/**` stays banned outside
> `src/domain/**` (chat types consumed via the `@/domain/ports` barrel). This batch closes the
> markdown leg that was blocked plus the application use-case.

### T-CC-013 🧪 — RED: `safeMarkdownRender` (qa-style RED, dev-driven TDD)

- **Spec:** TEST-CC-014, SPEC-CC-014, REQ-CC-006, NFR-CC-008, EC-14.
- **Files:** `tests/application/chat/safeMarkdownRender.test.ts` (new) — empty/whitespace →
  `{ nodes: [] }`; paragraph split on blank lines (incl. intervening whitespace); inline `` `code` ``
  spans (mid / start of paragraph); single-`\n` line break preserved as text; unbalanced backtick →
  literal text (no throw); literal `<`/`&`/`<script>` carried verbatim, no `&lt;`/`&amp;` escaping;
  `**bold**`/`# heading` literal; idempotent shape; never-throws on adversarial input.
- **RED watched:** `npx vitest run --project unit tests/application/chat/safeMarkdownRender.test.ts`
  → 1 failed, "no tests" (module `@/application/chat/safeMarkdownRender` unresolved). Green target = T-CC-014.
- **Commit:** `0f02a93`.
- **Outcome:** done (RED established). eslint + prettier green.

### T-CC-014 🔨 — `safeMarkdownRender` transform

- **Spec:** SPEC-CC-014, REQ-CC-006, NFR-CC-008.
- **Files:** `src/application/chat/safeMarkdownRender.ts` (new) — total/synchronous/idempotent
  `string → SafeRenderResult`. Splits paragraphs on `/\n[ \t]*\n+/`; per-paragraph inline scan emits
  balanced `` `code` `` runs as `{kind:'code'}` and everything else (incl. the single `\n`) as
  `{kind:'text'}`; unbalanced backtick falls through to literal text. No output field holds HTML;
  never throws.
- **GREEN:** `npx vitest run --project unit tests/application/chat/safeMarkdownRender.test.ts` → 13/13.
  `npx vue-tsc --noEmit -p tsconfig.lint.json` exit 0; eslint + prettier green.
- **Commit:** `b617142`.
- **Outcome:** done. T-CC-013 RED greened.

### T-CC-015 🔨 — `MarkdownRenderPort` adapter + bridge markdown wiring (closes the T-CC-012 markdown leg)

- **Spec:** SPEC-CC-015, SPEC-CC-007, SPEC-CC-013 (markdown leg), REQ-CC-006, REQ-CC-014, NFR-CC-008,
  ADR-CC-001 §6.
- **Files:** `src/application/chat/safeMarkdownRenderPort.ts` (new — stateless `MarkdownRenderPort`
  singleton `safeMarkdownRenderPort` whose `render` delegates to `safeMarkdownRender`);
  `tests/application/chat/safeMarkdownRenderPort.test.ts` (new — `render(md)` deep-equals
  `safeMarkdownRender(md)`, no-HTML/no-throw). `src/infrastructure/mock/MockBridge.ts`,
  `src/infrastructure/localstorage/LocalStorageBridge.ts`,
  `src/infrastructure/obsidian/ObsidianBridge.ts` (each gains `createMarkdownRenderPort(): MarkdownRenderPort`
  returning the shared singleton — identical P1 behaviour across bridges; P2 re-backs with Obsidian's
  renderer). `tests/infrastructure/mock/createChatRuntime.test.ts` (extended with the TEST-CC-016
  markdown leg: each bridge exposes the port; Mock/Local behaviour identical; no HTML for adversarial input).
- **GREEN:** `npx vitest run --project unit tests/infrastructure/mock/createChatRuntime.test.ts
  tests/application/chat/` → 23/23. `npx vue-tsc --noEmit -p tsconfig.lint.json` exit 0; eslint exit 0
  on all changed files (infrastructure → application is the inward DDD direction, permitted); prettier clean.
- **Commit:** `7185de0`.
- **Outcome:** done. Completes the previously-blocked markdown leg of T-CC-011/012 (TEST-CC-016).
- **Note:** `createMarkdownRenderPort()` (vs a `createChatRuntime`-style per-call factory) returns the
  shared stateless singleton — SPEC-CC-013 explicitly permits "a `createMarkdownRenderPort()` method or
  a shared singleton; dev-stage choice". The DTO-only port is pure and per-conversation isolation is
  unnecessary.

### T-CC-016 🧪 — RED: `RunChatTurnUseCase` orchestration (qa-style RED, dev-driven TDD)

- **Spec:** TEST-CC-007, TEST-CC-013 (U leg), SPEC-CC-015, REQ-CC-003..005a, 010, 012, NFR-CC-003,
  ADR-CC-001 §1.
- **Files:** `tests/application/chat/RunChatTurnUseCase.test.ts` (new) — a fully-scriptable in-test
  `ScriptedRuntime` (controls chunk sequence, session id, mid-generator throw, cancel) + stub
  `ChatTurnSink` recording call order. Scenarios: dispatch (prepareTurn once, one query with the
  history reference, `text→onText`, `done→onDone`, `ok`), usage forwarded on matching/null sessionId,
  foreign sessionId ignored (EC-11), `error→onErrorChunk` then continue to done (EC-6),
  `ensureReady→false ⇒ err('not-ready')` with no `onAssistantStart`/no query (EC-7), cancel stops the
  loop + delegates to `runtime.cancel()` + `ok` (no `done`), generator-throw ⇒ synthetic
  `onErrorChunk`+`onDone` + `err('runtime-throw')` never rethrown (EC-13), queryOptions pass-through,
  finalise-empty (EC-5).
- **RED watched:** `npx vitest run --project unit tests/application/chat/RunChatTurnUseCase.test.ts`
  → 1 failed, "no tests" (module `@/application/chat/RunChatTurnUseCase` unresolved). Green target = T-CC-017.
- **Commit:** `b3bab93`.
- **Outcome:** done (RED established). prettier green.

### T-CC-017 🔨 — `RunChatTurnUseCase` (turn orchestrator) + `ChatTurnError`

- **Spec:** SPEC-CC-015, REQ-CC-003, 004, 005, 005a, 010, 012, NFR-CC-003, ADR-CC-001 §1.
- **Files:** `src/application/chat/RunChatTurnUseCase.ts` (new) — `ChatTurnError` (`kind:
  'not-ready'|'runtime-throw'`), `RunChatTurnInput`, `ChatTurnSink`, and the `RunChatTurnUseCase`
  class. `run(...)`: `prepareTurn → ensureReady` (false ⇒ `err('not-ready')`, no live message/no
  query, EC-7) `→ onAssistantStart → drainStream` (private `for await` + `dispatchChunk`
  switch); `usage` behind the `isForeignSession` guard (EC-11); `error` forwarded then continue
  (EC-6); `done → onDone` + `ok`; cancel ends the loop ⇒ `ok`. The stream drain is wrapped in
  `tryAsync` so an unexpected throw becomes a Result ⇒ synthetic `onErrorChunk`+`onDone` +
  `err('runtime-throw')`, never rethrown (EC-13). `Result<void, ChatTurnError>` at the discrete
  boundary; the streaming-error-vs-`Result` convention is documented in the file-top doc comment.
- **GREEN:** `npx vitest run --project unit tests/application/chat/RunChatTurnUseCase.test.ts` → 10/10.
  Full chat application+infra surface (`tests/application/chat` + `tests/infrastructure/mock|localstorage`)
  → 82/82. `npx vue-tsc --noEmit -p tsconfig.lint.json` exit 0; eslint + prettier green.
- **Commit:** `96ff568`.
- **Outcome:** done. T-CC-016 RED greened (TEST-CC-007 + TEST-CC-013 U leg).
- **Deviation:** the dispatch loop was factored into private `drainStream`/`dispatchChunk`/
  `isForeignSession` helpers to satisfy the `complexity ≤ 10` lint rule; the raw `try/catch` was
  replaced with `tryAsync` (application-layer `no-restricted-syntax` rule). Behaviour identical to
  the spec's inline `for await` switch; no assertion changed.

### Batch verification (application + markdown)

- `npx vue-tsc --noEmit -p tsconfig.lint.json` exit 0 (no intended-RED remaining — every RED test in
  this batch was greened by its paired impl within the batch).
- 82 chat application + infra unit tests pass. eslint + prettier green on all changed files.
- Not run (deferred to T-CC-032 verify gate per the batch brief): `npm run verify` / `build` /
  `build:web`. `manifest.json` untouched. NOT pushed.

---

## Batch: UI + wire-in (T-CC-018..026, 028..029)

> Strict TDD, one Conventional commit per task, on `feature/chat-core`. RED tests are
> nominally `qa`-owned in tasks.md; authored dev-side as the RED leg of each TDD pair (same
> dev-driven-TDD precedent as the application+markdown batch). Component tests use Vue Test
> Utils + i18n install + class-based `data-testid` PageObjects (ADR-009), mirroring the P0
> `AgentPanelRoot.test.ts` pattern. Vue layer imports chat ports/types via `@/domain/ports` +
> the InjectionKeys from `@/infrastructure/bridge/ports` (CLAR-CC-007 relaxed those bans).

### T-CC-018 🔨 — composables: `useChatRuntimePort()` + `useMarkdownRenderPort()` (dev)

- **Spec:** SPEC-CC-017, REQ-CC-002.
- **Files:** `src/ui/composables/useChatRuntimePort.ts` + `useMarkdownRenderPort.ts` (new —
  inject-or-throw, mirroring `useLoggerPort`); `tests/ui/composables/useChatRuntimePort.test.ts`
  + `useMarkdownRenderPort.test.ts` (new — resolves the provided port; throws a clear
  "was not provided" error when absent).
- **GREEN:** `npx vitest run --project unit tests/ui/composables/*.test.ts` → 4/4. `npx vue-tsc
  --noEmit -p tsconfig.lint.json` exit 0; eslint + prettier green; no `obsidian`/`node:*` import.
- **Commit:** `97efe46`.
- **Outcome:** done. Unblocks the store + components.

### T-CC-019 🧪 → T-CC-020 🔨 — `chatStore` (Pinia) state machine + sink actions (dev TDD)

- **Spec:** SPEC-CC-016 + §6 state machine, REQ-CC-003/004/005/005a/007/009/010/012, EC-1/4/5/7/8/9/10/15.
- **Files:** `tests/ui/stores/chatStore.test.ts` (new RED — 17 cases: empty/welcome, `canSend`
  guard, EC-1 no-op, dispatch + history capture, currentNotePath pass-through, the five sink legs,
  EC-9 ignore-after-cancel, EC-10 usage no content mutation, EC-6 inline error, done→idle / done→error,
  EC-5 finalise-empty, EC-8 cancel→interrupted→idle, EC-7 not-ready sticky-notice/no-dangling-live,
  EC-15 `$reset`, EC-4 no second turn while streaming); `src/ui/stores/chatStore.ts` (new — Pinia
  options store: state `messages`/`status`/`liveAssistantId`/`interruptedId`/`usage`/`errorActive`,
  getters `isEmpty`/`isStreaming` + the `canSend(text)` action, the `ChatTurnSink` legs, and
  `sendMessage`/`cancelTurn`/`$reset` driving a bound `RunChatTurnUseCase`-shaped runner).
- **RED watched:** `npx vitest run --project unit tests/ui/stores/chatStore.test.ts` → module
  `@/ui/stores/chatStore` unresolved.
- **GREEN:** 17/17. typecheck exit 0; eslint + prettier green.
- **Commits:** `01ccd9d` (RED), `bab9e44` (impl).
- **Outcome:** done.
- **Deviation:** the bound runner + the start-failure notifier live OUTSIDE reactive state in a
  module-scoped `WeakMap` keyed by the store instance — so only plain `ChatMessage` DTOs cross the
  store boundary (ADR-003) and Pinia never wraps a use-case instance reactively. SPEC-CC-016 lists
  state fields only; the dependency-injection seam (`bindTurnRunner`) is the dev-stage mechanism the
  surface uses to hand the store its use case (per SPEC-CC-018 "hand it to the store"). EC-7's start-
  fail path surfaces the sticky notice + sets `errorActive` and resolves `status` to idle with no
  dangling live message; it does not append a synthetic assistant message (the spec mentions an
  appended start-fail message, but EC-7's binding constraint is "no dangling live message + sticky
  notice", which this satisfies — the friendly text is delivered via the notice, not an extra turn).

### T-CC-021 🧪 → T-CC-022 🔨 — `ChatComposer.vue` (dev TDD)

- **Spec:** SPEC-CC-021, TEST-CC-009, REQ-CC-007/008/009/010, EC-1/2/3/4.
- **Files:** `tests/ui/chat/ChatComposer.test.ts` + `ChatComposer.po.ts` (new RED — 12 cases:
  render, Enter→submit + preventDefault, EC-1 empty no-op, EC-3 Shift+Enter newline, EC-2 IME-Enter
  no submit, clear-after-submit, send disabled/enabled, click→submit, EC-4 streaming→stop emits
  cancel not submit, EC-4 Enter blocked while streaming, Esc→cancel while streaming, Esc no-op while
  idle); `src/ui/chat/ChatComposer.vue` (new — `<script setup>`; bordered wrapper, auto-grow
  textarea, send/stop control; the keyboard contract; emits `submit(text)`/`cancel()`; focus on
  mount + after finalise; owns no chat state — `isStreaming` is a prop). Added the P1 chat i18n keys
  (`agent.chat.welcome.greeting`, `agent.chat.composer.{placeholder,send,stop}`, `agent.chat.busy`,
  `agent.chat.interrupted`) to `src/ui/i18n/locales/en.ts` + `de.ts`.
- **RED watched:** module `@/ui/chat/ChatComposer` unresolved.
- **GREEN:** 12/12 (+ i18n forbidden-terms + i18n index suites green). typecheck exit 0; eslint +
  prettier green.
- **Commits:** `1808552` (RED), `aaa0868` (impl + i18n keys).
- **Outcome:** done.
- **Deviation:** textarea auto-grow height is bound through Vue's `:style="{ height }"` (a reactive
  ref measured via `scrollHeight` on `nextTick`) rather than a direct `element.style.height` write —
  required to satisfy the `obsidianmd/no-static-styles-assignment` lint rule. Behaviour identical
  (grows from `--sp-textarea-min-h` toward `--sp-textarea-max-h`). The P1 chat i18n keys for the
  welcome/busy/interrupted surfaces are added here (first catalogue touch) so T-CC-024/026 consume
  them; all keys pass the NFR-MPS-011 forbidden-terms guard.

### T-CC-023 🧪 → T-CC-024 🔨 — message render components + `WelcomeGreeting.vue` (dev TDD) 🪓

- **Spec:** SPEC-CC-019/020, TEST-CC-005 (render leg)/008/012/011 (render leg), REQ-CC-004/006/010/011,
  NFR-CC-008, EC-8/12/14/16.
- **Files (RED, new):** `tests/ui/chat/{MarkdownBlock,MessageTurn,MessageList,WelcomeGreeting}.test.ts`
  + co-located `*.po.ts` (data-testid only). `MarkdownBlock`: paragraph split, inline `code` →
  `md-code`, literal `<`/`&`/`<script>` carried as text (no v-html), empty → 0 paragraphs, reactive
  re-render on accumulate. `MessageTurn`: `message-user`/`message-assistant` distinct, `data-streaming`,
  EC-8 interrupted badge, `dir="auto"`. `MessageList`: keyed v-for over `chatStore.messages`, reactive
  accumulate. `WelcomeGreeting`: brand-neutral i18n greeting, no duration footer, de locale.
- **Files (impl, new):** `src/ui/chat/{MarkdownBlock,MessageTurn,MessageList,WelcomeGreeting}.vue`.
  `MarkdownBlock` calls `useMarkdownRenderPort().render(content)` and renders `MarkdownNode[]`
  DECLARATIVELY (`<p data-testid=md-paragraph>` / `<code data-testid=md-code>` / text spans with
  `white-space:pre-wrap`) — no `v-html`/`innerHTML`. `MessageTurn` role-distinct + `data-streaming` +
  `--sp-interrupt` badge + `dir=auto`. `MessageList` keys by `message.id`, auto-scrolls (`scrollTop =
  scrollHeight`) as the live message grows. `WelcomeGreeting` = serif token greeting, no footer.
- **RED watched:** the four component modules unresolved.
- **GREEN:** 18/18. typecheck exit 0; eslint + prettier green; manual hex/raw-obsidian-var scan of
  `src/ui/chat/*.vue` → none (lint:style-tokens guard does not cover `src/ui/chat/**` by default, so
  the no-hardcoded-color rule is satisfied by construction + manual scan).
- **Commits:** `ef07550` (RED), `69131df` (impl).
- **Outcome:** done.
- **Deviation:** `MessageTurn` takes `streaming`/`interrupted` as booleans (derived by the parent from
  `liveAssistantId`/`interruptedId`) rather than reading those ids itself — keeps the turn a pure
  presentational component; `MessageList` (which reads the store) computes them. Structurally
  equivalent to SPEC-CC-019's "`id === liveAssistantId`" rule.

### T-CC-025 🧪 → T-CC-026 🔨 — `ChatSurface.vue` container + state-machine wiring (dev TDD) 🪓

- **Spec:** SPEC-CC-018, TEST-CC-004/005/006/010/011 + TEST-CC-013 (A leg), REQ-CC-003/005/009/010/012,
  EC-4/6/7/8.
- **Files:** `tests/ui/chat/ChatSurface.test.ts` + `ChatSurface.po.ts` (new RED — 7 cases via a
  step-gated `ControllableRuntime` + a NotificationPort spy: welcome-when-empty + `data-provider`,
  send→message-list + busy `aria-live=polite`, per-tick accumulate → "Hello world" before done,
  done→idle + composer re-enabled, cancel→interrupted + idle, scripted error inline + idle + no
  `<script>` injection, ensureReady=false → sticky notice + no dangling live message);
  `src/ui/chat/ChatSurface.vue` (new — `<script setup>`; `data-provider="claude"` root; WelcomeGreeting
  vs MessageList by `isEmpty`; busy indicator `chat-busy` with `aria-live=polite role=status`; on
  mount builds `RunChatTurnUseCase` from `useChatRuntimePort()` and binds it via
  `chatStore.bindTurnRunner` with a `useNotificationPort().showError` start-failure notifier (EC-7);
  `onBeforeUnmount` → `chatStore.$reset()` cancels the in-flight turn (EC-15); wires composer
  `submit`→`sendMessage`, `cancel`→`cancelTurn`).
- **RED watched:** module `@/ui/chat/ChatSurface` unresolved.
- **GREEN:** 7/7. typecheck exit 0; eslint + prettier green; no hex/raw-var leak.
- **Commits:** `25feb7b` (RED), `b5bdb41` (impl).
- **Outcome:** done.
- **Deviation:** EC-15 is honoured via `ChatSurface.onBeforeUnmount → store.$reset() → runtime.cancel()`
  rather than a separate `onClose`-stage cancel; `AgentSidebarView.onClose` calling `vueApp.unmount()`
  fires that hook synchronously during teardown, so "cancel then unmount" holds without duplicate
  wiring (see T-CC-029).

### T-CC-028 🧪 → T-CC-029 🔨 — wire `ChatSurface` into the sidebar + standalone entry (dev TDD) 🪓

- **Spec:** SPEC-CC-022, TEST-CC-015, REQ-CC-002/014/015, NFR-CC-001, EC-15.
- **Files:** `tests/ui/chat/mount.test.ts` (new RED — imports `@/ui/main`; asserts `chat-surface` +
  `data-provider=claude` + welcome render present and `agent-panel-empty` absent — proving both chat
  ports provided since `ChatSurface.useChatRuntimePort()` would throw otherwise); `src/ui/main.ts`
  (edited — mounts `ChatSurface` in `ErrorBoundary`, provides `CHAT_RUNTIME_PORT` from
  `bridge.createChatRuntime()` + `MARKDOWN_RENDER_PORT` from `bridge.createMarkdownRenderPort()`
  alongside the six core ports); `src/plugin/AgentSidebarView.ts` (edited — same mount + provide
  swap; `onClose` unmount → `ChatSurface.onBeforeUnmount` cancels the in-flight turn before teardown,
  EC-15); `tests/ui/main.test.ts` (edited — the P0 TEST-PSR-022 standalone test updated to assert
  `chat-surface` instead of `agent-panel-empty`, per the batch brief's explicit authorisation).
- **RED watched:** `tests/ui/chat/mount.test.ts` → `chat-surface` null (view still mounted AgentPanelRoot).
- **GREEN:** mount + standalone tests 2/2; full chat-UI surface 13 files / 71 tests pass; full unit
  suite 39 files / 291 tests pass (the run reported 18 vitest worker-startup *timeout* errors under
  whole-suite parallelism — environmental resource exhaustion, exit code 0, every test file passed;
  the targeted chat suites are independently green). typecheck exit 0; eslint + prettier + style-tokens
  green.
- **Commits:** `698bcc7` (RED), `2b5bf06` (impl).
- **Outcome:** done. The plugin now mounts the chat surface statically (live sidebar + `npm run dev`).
- **Deviation:** `AgentPanelRoot.vue` + its direct unit test (`tests/ui/agent/AgentPanelRoot.test.ts`)
  are LEFT IN PLACE — no longer mounted by any production view, but still exercised by their own
  direct test (so not dead code) and the `agent.empty.placeholder` i18n key stays referenced. Removing
  the P0 component is out of this UI-batch scope; flagged for a follow-up if the reviewer wants it gone.

### Batch verification (UI + wire-in)

- `npx vue-tsc --noEmit -p tsconfig.lint.json` exit 0 (no intended-RED remaining — every RED test in
  this batch was greened by its paired impl within the batch).
- Targeted chat-UI surface: 13 test files / 71 tests pass (composables, store, all five components,
  mount, the updated standalone entry, the i18n forbidden-terms + index guards). Full unit suite:
  39 files / 291 tests pass.
- eslint + prettier + `npm run lint:style-tokens` green on all changed files. No `v-html`/`innerHTML`/
  `window.confirm`; no `obsidian`/`node:*` under `src/ui/**`; tokens only (no component hex/raw var).
- Not run (deferred to the final batch per the brief): T-CC-030 (`npm run dev` smoke), T-CC-031
  (manual real-CLI), T-CC-032 (`npm run verify` / `build` / `build:web` + parity sign-off + draft PR).
  `manifest.json` untouched. NOT pushed.

---

## Hand-back / clarification

### CLAR-CC-007 — `DELETED_SUBSYSTEM_BAN` blocks the regrown chat/markdown paths — **RESOLVED**

- **Owner to action:** architect / pm (eslint.config.js is a guardrail change).
- **Blocked tasks:** T-CC-013, T-CC-014, T-CC-015, and the `MarkdownRenderPort` leg of T-CC-011 /
  T-CC-012; downstream the UI composable `useMarkdownRenderPort` (T-CC-018) + the
  `MARKDOWN_RENDER_PORT` provide wiring (T-CC-029).
- **Conflict:** `eslint.config.js` `DELETED_SUBSYSTEM_BAN.group` still lists `@/application/chat/**` and
  `@/domain/ports/MarkdownRenderPort`, and `DELETED_INJECTION_KEYS.importNames` still lists
  `MARKDOWN_RENDER_PORT` — all P0-reboot deletions. SPEC-CC-009 / SPEC-CC-014 / SPEC-CC-008 explicitly
  **regrow** these exact paths in P1. The bans fire on any consumer import (eslint probe confirmed for
  `@/application/chat/safeMarkdownRender` from `src/infrastructure/mock/**`).
- **Proposed resolution (for architect/pm):** drop `@/application/chat/**`,
  `@/domain/ports/MarkdownRenderPort`, and the `MARKDOWN_RENDER_PORT` importName from the three ban lists
  (they regrow per ADR-PSR-001's "regrow per phase" clause). Note `@/domain/chat/**` stays banned outside
  `src/domain/**` — the chat domain types are consumed via the `@/domain/ports` barrel (already shipped),
  so that ban does not need touching. Once reconciled, T-CC-013→015 + the T-CC-012 markdown leg proceed.
- **Status:** **RESOLVED (2026-05-24).** The ban lists were relaxed upstream (the three regrown paths
  + the `MARKDOWN_RENDER_PORT` importName dropped per ADR-PSR-001's "regrow per phase"). The markdown
  leg of T-CC-012 + T-CC-013→015 landed in the application+markdown batch (commits `0f02a93`,
  `b617142`, `7185de0`, `b3bab93`, `96ff568`). The downstream UI consumers (`useMarkdownRenderPort`
  T-CC-018, the `MARKDOWN_RENDER_PORT` provide wiring T-CC-029) are unblocked for the UI batch.
