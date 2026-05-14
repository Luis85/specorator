---
id: ADR-0027
title: Assemble context as a single user turn in the Claude SDK call
status: accepted
date: 2026-05-14
deciders:
  - architect
consulted:
  - pm
informed:
  - dev
supersedes: []
superseded-by: []
tags: [chat, sdk, prompt-assembly]
---

# ADR-0027 — Assemble context as a single user turn in the Claude SDK call

## Status

Accepted

## Context

The `@anthropic-ai/claude-agent-sdk` `query()` generator accepts a `prompt` string and
`options.maxTurns`. The chat sidebar must include the content of one or more vault files
alongside the user's typed message. Two assembly strategies were considered:

1. **System-prompt injection:** place file content in a separate system-prompt field.
2. **Single user-turn preamble:** prepend file sections directly to the `prompt` string
   as a structured preamble, then append the user's message.

The feature is v1, single-turn only (`maxTurns = 1`). There is no conversation history.
All context must fit in one prompt. The PRD explicitly prohibits exposing "system prompt"
terminology to users (NFR-CCS-012).

## Decision

We assemble context and user text into a single `prompt` string using the format:

```
The following files are provided for context:

---
File: <vault-relative-path>
---
<file content>

---

<user text>
```

The assembled string is passed as the sole `prompt` argument to `sdkQuery()`. No separate
system-prompt channel is used. `maxTurns` is clamped to 1 in the adapter.

This is implemented in `src/application/chat/buildPrompt.ts` as a pure function with no
I/O or side effects.

## Considered options

### Option A — Single user-turn preamble (chosen)

- Pros: works with any SDK that accepts a single prompt string; easy to test as a pure
  function; no SDK-specific system-prompt API surface; `buildPrompt` is independently
  testable; no terminology leakage.
- Cons: the preamble occupies part of the user-turn budget rather than a separate context
  channel; the model may treat file content and user message with equal authority.

### Option B — System-prompt injection

- Pros: model may give stronger attention to system-context; cleaner semantic separation.
- Cons: requires SDK-specific API that breaks the narrow-port contract (ClaudeCliPort
  interface would need a system-prompt parameter, leaking SDK semantics); conflicts with
  NFR-CCS-012 (no system-prompt terminology in user-visible surface); complicates the
  v2 multi-provider swap.

## Consequences

### Positive

- `buildPrompt()` is a pure function testable without any SDK dependency.
- The `ClaudeCliPort.query()` signature stays minimal (`prompt: string, options?`).
- Swapping the underlying SDK in v2 does not require changes to `buildPrompt`.

### Negative

- File content and user message share the same token budget; the 50 000-token cap
  applies to the combined string (addressed by the LIFO-removal and auto-file-trim
  algorithm in `buildPrompt`).
- The model has no semantic boundary between "context" and "instruction"; this is
  acceptable for v1 single-turn use.

### Neutral

- `maxTurns > 1` is clamped by the adapter with a warn-level log; v2 can revisit the
  turn structure without touching the port interface.

## Compliance

- `src/application/chat/buildPrompt.ts` must have no imports from `obsidian` or
  `@anthropic-ai/claude-agent-sdk` (enforced by ESLint `no-restricted-imports`).
- `buildPrompt` unit tests must verify the exact preamble format (REQ-CCS-025).
- The adapter's `_runSdkQuery` passes only `{ prompt, options: { maxTurns: 1 } }` to
  `sdkQuery`; no system-prompt argument is present.

## References

- PRD-CCS-001 REQ-CCS-025, REQ-CCS-026, REQ-CCS-027, NFR-CCS-008, NFR-CCS-012
- `src/application/chat/buildPrompt.ts`
- `src/infrastructure/obsidian/ClaudeCliAdapter.ts` (`_runSdkQuery`)
- ADR-008 (narrow port interfaces)

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only
> the predecessor's `status` and `superseded-by` pointer fields may be updated.
