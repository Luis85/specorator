---
feature: "Claude CLI chat sidebar"
area: CCS
slug: claude-cli-chat-sidebar
stage: implementation
pr: draft — targeting develop
last_updated: 2026-05-14
last_agent: dev
---

# Implementation Log — PR-1 Infrastructure (T-CCS-001 through T-CCS-015)

## Overview

PR-1 lays the foundational infrastructure for the Claude CLI chat sidebar: the domain port, SDK wiring, context-prompt builder, mock/production adapters, Pinia store, injection keys, and settings field. No UI components are included in this PR.

---

## Entry 1 — T-CCS-001, T-CCS-003: ClaudeCliPort domain interface + SDK install

**Commit:** `8391d7a`
**Spec reference:** SPEC-CCS-001 §2.1–§2.3; REQ-CCS-002, REQ-CCS-003

**Files changed:**
- `package.json` (line ~45) — added `@anthropic-ai/claude-agent-sdk` to dependencies
- `package-lock.json` — lockfile updated
- `src/domain/ports/ClaudeCliPort.ts` (1–55, new) — `ClaudeCliErrorCode` union, `ClaudeCliError` class, `ClaudeCliQueryOptions`, `ClaudeCliPort` interface
- `src/domain/ports/index.ts` (added 2 export lines) — re-exports port types
- `tests/domain/ports/ClaudeCliPort.test.ts` (new) — 8 tests verifying ClaudeCliError prototype chain, errorCode, message, optional cause

**Outcome:** done
**Deviation:** none

---

## Entry 2 — T-CCS-007: buildPrompt application service

**Commit:** `ebe9993`
**Spec reference:** SPEC-CCS-001 §3.3; REQ-CCS-007

**Files changed:**
- `src/application/chat/buildPrompt.ts` (1–140, new) — `ContextFile`, `BuildPromptResult` interfaces; `DEFAULT_TOKEN_CAP`, `CHARS_PER_TOKEN`, `MIN_ACTIVE_FILE_CHARS` constants; 8-step LIFO cap algorithm
- `tests/application/chat/buildPrompt.test.ts` (new) — 13 tests covering empty input, format, budget enforcement, LIFO drop, auto-file trim, hard-truncation

**Outcome:** done
**Deviation:** none

---

## Entry 3 — T-CCS-005: MockClaudeCliPort test double

**Commit:** `ae1bb2c`
**Spec reference:** SPEC-CCS-001 §6; REQ-CCS-022

**Files changed:**
- `src/infrastructure/mock/MockClaudeCliPort.ts` (new) — controllable fields `available`, `cannedResponse`, `queryError`, `delayMs`, `queryLog`; implements all ClaudeCliPort methods
- `tests/infrastructure/mock/MockClaudeCliPort.test.ts` (new) — 13 tests for all method branches and field defaults
- `eslint.config.js` — added override to disable `obsidianmd/prefer-active-window-timers` for `src/infrastructure/mock/**` (mock infra cannot import obsidian)

**Outcome:** done
**Deviation:** ESLint override scoped to mock and localstorage infra layers; `prefer-active-window-timers` cannot apply where `obsidian` is not importable.

---

## Entry 4 — T-CCS-015: ClaudeCliAdapter production implementation

**Commit:** `6cf7184`
**Spec reference:** SPEC-CCS-001 §5; REQ-CCS-002, REQ-CCS-003, REQ-CCS-016, REQ-CCS-017, REQ-CCS-025

**Files changed:**
- `src/infrastructure/obsidian/ClaudeCliAdapter.ts` (new, ~200 lines) — constructor with injectable `resolveCliPath`; `startup()` sets `ANTHROPIC_API_KEY` env var; `query()` uses `Promise.race` with `setTimeout` for timeout; error mapping to structured `ClaudeCliError`; private helpers: `_unavailableCode`, `_clampTimeout`, `_makeTimeoutPromise`, `_runSdkQuery`, `_mapError`
- `tests/infrastructure/obsidian/ClaudeCliAdapter.test.ts` (new) — 16 tests covering startup paths (empty key, resolver throws, success), isAvailable, query unavailable/success/timeout/error, shutdown lifecycle

**Outcome:** done
**Deviation:** Complexity rule satisfied by extracting 5 private helper methods. `setTimeout` used directly for timeout promise with `// eslint-disable-next-line obsidianmd/prefer-active-window-timers` (using `activeWindow.setTimeout` here would cause unsafe-call TypeScript errors in the infrastructure layer).

---

## Entry 5 — T-CCS-011: Injection keys and composables

**Commit:** `8ff9b13`
**Spec reference:** SPEC-CCS-001 §4; REQ-CCS-011; ADR-008

**Files changed:**
- `src/infrastructure/bridge/ports.ts` — added `CLAUDE_CLI_PORT: InjectionKey<ClaudeCliPort>` and `IS_MOBILE_KEY: InjectionKey<boolean>`
- `src/ui/composables/useClaudeCliPort.ts` (new) — `inject(CLAUDE_CLI_PORT)` with guard-throw if not provided
- `src/ui/composables/usePlatform.ts` (new) — returns `{ isMobile }` from `inject(IS_MOBILE_KEY, false)`

**Outcome:** done
**Deviation:** none

---

## Entry 6 — T-CCS-013: useChatStore Pinia store

**Commit:** `6a291ff`
**Spec reference:** SPEC-CCS-001 §7; REQ-CCS-013

**Files changed:**
- `src/ui/stores/chatStore.ts` (new, ~140 lines) — exports `ContextFileEntry`, `ChatStatus`, `ChatErrorType`, `useChatStore`; state: `contextFiles`, `userText`, `response`, `status`, `errorType`, `truncated`; actions: `addContextFile` (dedup), `removeContextFile`, `setActiveFile` (null guard, forces isAuto, index 0), `setUserText`, `beginRequest`, `setResponse`, `setError`, `clearResponse`, `reset`
- `tests/ui/stores/chatStore.test.ts` (new) — 30 tests covering all state transitions, dedup logic, null handling, and reset behavior

**Outcome:** done
**Deviation:** `ChatErrorType = 'timeout' | 'query_failed'` is store-level (not full ClaudeCliErrorCode) per SPEC-CCS-001 §7. `API_KEY_MISSING` and `NOT_INSTALLED` are not surfaced as store error types because they are handled at startup, not at query time.

---

## Entry 7 — T-CCS-008, T-CCS-010: anthropicApiKey settings field

**Commit:** `636f965`
**Spec reference:** SPEC-CCS-001 §8.3; REQ-CCS-001, REQ-CCS-008; NFR-CCS-006; D-CCS-002

**Files changed:**
- `src/domain/settings/PluginSettings.ts` — added `readonly anthropicApiKey: string` to interface; `anthropicApiKey: ''` to `DEFAULT_SETTINGS`
- `src/plugin/settings.ts` — added `renderAnthropicKeyField()` private method (password input, autocomplete off, data-testid, onChange trims); called from `display()` after `renderMcpServerStatus()`
- `src/plugin/loadSettings-migrate.ts` — added `'mcpServerEnabled'` and `'anthropicApiKey'` to `PLUGIN_SETTINGS_KEYS`
- `src/core/core-settings.ts` — added `anthropicApiKey` coercion in `validateSettings()` return object
- `tests/plugin/settings.test.ts` (new) — 4 tests for field presence, password type, data-testid, autocomplete
- `tests/plugin/loadSettings-migrate.test.ts` — updated PLUGIN_SETTINGS_KEYS tripwire to include new keys
- `tests/core/core-settings.test.ts` — updated schema field count to subtract `manuallyRenderedKeys` (anthropicApiKey excluded from module-driven schema per D-CCS-002)

**Outcome:** done
**Deviation:** `anthropicApiKey` is absent from `settingsSchema.fields` — this is per-spec (SPEC-CCS-001 §8.3, D-CCS-002): the key is rendered outside the module loop to enable password masking. The two updated test files reflect the spec, not the previous incorrect assumption.

---

## T-CCS-016: PR-1 gate verification

**Date:** 2026-05-14
**Results:**

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass (8 pre-existing warnings, 0 errors) |
| `npm run test` | 713 passed (64 files) |
| `npm run build` | pass — 497 modules |
| `npm run build:web` | pass — 123 modules |
| `npm audit --audit-level=high --omit=dev` | 0 vulnerabilities |

**Outcome:** all gates green.
