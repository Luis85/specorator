---
id: ADR-017
title: Define buildSystemPrompt interface contract and defer implementation to claude-cli-chat-sidebar
status: accepted
date: 2026-05-12
deciders:
  - architect
consulted:
  - pm
informed:
  - dev
  - qa
supersedes: []
superseded-by: []
tags: [interface-contract, onboarding, claude-cli-chat-sidebar, persona, system-prompt]
---

# ADR-017 — Define buildSystemPrompt interface contract and defer implementation to claude-cli-chat-sidebar

## Status

Accepted

## Context

REQ-POB-018 requires that `userPersona` be injected as the highest-priority layer ("Layer 0") in any AI system prompt, formatted as:

```
About the person you're helping:
{userPersona}
```

REQ-POB-019 requires that the block be omitted when `userPersona` is an empty string.

The function responsible for constructing system prompts (`buildSystemPrompt()` or equivalent) does not exist in the codebase. The `claude-cli-chat-sidebar` spec (currently at idea stage in `specs/claude-cli-chat-sidebar/`) is the intended home for this function, as it owns the AI interaction layer. Implementing the function in the onboarding feature would create an inversion of concern: onboarding captures data; the sidebar uses it.

Blocking the onboarding implementation on `claude-cli-chat-sidebar`'s design stage completion would delay a user-visible feature for a dependency that can be specified as an interface contract without its implementation.

## Decision

We define the interface contract for system prompt construction here — in the onboarding design and this ADR — and defer the implementation to the `claude-cli-chat-sidebar` feature.

**Contract:**

```ts
/**
 * Constructs the full system prompt for an AI interaction.
 *
 * Layer 0 — persona injection (this contract, REQ-POB-018/019):
 *   If settings.userPersona is non-empty, the prompt MUST begin with:
 *     "About the person you're helping:\n" + settings.userPersona
 *   If settings.userPersona is empty, this block MUST be omitted.
 *   No other content may precede Layer 0 in the returned string.
 *
 * @param settings - The current PluginSettings; the function reads userPersona from this object.
 * @param context  - Feature- or interaction-specific context appended after Layer 0.
 * @returns        - The complete system prompt string, ready for transmission to the AI.
 */
function buildSystemPrompt(settings: PluginSettings, context: string): string
```

The function signature is the binding contract. The `claude-cli-chat-sidebar` implementer must:
1. Accept `settings: PluginSettings` as the first parameter.
2. Prepend the persona block when `settings.userPersona` is non-empty.
3. Omit the persona block when `settings.userPersona` is an empty string.
4. Not place any content before Layer 0.

**What the onboarding feature ships:**
- `PluginSettings.userPersona` field (ADR-016).
- The wizard that captures and saves the value (REQ-POB-006).
- The settings tab field that displays and edits the value (REQ-POB-021).

**What the onboarding feature does NOT ship:**
- The `buildSystemPrompt()` function itself.
- Any AI system prompt construction logic.
- Any call site for the function.

## Considered options

### Option A — Defer implementation to claude-cli-chat-sidebar; define contract here (chosen)
- Pros: Onboarding ships independently; contract is explicit and testable; the implementer in claude-cli-chat-sidebar has an unambiguous specification; no artificial coupling between features.
- Cons: REQ-POB-018 and REQ-POB-019 cannot be verified end-to-end until `claude-cli-chat-sidebar` is implemented. Integration test must be written in the chat-sidebar feature's test suite.

### Option B — Implement buildSystemPrompt() in the onboarding module
- Pros: Closes the full requirement in this feature.
- Cons: Creates an ownership inversion — onboarding owns a core AI interaction function; every AI feature then depends on the onboarding module; this couples features in the wrong direction.

### Option C — Implement as part of a shared application service (new module)
- Pros: Neither feature owns it; shared via application layer.
- Cons: Premature generalisation; the `claude-cli-chat-sidebar` spec has not been designed yet; we do not know whether the function needs to be shared or whether the sidebar is the only consumer. Create-before-needed violates YAGNI.

## Consequences

### Positive
- Onboarding ships without blocking on `claude-cli-chat-sidebar`.
- The `claude-cli-chat-sidebar` implementer has an unambiguous contract to honour, reducing design ambiguity.
- REQ-POB-019 (omit block when empty) is fully testable by unit-testing the contract independently of the function's location.

### Negative
- REQ-POB-018 and REQ-POB-019 are "contract-satisfied" in onboarding (the data is captured and persisted correctly) but "integration-satisfied" only in `claude-cli-chat-sidebar`.
- The PM / reviewer must track this dependency: onboarding is done; the contract is defined; integration is pending `claude-cli-chat-sidebar` design.

### Neutral
- The open question Q1 from DESIGN-POB-001 is resolved by this ADR.

## Compliance

- The `claude-cli-chat-sidebar` design document must reference ADR-017 and confirm it honours the persona-injection contract.
- CI cannot enforce this contract until `claude-cli-chat-sidebar` is implemented. A TODO comment referencing ADR-017 must be placed at the eventual `buildSystemPrompt` call site.
- If the function signature changes at implementation time (e.g. `context` parameter is split), the implementer must update this ADR's status to `superseded` and file a new ADR documenting the deviation.

## References

- REQ-POB-018 (persona as Layer 0 in system prompt)
- REQ-POB-019 (persona block omitted when empty)
- Open question Q1 in DESIGN-POB-001
- `specs/claude-cli-chat-sidebar/` (idea stage — future home of implementation)
- ADR-016 (userPersona field on PluginSettings)

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the predecessor's `status` and `superseded-by` pointer fields may be updated.
