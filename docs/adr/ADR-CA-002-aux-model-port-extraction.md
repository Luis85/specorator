---
id: ADR-CA-002
title: Extract a narrow AuxModelPort for one-shot cold-start aux queries and re-point GenerateTitleUseCase + RefineInstructionUseCase onto it; InlineEditUseCase is the third consumer
status: accepted       # proposed | accepted | deprecated | superseded by ADR-NNNN
date: 2026-05-25
accepted: 2026-05-25    # autonomous-drive: architect files, PM accepts; human defers to one final epic-review gate
deciders:
  - architect
consulted:
  - pm
  - analyst
informed:
  - planner
  - dev
  - qa
  - ux-ui-designer
supersedes: []
superseded-by: []
tags: [architecture, ports, auxiliary, side-query, refactor, claudian-reboot, P5]
---

# ADR-CA-002 — Extract `AuxModelPort` now; re-point the two existing side-query consumers

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-25): architect files, PM
accepts, human defers to one final epic-review gate. Resolves **CLAR-CA-004** (the port half).
Unblocks `PRD-CA-001` (REQ-CA-021, REQ-CA-026, REQ-CA-027, REQ-CA-028).

## Context

P5 inline-edit runs an AI instruction against a selection as a **one-shot, cold-start side-query**
that must not steer the active tab's main stream (REQ-CA-021). This is the **third** consumer of the
exact same shape:

| Consumer | Phase | System prompt + parser | Calls |
|---|---|---|---|
| `GenerateTitleUseCase` | P3 | `TITLE_GENERATION_SYSTEM_PROMPT` + `parseTitleGenerationResponse` | `runtime.query(turn, [], { forceColdStart: true })` |
| `RefineInstructionUseCase` | P4 | `buildRefineSystemPrompt` + `parseRefineResponse` | `runtime.query(turn, [], { forceColdStart: true })` |
| `InlineEditUseCase` *(P5, new)* | P5 | inline-edit system prompt + `parseInlineEditResponse` | a one-shot cold-start aux query |

Both existing use cases are **structurally identical**: build a prepared turn whose text is
`systemPrompt + "\n\n" + body`, drive `query(..., { forceColdStart: true })`, accumulate `text`
chunks, ignore tool/thinking, stop on `done`, map an `error` chunk to a `Result.err`. ADR-TS-003 (P3)
deferred a dedicated `AuxModelPort` to **P4-or-P5**; ADR-CP-003 (P4) re-confirmed the deferral and
named **P5 inline-edit the re-evaluation point**, with two small named re-point sites.

P5 is that re-evaluation point. New this phase: inline-edit needs **continue-conversation**
(REQ-CA-026 — a clarification round-trip), and the aux query must be **abortable** (the modal can be
dismissed mid-query). Both are aux-query concerns the bare `runtime.query` shape does not name. Three
consumers + two new aux-specific concerns = the threshold ADR-CP-003 set is now met.

## Decision

### 1. Extract a narrow `AuxModelPort` (Option B, now earned)

We add **one** narrow port for the one-shot cold-start aux query, plus its `InjectionKey` and
composable (ADR-008 one-port-one-consumer; the "consumer" is the aux-query family — title, refine,
inline-edit):

```ts
// src/domain/ports/AuxModelPort.ts
export interface AuxQueryOptions {
  readonly systemPrompt?: string;   // frames the one-shot request (was prepended to text before)
  readonly model?: string;          // optional aux-model override (defaults to the active model)
  readonly signal?: AbortSignal;    // P5: dismiss/cancel the in-flight aux query (REQ-CA-027)
}

export interface AuxModelPort {
  /**
   * Run a single cold-start aux query and return the accumulated text. Cold-start =
   * ignores any bound session (does NOT steer the tab's main stream — the property
   * ADR-TS-003/CP-003 relied on). Result-at-boundary: an expected aux failure (the
   * runtime's error chunk, an empty stream, or an abort) is `Result.err`, never a
   * thrown error across the boundary (ADR-CC-001 §2). Pure of provider-id branching
   * (REQ-CA-028) — addressed by the active runtime, not a literal id.
   */
  run(prompt: string, options?: AuxQueryOptions): Promise<Result<string>>;
}
```

`run` returns the **accumulated text** — the parsing (title / refine outcome / inline-edit
replacement-insertion-clarification) stays in each use case as the existing pure parse functions.
The port owns only the *stream-drain + cold-start + abort + error-to-Result* mechanics that all three
consumers duplicate today.

### 2. Implement the port over the runtime's cold-start query in all three bridges

The `AuxModelPort` impl **delegates to the runtime's existing cold-start query** — it does not add a
second transport. `ObsidianBridge.createAuxModelPort()` returns an impl that builds a fresh
`ChatRuntimePort` (per-call cold-start runtime, exactly as title-gen does today) and drains
`query(prepareTurn({ text: framed }), [], { forceColdStart: true })`, mapping the error chunk / empty
stream / abort to a `Result`. `MockBridge` returns a scriptable aux port (for the use-case tests);
`LocalStorageBridge` returns a browser-safe stand-in (echo/canned, like the demo's other side-query
stand-ins). Three bridge impls, one new InjectionKey (`AUX_MODEL_PORT`), one composable
(`useAuxModelPort`).

### 3. Re-point `GenerateTitleUseCase` and `RefineInstructionUseCase` onto `AuxModelPort` (the refactor)

Both existing use cases stop constructing a runtime and draining `query` themselves; they take an
`AuxModelPort` and call `run(body, { systemPrompt })`, then run their existing pure parser on the
returned text. This is the **two-site re-point** ADR-TS-003/CP-003 pre-paid for. Scope of the
refactor (deliberately small, kept green):

- `GenerateTitleUseCase`: constructor `(runtime: ChatRuntimePort)` → `(aux: AuxModelPort)`;
  `execute` calls `aux.run(buildTitleGenerationPrompt(msg), { systemPrompt: TITLE_GENERATION_SYSTEM_PROMPT })`
  then `parseTitleGenerationResponse`. The accumulate loop is **deleted** (moves into the port).
- `RefineInstructionUseCase`: constructor `(runtime)` → `(aux)`; `execute` calls
  `aux.run(rawInstruction, { systemPrompt: buildRefineSystemPrompt(existing) })` then
  `parseRefineResponse`. The accumulate loop is **deleted**.
- The mount sites (`ChatSurface` `generateTitle: …new GenerateTitleUseCase(createRuntime())`, and the
  refine wiring) re-point to `new GenerateTitleUseCase(auxPort)` / `new RefineInstructionUseCase(auxPort)`.
- The existing title-gen / refine **tests stay green**: they currently inject a scriptable runtime;
  they switch to injecting a scriptable `AuxModelPort` (the `MockBridge` aux port or a `vi.fn()`
  stub) returning the same scripted text — same assertions, smaller fake. `fake-ports.ts` grows an
  `auxModel` member returning the `MockBridge` aux port.

This is a **refactor with churn** (two use cases, their tests, two mount sites, the fake-ports
factory). The churn is bounded and was explicitly pre-paid by ADR-TS-003/CP-003; the seam clarity
won (one named aux contract, abort + continue concerns owned in one place, no third near-duplicate
drain loop) outweighs it. Per AGENTS.md §8 the old per-use-case drain loops are **deleted**, not left
as dead code "for compatibility".

### 4. Provider-addressed, additive, Result-at-boundary

- The aux port is addressed by the **active runtime**, never a `providerId` branch (REQ-CA-028) — the
  impl builds the active provider's cold-start runtime.
- `ChatRuntimePort` gains **no** aux-specific member — the port delegates to the existing `query` +
  `forceColdStart` (additive; the streaming-error convention of ADR-CC-001 §1 is unchanged).
- `run` returns `Result<string>`; an error chunk / empty stream / abort is `err`, never a throw
  across the boundary (REQ-CA-027, ADR-CC-001 §2).

## Considered options

### Option A — Keep per-use-case `ChatRuntimePort.query` side-queries (a third near-duplicate)
- Pros: zero refactor of the two existing use cases; lowest immediate churn.
- Cons: a third copy of the identical drain loop; no named home for abort + continue-conversation
  (REQ-CA-026/027) — inline-edit would bolt them onto a use case while title/refine diverge; the
  re-point cost ADR-CP-003 pre-paid is never realised. Rejected.

### Option B — Extract `AuxModelPort` now, re-point the two existing consumers *(chosen)*
- Pros: one named aux contract; the `signal`/abort + the continue path live in one place; the drain
  loop exists once; claudian's own `AuxQueryRunner` validates the shape; the re-point sites were
  pre-paid by ADR-TS-003/CP-003 and are small; deletes two near-duplicate loops.
- Cons: a refactor touching two use cases + their tests + two mount sites + fake-ports (bounded; tests
  kept green). Accepted — this is the threshold the prior ADRs set.

### Option C — Extract `AuxModelPort` but leave title/refine on the old path
- Cons: two ways to run the same aux query coexist; the duplication ADR-CP-003 warned about persists;
  violates "delete dead/duplicate paths" (AGENTS.md §8). Rejected.

## Consequences

### Positive
- One narrow contract for every one-shot cold-start aux query; abort + continue-conversation have a
  named home; the drain loop exists exactly once.
- The two pre-paid re-point sites are realised; two near-duplicate loops are deleted.
- Inline-edit (and any future aux consumer) slots in by injecting `AuxModelPort`, not by copying a
  fourth drain loop.

### Negative
- A refactor lands in P5 touching P3 + P4 use cases (bounded; covered by their existing tests, kept
  green). A new port + key + composable + three bridge impls is added (earned by the third consumer +
  the two new aux concerns).

### Neutral
- The pure prompt/parse functions (`titleGeneration`, `instructionRefine`, and the new
  `inlineEdit` parser) stay in the application layer, unchanged — only the *transport mechanics* move
  into the port.

## Compliance

- A test asserts `GenerateTitleUseCase` and `RefineInstructionUseCase` call `AuxModelPort.run` and no
  longer construct a `ChatRuntimePort` or drain `query` directly (Decision §3); their prior behaviour
  tests pass unchanged against the aux stub.
- A test asserts `AuxModelPort.run` maps an error chunk / empty stream / abort to `Result.err` and
  never throws across the boundary (REQ-CA-027).
- A test asserts the aux query is cold-start (does not bind/steer a session) — mirrors the
  ADR-TS-003 isolation test.
- A review check confirms `ChatRuntimePort` gained no aux-specific member and the aux port has no
  `providerId` branch (REQ-CA-028); the two old drain loops are deleted, not left dead.
- `AuxModelPort` is added to all three bridges + its InjectionKey + composable (NFR-CA-001).

## References

- PRD-CA-001 — REQ-CA-021, REQ-CA-026, REQ-CA-027, REQ-CA-028; CLAR-CA-004 (port half).
- `specs/context-attachments/design.md` Part C.
- **ADR-TS-003** (the cold-start side-query pattern + the P4/P5 `AuxModelPort` deferral),
  **ADR-CP-003** (re-confirmed the deferral; named P5 inline-edit the re-eval point; named the two
  re-point sites), **ADR-CA-004** (the inline-edit use case that is the third consumer),
  ADR-CC-001 §1/§2 (streaming-error convention; Result at use-case boundaries), ADR-008 (one port per
  consumer; no port before earned).
- Claudian reference: `core/auxiliary/AuxQueryRunner.ts` (the one-shot aux query the
  `QueryBacked*Service`s consume), `core/auxiliary/QueryBackedInlineEditService.ts`.

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
