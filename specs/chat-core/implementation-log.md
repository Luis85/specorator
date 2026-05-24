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

## Hand-back / clarification

### CLAR-CC-007 — `DELETED_SUBSYSTEM_BAN` blocks the regrown chat/markdown paths

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
- **Status:** the runtime-factory half of the batch is complete + green; the markdown half awaits the
  guardrail decision.
