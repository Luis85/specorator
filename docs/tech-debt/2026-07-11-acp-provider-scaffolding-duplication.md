---
type: tech-debt
title: "Cursor↔Opencode ACP scaffolding duplication (rule-of-three deferred)"
date: 2026-07-11
status: accepted
priority: "3 - low"
scope: providers/acp, providers/cursor, providers/opencode
tags:
  - tech-debt
  - providers
  - acp
  - refactoring
---

# Cursor↔Opencode ACP scaffolding duplication

## Summary

Cursor and Opencode are both direct consumers of the shared `src/providers/acp/`
transport stack (`AcpClientConnection`, `AcpSessionUpdateNormalizer`,
`AcpToolStreamAdapter`, `AcpStreamChunkQueue`). Each provider layers a thin
dialect module on top, and in doing so **mirrors** two pieces of scaffolding:

1. **Tool-name resolver scaffolding** — each provider ships its own
   `create*AcpToolStreamAdapter()` factory plus a `resolve*RawToolName` /
   `normalize*ToolName` / `normalize*ToolInput` / `normalize*ToolUseResult` set
   wired into `AcpToolStreamAdapter` (`cursorAcpToolNames.ts` vs Opencode's
   equivalent). The per-provider tool maps differ; the wiring shape does not.
2. **Runtime session wiring** — `CursorChatRuntime` and `OpencodeChatRuntime`
   share a near-identical skeleton: lazy `agent acp` spawn, `initialize` →
   `session/new`/`load` (+ fallback) → mode/model application → `session/prompt`
   → `session/update` normalization → cooperative `session/cancel` with
   process-kill escalation, plus the `AcpStreamChunkQueue` drain loop and
   terminal-push dedup.

## Why it is deliberate (not yet extracted)

This was a conscious call in the Cursor ACP runtime design
([`docs/superpowers/specs/2026-07-11-cursor-acp-runtime-design.md`](../superpowers/specs/2026-07-11-cursor-acp-runtime-design.md),
Architecture "Approach A"): Cursor became a **second** direct consumer of the
shared stack rather than triggering an `AcpChatRuntimeBase` extraction on the
strength of a single prior consumer. Two implementations is exactly where a
premature base class tends to encode one provider's accidents as the other's
contract. The providers already diverge in ways a shared base would have to
parameterize anyway: Cursor's blocking `cursor/ask_question` /
`cursor/create_plan` extensions and advertised-model wire-id matching vs
Opencode's managed `plan` mode, managed MCP, and permission mapping.

The duplication is baselined and gated, not drifting: the fallow ratchet
(`scripts/quality-baseline.json`) currently holds `cloneGroups=38` /
`duplicatedLines≈979`, which includes these mirrors. Any *new* duplication trips
the gate.

## Rule-of-three trigger

Extract a shared `AcpChatRuntimeBase` (session lifecycle skeleton) and/or a
shared tool-name resolver factory **when a third ACP provider lands** — the
gemini-cli candidate is the named next consumer. At that point the common shape
is evidenced by three independent implementations, not guessed from two, and the
extraction can be driven by the real variation points all three exercise.

Until then: keep the mirrors in sync by hand when touching the shared flow, and
do not grow `cloneGroups` / `duplicatedLines` past the baseline.
