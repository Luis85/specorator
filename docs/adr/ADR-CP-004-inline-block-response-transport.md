---
id: ADR-CP-004
title: Route inline-block responses to the runtime via additive callback-setter members on ChatRuntimePort, and capability-gate the flows the CLI cannot carry
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
tags: [architecture, ports, chat-runtime, plan-mode, transport-honesty, claudian-reboot, P4]
---

# ADR-CP-004 — Inline-block response transport + CLI capability-gating

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-25): architect files, PM
accepts, human defers to one final epic-review gate. Resolves **CLAR-CP-004**. Unblocks
`PRD-CP-001` (REQ-CP-022/023/024/025/026/028; NFR-CP-007). Grows `ChatRuntimePort` additively per
the blessing in ADR-CC-001 §3.

## Context

P4 renders three inline interactive blocks — **ask-user-question**, **exit-plan-mode**, and
**plan-approval** — and must **route the user's response back to the runtime** (REQ-CP-023/025/026),
while the runtime is mid-turn. Claudian's runtime injects the UI→runtime control channel via
**callback setters** that ADR-CC-001 §1 already inventoried and **blessed in advance** for P4:
`setApprovalCallback` (`ChatRuntime.ts:48`), `setAskUserQuestionCallback` (`:50`),
`setExitPlanModeCallback` (`:51`). Each setter registers a callback the runtime invokes when it
needs a decision; the callback's returned promise resolves with the user's answer, which the
runtime feeds back into the live turn. The inline block components hold the `resolve` function
(`InlineAskUserQuestion`, `InlineExitPlanMode`, `InlinePlanApproval` all take a `resolve(decision)`
constructor arg) and call it on the user's choice.

Two facts bound the decision:

1. **Scope (NG3).** P4 *renders and responds*; the approval **rules / `allow-always` persistence /
   `ApprovalManager` / rule scoping** are **P7** (REQ-CP-026 acceptance: "no persistent rule is
   written"). P4 transports a one-shot decision; it stores nothing.
2. **Transport honesty (charter §6, ADR-TS-004 lineage).** The P1 Claude transport is the
   subprocess **`claude --print`** CLI — a one-shot, non-interactive print mode. It **cannot** keep a
   turn paused mid-stream to await an interactive mid-turn answer and resume it (that is an
   Agent-SDK / ACP interactive-transport capability). ADR-TS-004 set the precedent: gate a flow the
   subprocess CLI cannot faithfully carry off a **capability flag** read through `getCapabilities()`,
   never a `provider ===` branch, and never a silent dead path.

## Decision

### 1. Add three additive callback-setter members + two capability flags to `ChatRuntimePort`

We grow `ChatRuntimePort` **additively** (ADR-CC-001 §3 — the setter channel is pre-blessed) with
the three P4 callback setters and grow `RuntimeCapabilities` with two flags:

```ts
// additive on ChatRuntimePort — UI→runtime control channel for inline blocks
setAskUserQuestionCallback(cb: (req: AskUserQuestionRequest) => Promise<AskUserQuestionAnswer | null>): void;
setExitPlanModeCallback(cb: (req: ExitPlanModeRequest) => Promise<ExitPlanModeDecision | null>): void;
setApprovalCallback(cb: (req: ApprovalRequest) => Promise<ApprovalDecision | null>): void;

// additive on RuntimeCapabilities (SPEC-TS-003 / REQ-TS-026 capability discipline)
readonly supportsPlanMode: boolean;        // gates Shift+Tab plan toggle (REQ-CP-020)
readonly supportsInlineResponse: boolean;  // gates the answerable inline blocks (REQ-CP-028)
```

- **Setters, not a `respond(...)` method.** The runtime *pulls* a decision when it reaches the
  question (it owns the timing); the UI *registers* how to answer. A setter + returning-promise
  callback is the exact Claudian shape and the natural fit — a `respond(requestId, decision)` push
  method would require the UI to correlate request ids and the runtime to park pending requests in a
  map, strictly more machinery for the same effect. Setters mirror the already-blessed pattern.
- **`null` resolves a cancel** (Escape on the block, REQ-CP-022/033) — the callback resolving `null`
  tells the runtime the user dismissed; the runtime decides how to proceed (its concern, not P4's).
- **The request/decision DTOs are plain domain types** (`AskUserQuestionRequest`,
  `ExitPlanModeRequest`/`ExitPlanModeDecision`, `ApprovalRequest`/`ApprovalDecision`) under
  `src/domain/chat/` — string/enum/array shapes mirroring Claudian's `core/runtime/types` +
  `core/types/tools` (`ApprovalDecision = 'deny'|'allow'|'allow-always'`,
  `ExitPlanModeDecision`, the ask-user `AskUserQuestionItem[]` shape). No Obsidian, no class.

### 2. The blocks reach the UI as additive `StreamChunk` members; the response reaches the runtime via the setter

The runtime emits the *request* to render a block as an **additive `StreamChunk` member** (the
union already reserves room; P4 adds the three request members it does not yet carry), so the
existing streaming path delivers it to the composer surface to render (REQ-CP-022/024/026). The
*response* flows the other way through the registered callback (Decision §1). This keeps the two
directions on the two existing channels (stream out, callback in) — no third transport.

`StreamChunk` additions (additive, no rename — ADR-CC-001 §4):

```ts
| { type: 'ask_user_question'; requestId: string; questions: AskUserQuestionItem[] }
| { type: 'exit_plan_mode'; requestId: string; plan: string; allowedPrompts?: {tool:string;prompt:string}[] }
| { type: 'approval_request'; requestId: string; tool: string; context: string; options: ApprovalOption[] }
```

The composer surface (via `useComposerMode`, ADR-CP-001) switches to `inline-block` mode on these
chunks, renders the matching block, and on the user's choice resolves the runtime's registered
callback. P4 stores **no** decision (NG3): the approval block resolves the callback and writes
**nothing** to settings/history (REQ-CP-026 acceptance).

### 3. Capability-gating — honest about what `claude --print` can carry (NFR-CP-007)

- **`supportsPlanMode`** gates the `Shift+Tab` toggle (REQ-CP-020). The P1 Claude subprocess
  transport reports `supportsPlanMode` per its real capability; the toggle, the "PLAN" indicator,
  and the plan-mode border are **only** shown when `getCapabilities().supportsPlanMode` is true.
- **`supportsInlineResponse`** gates whether an inline block is presented as **answerable**
  (REQ-CP-028). If the active transport cannot faithfully round-trip a mid-turn interactive answer
  (the `claude --print` one-shot print mode), `supportsInlineResponse` is **false**, and the
  composer **does not present the block as answerable** — it surfaces the limitation (a render-only
  note + a `NotificationPort` info) instead of silently dropping the user's response (REQ-CP-028
  acceptance: "gated, not presented as answerable; user informed; no lost response").
- **The gate reads `getCapabilities()`, never a `provider ===` branch** (NFR-CP-007, REQ-TS-026
  discipline). When a later phase wires an interactive transport (Agent-SDK / ACP) that *can* carry
  the round-trip, it reports `supportsInlineResponse: true` and the same UI lights up — no UI change,
  exactly the ADR-TS-004 `supportsRewind` precedent.
- **No silent dead path:** the setters are always *registered* (the channel exists); the
  *affordance* is what the capability gates. A non-capable transport never reaches a registered
  callback because the block is never presented as answerable — the user is told why.

### 4. Approval RULES / persistence stay out (NG3 — P7)

P4 adds the callback transport + the render + the one-shot decision routing **only**. No rule
matching, no `allow-always` persistence, no project/session rule scoping, no `ApprovalManager`. The
`approval_request` block offers the decision options and resolves the callback; `'allow-always'`
selected in P4 routes that *decision* to the runtime for the *current* request but persists no rule
(P7 owns the rule store, `ApprovalRuleStorePort`, charter §6a).

## Considered options

### Response transport
- **A — Additive callback-setter members (`setAskUserQuestionCallback`/`setExitPlanModeCallback`/
  `setApprovalCallback`) *(chosen)*.** Pros: the exact Claudian shape; pre-blessed by ADR-CC-001 §3;
  the runtime owns the timing (pull), the UI owns the answer (register); additive, no rename
  (NFR-CP-009); no request-id correlation map in the UI.
  Cons: setter-injection is a mutable-state pattern the core ports avoid (ADR-CC-001 already
  accepted this for the runtime).
- **B — A `respondToPrompt(requestId, decision)` push method.** Cons: requires the UI to track
  request ids + the runtime to park pending requests in a map; strictly more machinery; diverges
  from the blessed Claudian setter channel. Rejected.

### Transport honesty
- **A — Two capability flags (`supportsPlanMode`, `supportsInlineResponse`) gating the affordance
  via `getCapabilities()` *(chosen)*.** Pros: ADR-TS-004 precedent; provider-agnostic; the
  interactive-transport upgrade is zero-UI-change; no lost response.
- **B — Always present the blocks; best-effort send.** Cons: silently drops responses the `--print`
  transport cannot carry — exactly the dishonest dead path the charter §6 forbids. Rejected.
- **C — Hard-code `provider === 'claude'` to decide.** Cons: violates REQ-TS-026 / NFR-CP-007
  capability discipline; breaks the moment a second Claude transport (Agent-SDK) ships. Rejected.

## Consequences

### Positive
- The inline blocks render + respond on P4 with the exact Claudian control-channel shape, additive
  over the 12 existing `ChatRuntimePort` members and the 3 existing `RuntimeCapabilities` flags.
- The CLI's real limits are honest: a flow `--print` cannot carry is gated + explained, never
  silently dropped (NFR-CP-007); the interactive-transport upgrade is a capability flip, no UI rework.
- Approval rules/persistence stay cleanly P7 (NG3) — P4 transports a one-shot decision and stores
  nothing.

### Negative
- A non-capable transport (P1 Claude `--print`) means plan-mode + answerable inline blocks may be
  *gated off* in P4's wired provider until an interactive transport lands. This is the honest state;
  the blocks + transport are built + tested against a capable mock so they light up the moment a
  capable transport ships. (Self-parity note: capture this in the P4 parity screenshots — the gated
  state is the correct rendering, not a missing feature.)

### Neutral
- The request/decision DTOs live in `src/domain/chat/`; the `StreamChunk` additions are declared
  now and emitted by a capable transport — same "declare-now-emit-later" discipline as ADR-CC-001 §4.

## Compliance

- A contract check confirms exactly three additive setter members + two additive capability flags;
  no existing `ChatRuntimePort`/`RuntimeCapabilities`/`StreamChunk` member is renamed or removed
  (NFR-CP-009; diffed against ADR-CC-001's 12 members + SPEC-TS-003's flags).
- A test (capable mock runtime) asserts: each block renders from its `StreamChunk` request, the user
  choice resolves the runtime's registered callback, Escape resolves `null`, and the composer is
  restored (REQ-CP-022/023/024/025/026/027).
- A test (non-capable mock: `supportsInlineResponse:false`) asserts the block is **not** presented as
  answerable and the user is informed, with no callback invoked and no lost response (REQ-CP-028).
- A test asserts the approval block resolves the callback and writes **no** rule to settings/history
  (REQ-CP-026, NG3).
- A review check confirms the gate reads `getCapabilities()`, with **no** `provider ===` branch
  (NFR-CP-007, REQ-TS-026).

## References

- PRD-CP-001 — REQ-CP-020/021/022/023/024/025/026/027/028; NFR-CP-007/009; CLAR-CP-004; NG3.
- `specs/composer-power/design.md` Part C.
- **ADR-CC-001 §1/§3/§4** (the blessed setter channel + grow-per-phase + additive `StreamChunk`),
  **ADR-TS-004** (capability-gate a flow the subprocess CLI cannot carry; `getCapabilities()` not
  `provider ===`), ADR-TS-003 (capability-read discipline), ADR-008 (one port, one consumer).
- Charter §6 (transport honesty), §6a (`ApprovalRuleStorePort` is P7).
- Claudian reference: `core/runtime/ChatRuntime.ts:48/50/51` (the callback setters),
  `features/chat/controllers/InputController.ts` (`handleAskUserQuestion`/`handleExitPlanMode`/
  `handleApprovalRequest`/`showPlanApproval`, `inputContainerHideDepth`),
  `features/chat/rendering/{InlineAskUserQuestion,InlineExitPlanMode,InlinePlanApproval}.ts`,
  `core/runtime/types.ts` + `core/types/tools.ts` (decision DTO shapes).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
