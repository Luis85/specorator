---
id: ADR-007
title: Defer live agent runtime behind a review boundary
status: accepted
date: 2026-05-03
references:
  - docs/product-vision.md
  - docs/glossary.md
  - docs/pre-feature-architecture-readiness.md
  - specs/agent-interaction-placeholder/idea.md
---

# ADR-007 - Defer live agent runtime behind a review boundary

## Decision

Specorator v1 does not execute live agents and does not grant automated coworkers direct write access to vault files.

The v1 architecture may expose placeholders, terminology, and typed extension points for future agent interaction, but durable vault mutation remains deterministic and user initiated. Agent-produced content in v2 must enter the system as proposed output that a user can review, edit, accept, or reject before it becomes a vault artifact.

Future agent integration must be introduced through a dedicated application boundary that separates:

- selected vault context from unrestricted vault access;
- agent execution from deterministic workflow-state parsing and validation;
- proposed outputs from accepted vault writes;
- runtime provider choices from domain and UI workflow rules.

The following decisions are explicitly deferred until the v2 agent work starts:

- provider/runtime selection, including whether `agentonomous` is embedded, launched out of process, or reached through a companion service;
- credential and API key storage;
- long-running job orchestration, cancellation, and retry semantics;
- concurrent edits and conflict resolution between human and agent output;
- telemetry, audit log, and redaction policy.

## Rationale

The product vision depends on agentic coworkers, but v1's safety property is that workflow state is plain Markdown in the user's vault and deterministic code controls writes. Introducing a runtime too early would blur permission, review, and persistence boundaries before the core workflow is stable.

## Consequences

- v1 UI may reserve space for agent interaction, but it must not imply live execution is available.
- Agent output cannot bypass the same vault path and overwrite guardrails used by ordinary repository writes.
- Workflow-state parsing remains a deterministic infrastructure concern, not an agent-runtime concern.
- v2 implementation work needs a fresh ADR or an update to this ADR before adding live execution.
