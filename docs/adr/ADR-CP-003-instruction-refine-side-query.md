---
id: ADR-CP-003
title: Refine instructions with a second cold-start side-query over ChatRuntimePort.query, behind a RefineInstructionUseCase — defer AuxModelPort to P5
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
tags: [architecture, auxiliary, instruction-mode, composer, claudian-reboot, P4]
---

# ADR-CP-003 — Instruction-refine via a cold-start side-query (reuse the ADR-TS-003 pattern; defer `AuxModelPort`)

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-25): architect files, PM
accepts, human defers to one final epic-review gate. Resolves **CLAR-CP-003**. Unblocks
`PRD-CP-001` (REQ-CP-016).

## Context

Instruction mode (`#`) optionally runs an AI **refine** before the confirm modal (REQ-CP-016):
take the user's raw instruction, optionally rewrite it into a clean system-prompt snippet (or ask a
clarifying question), present that to the user. Claudian models this as
`QueryBackedInstructionRefineService` over an `AuxQueryRunner` (a one-shot cold-start wrapper over
`query()`) with a dedicated system prompt + parser (`core/prompt/instructionRefine.ts`:
`buildRefineSystemPrompt`, `<instruction>…</instruction>` extraction).

This is **structurally identical** to P3 title generation: a one-shot, cold-start, side-query over
the same SDK `query()`, with a different system prompt + parser, isolated from the tab's main
stream. ADR-TS-003 (P3) chose Option A — a cold-start side-query over `ChatRuntimePort.query`,
behind a `GenerateTitleUseCase` — and **deferred a dedicated `AuxModelPort` to P4/P5**, naming
**instruction-refine (P4)** and **inline-edit (P5)** as the candidate triggers for extracting it.

P4 is therefore the moment ADR-TS-003 flagged: instruction-refine is the **second** side-query
consumer. The decision: extract `AuxModelPort` **now**, or take the smallest additive seam again
and reuse `ChatRuntimePort.query`?

## Decision

### 1. Instruction-refine is a second cold-start side-query over `ChatRuntimePort.query` (Option A — reuse the ADR-TS-003 pattern)

We will **reuse the ADR-TS-003 cold-start side-query** for instruction-refine — **no `AuxModelPort`
in P4.** A new application use case **`RefineInstructionUseCase`** owns the flow and returns
`Result<RefineOutcome>`:

```ts
type RefineOutcome =
  | { kind: 'refined'; instruction: string }     // <instruction>…</instruction> extracted
  | { kind: 'clarification'; question: string };  // plain-text question (ambiguity path)

class RefineInstructionUseCase {
  constructor(private readonly runtime: ChatRuntimePort) {}
  execute(rawInstruction: string, existingInstructions: string): Promise<Result<RefineOutcome>>;
}
```

1. Build a one-shot prepared turn from the raw instruction using the refine system prompt + parser
   ported **verbatim as pure functions** from `core/prompt/instructionRefine.ts` into
   `src/application/chat/composer/instructionRefine.ts` (`buildRefineSystemPrompt(existing)`,
   `parseRefineResponse` → extracts `<instruction>` content or returns the plain-text clarification).
2. Drive `ChatRuntimePort.query(...)` in **cold-start / one-shot** mode (a fresh runtime instance
   per refine, exactly like `GenerateTitleUseCase`), accumulate `text` chunks, ignore tool/thinking,
   `done` terminates.
3. Parse: `<instruction>…</instruction>` → `ok({kind:'refined'})`; a non-empty plain-text response →
   `ok({kind:'clarification'})`; empty / parse-failure / an `error` chunk → `err(...)` (the use case
   maps the streaming error-as-chunk to a `Result` at its own boundary, ADR-CC-001 §2).
4. **No blocking error on failure** — refine is best-effort (REQ-CP-016 `should`); on `err` the raw
   instruction proceeds straight to the confirm modal (REQ-CP-017), failure logged via `LoggerPort`,
   never a `NotificationPort.showError`.

Because it is a fresh cold-start runtime, refine does not steer/interleave the tab's main stream
(the same isolation property ADR-TS-003 relies on) — no new port needed for stream isolation.

### 2. Capability-gated, provider-addressed, additive

- Refine is **provider-addressed** (no `provider === 'claude'` branch). It is gated on a capability
  flag (REQ-CP-016 "Where the active provider supports instruction refinement") — see ADR-CP-004,
  which adds the relevant capability flag(s) to `RuntimeCapabilities`; refine reads
  `getCapabilities()`, never a provider string.
- **Additive (NFR-CP-009):** reuses the existing `query` member and the existing optional
  `forceColdStart` query option that ADR-TS-003 already established. `ChatRuntimePort` gains **no**
  refine-specific member.

### 3. `AuxModelPort` deferral re-confirmed to P5

We **explicitly decline** to extract `AuxModelPort` in P4. ADR-TS-003 flagged P4-or-P5; we hold to
P5. Rationale: two consumers (title-gen + refine) both want exactly the same one-shot/cold-start/
one-provider shape — there is still **no** behaviour (parallel aux calls, a distinct aux model/
budget, an independent status channel) that the side-query cannot serve. The cost of `AuxModelPort`
(a port + InjectionKey + composable + three bridge impls) is not yet earned (ADR-008 "don't add a
port before its consumer earns it"). **P5 inline-edit is the re-evaluation point**: if inline-edit
needs concurrent aux calls or a distinct model/budget, extract `AuxModelPort` then and re-point both
use cases (`GenerateTitleUseCase` + `RefineInstructionUseCase` are the two small re-point sites).

## Considered options

### Option A — Cold-start side-query over `ChatRuntimePort.query`, behind `RefineInstructionUseCase` *(chosen)*
- Pros: smallest additive surface (no new port/key/composable); reuses the proven ADR-TS-003 seam +
  the ported pure prompt/parse functions; cold-start isolates from the main stream; the `Result`
  boundary maps the streaming error-as-chunk to a non-blocking best-effort failure (REQ-CP-016);
  provider-addressed; one contract reviewers already know.
- Cons: the use case accumulates `text` chunks itself (trivial, identical to title-gen); a future
  multi-aux-call phase may outgrow it (mitigated: the `AuxModelPort` upgrade is additive, §3).

### Option B — Extract `AuxModelPort` now (P4)
- Pros: the frontend-audit shape; isolates aux from the main runtime; a clean status channel; room
  for P5 from day one.
- Cons: a whole new port + key + composable + three bridge impls for a second one-shot one-provider
  call — still larger than P4 needs; the cold-start side-query already gives stream isolation; the
  re-point cost when P5 actually earns it is small (two use cases). Deferred to P5. Rejected for P4.

### Option C — Reuse the tab's live main runtime for refine
- Cons: interleaves/steers the visible turn; contradicts "don't couple to the main stream"; risks
  corrupting the conversation. Rejected (same as ADR-TS-003 Option C).

## Consequences

### Positive
- Instruction-refine ships on the smallest possible additive seam, reusing one streaming contract
  for main turns + title-gen + refine; reviewers learn one pattern.
- The `AuxModelPort` upgrade path stays open + additive for P5 with two small, named re-point sites.

### Negative
- A second consumer now depends on the cold-start side-query convention; if P5 extracts
  `AuxModelPort`, both `GenerateTitleUseCase` and `RefineInstructionUseCase` must re-point (kept
  small deliberately).

### Neutral
- The refine prompt/parse logic is ported as **pure functions** into the application layer (no
  Obsidian, no `node:*`), testable in isolation — same shape as the title-gen ports.

## Compliance

- A test asserts: a refined instruction is presented before the confirm modal (REQ-CP-016/017); a
  refine failure (error chunk / parse-fail) falls through to the confirm modal with the raw
  instruction and raises **no** `NotificationPort.showError`; the clarification path surfaces the
  plain-text question.
- A review check confirms no `AuxModelPort` is added in P4 and refine calls `ChatRuntimePort.query`
  (Decision §1); no `if (provider === 'claude')` branch in the refine flow (Decision §2).
- A contract check confirms `ChatRuntimePort` gains no refine-specific member (refine reuses `query`,
  NFR-CP-009).
- The ported `buildRefineSystemPrompt`/`parseRefineResponse` carry unit tests mirroring Claudian's
  `<instruction>` extraction + clarification rules.

## References

- PRD-CP-001 — REQ-CP-016; CLAR-CP-003; NG7; NFR-CP-009.
- `specs/composer-power/design.md` Part C.
- **ADR-TS-003** (the cold-start side-query pattern + the `AuxModelPort` P4/P5 deferral this honours),
  ADR-CC-001 §2/§3 (`Result` at use-case boundaries; grow per phase), ADR-CP-004 (the capability
  flag refine gates on), ADR-008 (don't add a port before its consumer earns it).
- Claudian reference: `core/prompt/instructionRefine.ts` (`buildRefineSystemPrompt`, `<instruction>`
  extraction), `core/auxiliary/QueryBackedInstructionRefineService.ts` (one-shot aux query),
  `features/chat/controllers/InputController.ts` (`handleInstructionSubmit`).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
