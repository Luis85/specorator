---
id: RES-MPS-001
title: "Cursor public HTTP API — shape spike (CQ-MPS-01)"
stage: research
feature: multi-provider-agent-sidepanel
owner: dev
created: 2026-05-21
status: closed-as-deferred
---

# Research spike — Cursor public HTTP API shape

Resolves the WS-4 entry-point clarification CQ-MPS-01 from `spec.md` §11
hand-off. Time-boxed to ≤ ½ day.

## Question

Does Cursor expose a stable public HTTP/SSE chat API we can target from
`CursorApiAdapter` for v1 of multi-provider-agent-sidepanel?

## Findings

- **No publicly versioned reference.** Cursor (cursor.com) ships a
  product API for editor integration and a billing/usage API
  (`api.cursor.com`), but as of 2026-05-21 no documented, stable
  `/chat/completions`-style SSE endpoint is published for third-party
  agent integration. The closest public surface is the `cursor-agent`
  CLI (owned by WS-5).
- **OpenAI-compatible posture (assumed).** Cursor's broader product
  posture (model picker, tool-use, attachments) is OpenAI-compatible at
  the wire level for upstream model traffic. Until Cursor publishes a
  versioned third-party agent endpoint, we encode the adapter against
  the design §C8 event mapping (`message_delta`, `tool_use`,
  `citation`, `usage`, `done`, `error`) and a placeholder base URL.
- **Placeholder base URL.** `CURSOR_API_BASE_URL = 'https://api.cursor.sh/v1'`,
  endpoint path `'/chat/stream'`. Injected by `buildProviderRegistry`
  so the production wiring can swap the value once Cursor publishes
  the official URL.

## Decision

- **`cursorApiPreview` default stays `false` in v1.** The adapter ships
  fully implemented and unit-tested, but `selectTransport` keeps R7
  folded to `degraded` for every user unless they explicitly enable
  the preview toggle (REQ-MPS-014). This satisfies CQ-MPS-01 without
  blocking WS-4: the adapter is shippable, the seam is built, and a
  base-URL swap is a one-line registry edit when Cursor publishes
  their endpoint.
- WS-5 (Cursor CLI) is the primary `mode='cli'` surface and stays the
  recommended Cursor path for v1.

## References

- SPEC-MPS-001 §5 (Cursor API adapter contract).
- DES-MPS-001 §C8 (event mapping table).
- ADR-MPS-003 §Context (forces around the preview flag).
- CQ-MPS-01 (open clarification — closed by this spike as **deferred**).
