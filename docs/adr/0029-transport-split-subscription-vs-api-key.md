---
id: ADR-0029
title: Split the agent transport into SDK-with-key and subprocess-with-subscription behind one narrow port
status: accepted
date: 2026-05-14
deciders:
  - architect
consulted:
  - pm
  - analyst
informed:
  - dev
supersedes: []
superseded-by: []
tags: [chat, transport, agent-sidepanel-mvp, tos, subscription]
---

# ADR-0029 — Split the agent transport into SDK-with-key and subprocess-with-subscription behind one narrow port

## Status

Accepted

## Context

The shipped `claude-cli-chat-sidebar` (PRD-CCS-001) exposes a single transport — the
`@anthropic-ai/claude-agent-sdk` query generator authenticated with `ANTHROPIC_API_KEY`.
Users who hold a Claude.ai subscription but no API key see the REQ-CCS-018 "Chat is not
set up yet." degraded state and are entirely locked out of the sidebar. The May-2026
Agent Sidepanel design brief calls this out as the largest user-cohort gap in the
product.

Two Anthropic policy facts (RES-ASM-001 §F2, §F6) constrain the solution:

1. The Agent-SDK overview states: *"Anthropic does not allow third party developers to
   offer claude.ai login or rate limits for their products, including agents built on
   the Claude Agent SDK. Please use the API key authentication methods instead."* The
   SDK transport is therefore the only ToS-safe path for **API-key** users.
2. The only ToS-safe path for **subscription** users is for the user to install the
   `claude` binary themselves and for the plugin to shell out to it — the binary
   inherits the user's local OAuth credentials.

Three placement options were evaluated:

1. **Two separate ports.** UI dispatches based on a transport flag and imports both
   ports. Adapter surface stays simple but the UI gains a transport concept and the
   per-port InjectionKey discipline (ADR-008) doubles for one capability.
2. **One narrow port, two adapters.** UI imports a single `ClaudeCliPort` (shape
   preserved from REQ-CCS-021). Selection happens at the plugin-wiring seam; the UI is
   transport-agnostic.
3. **One adapter that branches internally.** The existing `ClaudeCliAdapter` adds an
   internal branch on the active key vs. discovered CLI. Smallest diff but the SDK
   import and the `child_process` import live in the same file, which breaks the
   single-responsibility expectation of `src/infrastructure/obsidian/`.

The `ClaudeCliPort` interface shape (REQ-CCS-021) is already SDK-agnostic — its four
methods (`query`, `isAvailable`, `startup`, `shutdown`) are framed in terms of a prompt
string and a `Result<string, ClaudeCliError>`. Nothing in the interface assumes a
specific transport.

## Decision

We split the transport into two adapters that implement the same narrow port:

- **SDK transport:** the existing `ClaudeCliAdapter` (`src/infrastructure/obsidian/ClaudeCliAdapter.ts`)
  is preserved unchanged on the API-key code path. It continues to call
  `sdkQuery({ prompt, options })`.
- **Subprocess transport:** a new `ClaudeSubprocessAdapter` (`src/infrastructure/obsidian/ClaudeSubprocessAdapter.ts`)
  spawns the user's local `claude` binary via Node `child_process.spawn`. It captures
  `session_id` from the CLI's `system/init` NDJSON event, streams `stream-json` events
  via `readline`, and supports `--resume` for session continuity.

Both adapters implement the same `ClaudeCliPort` (REQ-ASM-001). Selection happens
exactly once, at plugin-wiring time in `src/plugin/main.ts`, via a
`TransportSelector` strategy that applies the deterministic precedence in REQ-ASM-002:

1. SDK transport when `settings.anthropicApiKey` is non-empty after `.trim()`.
2. Subprocess transport when no key is present *and* a `claude` binary is discoverable
   at the configured path.
3. Degraded state otherwise.

The result of this selection is provided through the existing `CLAUDE_CLI_PORT`
InjectionKey (`src/infrastructure/bridge/ports.ts`). The UI sees only the port; it
never branches on transport.

`--bare` is forbidden on the subprocess transport (REQ-ASM-006, D-ASM-002). Mid-session
switching is forbidden (REQ-ASM-003, D-ASM-006): if the active transport becomes
unavailable mid-thread, the panel falls into the REQ-ASM-009 degraded state and
requires a reload to re-select.

## Considered options

### Option A — Two separate ports

- Pros: each adapter declares its own narrow capability; clearest read-the-interface
  contract.
- Cons: UI imports two ports and branches on transport, defeating the
  transport-agnostic application-layer requirement (REQ-ASM-001, REQ-ASM-018); per-
  port InjectionKey discipline doubles for a single capability; the stage-aware
  prompt-assembly module (REQ-ASM-013) would need to know which port to call.

### Option B — One narrow port, two adapters (chosen)

- Pros: UI is transport-agnostic by construction; the existing `ClaudeCliPort` shape
  (REQ-CCS-021) is preserved without change, so all CCS-side tests and components
  continue to work; stage-aware prompting and structured-output framing become
  application-layer concerns above the port, applied identically to both transports
  (REQ-ASM-018); the SDK-transport path is byte-for-byte unchanged from
  `claude-cli-chat-sidebar` v1 (REQ-CCS-013 preserved).
- Cons: the `ClaudeCliPort` name no longer matches the SDK-only adapter — but the
  shape is the right one. Renaming is deferred to a future ADR to keep this change
  minimal.

### Option C — One adapter that branches internally

- Pros: smallest diff; no new files.
- Cons: violates the inward-only import direction (an SDK import and a Node
  `child_process` import in one file create the largest possible blast radius for a
  bad change); test isolation collapses — every change to the subprocess code path
  forces re-running the SDK adapter test suite; ESLint `no-restricted-imports`
  configuration must allow both `obsidian`-adjacent imports in one file, which weakens
  the rule for other adapters.

## Consequences

### Positive

- **ToS-safe subscription support.** Subscription users can chat without pasting a
  credential into the plugin (IDEA-ASM-001 success criterion).
- **Transport-agnostic UI.** The chat panel, prompt-assembly, and structured-envelope
  parser are written once and apply to both transports (REQ-ASM-018).
- **Clean test isolation.** SDK adapter tests do not need a `child_process` fake;
  subprocess adapter tests do not need an SDK fake. `fakeModulePorts()` (ADR-009)
  continues to work because the port shape is unchanged.
- **One-adapter-delete revocation.** If Anthropic withdraws the subprocess pattern,
  removing the subscription transport is a single-file delete plus a one-line change
  to the selector. (Risk R-ASM-001 mitigation.)
- **No mid-session ambiguity.** REQ-ASM-003 forbids silent transport switching; the
  selector runs exactly once per thread and is re-evaluated only on explicit user
  action.

### Negative

- **Doubled adapter surface.** Two files instead of one, two startup paths, two
  shutdown paths. Mitigated by the shared port shape — both implement the same
  four-method contract, so the adapter-shape tests are reusable.
- **Two failure-mode taxonomies merged into one enum.** `ClaudeCliErrorCode` gains
  `CLI_LAUNCH_FAILED` and `STRUCTURED_PARSE_FAILED` codes that originate only from the
  subprocess transport. Mitigated by mapping each new code to a single user-facing
  copy string consistent with REQ-CCS-016.
- **`PluginSettings` grows by two fields.** `claudeCliPath` and (implicitly)
  `transportKind = 'api-key' | 'subscription' | 'degraded'`. Migration treats missing
  values as defaults; no breaking change for existing users.

### Neutral

- The `ClaudeCliPort` name is now historical — it covers both SDK and subprocess
  implementations. A future rename to `AgentPort` may follow but is not required by
  this ADR and is deferred to avoid churning the UI imports.
- The subprocess transport defines its own internal types (`StreamEvent`,
  `SystemInitEvent`, `ResultEvent`) that never cross the port boundary; the port still
  returns `Result<string, ClaudeCliError>` for free-text chat and a separate
  application-layer service handles the structured-envelope path (see ADR-0030).

## Compliance

- `src/domain/ports/ClaudeCliPort.ts` shape is unchanged from REQ-CCS-021. ESLint
  `no-restricted-imports` continues to forbid `obsidian` and `@anthropic-ai/claude-agent-sdk`
  imports in this file.
- `src/infrastructure/obsidian/ClaudeSubprocessAdapter.ts` must `implements ClaudeCliPort`.
- The `TransportSelector` lives in `src/plugin/transport/TransportSelector.ts` and is
  the only place in the codebase that branches on transport. It is unit-tested against
  the three-row truth table in REQ-ASM-002.
- Argument-builder unit test (`src/infrastructure/obsidian/__tests__/subprocess-args.test.ts`)
  asserts `--bare` never appears in any built argv array (REQ-ASM-006).
- An integration test asserts that killing the long-lived subprocess mid-thread
  surfaces the REQ-ASM-009 degraded state and that no further `spawn()` call is made
  until the chat thread is reloaded (REQ-ASM-003).

## References

- IDEA-ASM-001 — Problem statement; Constraints (two transports, one port; no `--bare`).
- PRD-ASM-001 — REQ-ASM-001, REQ-ASM-002, REQ-ASM-003, REQ-ASM-006, REQ-ASM-018.
- RES-ASM-001 — D-ASM-001, D-ASM-002, D-ASM-006; F2 (Agent SDK is not the subscription
  path); F6 (ToS posture).
- ADR-008 — Narrow ports.
- ADR-014 — `ClaudeCliPort` as a narrow port.
- ADR-0027 — Context as a single user turn (assembly stays above the port).
- ADR-0028 — API-key field placement.
- [Anthropic Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [Anthropic support 11145838 — Claude Code with Pro/Max](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only
> the predecessor's `status` and `superseded-by` pointer fields may be updated.
