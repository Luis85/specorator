---
id: ADR-AS-003
title: Compose the approval decision flow as an application use case over narrow ports — mode gate, pure matcher, then the unchanged P4 inline prompt
status: accepted       # proposed | accepted | deprecated | superseded by ADR-NNNN
date: 2026-05-26
accepted: 2026-05-26    # autonomous-drive: architect files, PM accepts; human defers to one final epic-review gate
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
tags: [architecture, approvals, security, application, claudian-reboot, P7]
---

# ADR-AS-003 — The approval decision flow + composition

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-26): architect files, PM
accepts, human defers to one final epic-review gate. Ratifies **CLAR-AS-004** (deny rules +
deny-wins precedence + mode-gate-first) + **CLAR-AS-005** (network/blocked-path context via the
existing P4 `ApprovalRequest.context`). Unblocks `PRD-AS-001` (REQ-AS-020..025, REQ-AS-030/031).

## Context

P4 (ADR-CP-004) added the inline-response seam: `ChatRuntimePort.setApprovalCallback(cb: (req:
ApprovalRequest) => Promise<ApprovalDecision | null>)`. Today the UI registers a callback that
surfaces the inline approval block and resolves the user's decision for the **current request only**;
`'allow-always'` carries no persistence (P4 `Approval.ts` defers the rule store to P7).

P7 must insert the **rule engine** behind that callback: an incoming request is mode-gated, then
matched against session + persisted rules; a match auto-decides without prompting; an unmatched
request surfaces the **unchanged** P4 prompt; and a user `allow-always`/`deny-always` decision
persists a rule (ADR-AS-001). The matching semantics are Claudian's exact `matchesRulePattern`
(ADR-AS-001 §3 pure matcher); the mode gate uses the live permission mode (ADR-AS-002).

Forces:

- **Placement (NFR-AS-005).** The decision logic orchestrates ports (rule store) + pure domain
  (matcher) + the inline-prompt seam. It is an **application use case** over the narrow ports; the
  matcher stays pure domain; the store stays a port.
- **Additivity (REQ-AS-052, NFR-AS-001).** With no rule + `normal` mode, the flow must reduce to the
  byte-identical P4 "always surface the inline prompt" path. The P4 `ApprovalRequest`/
  `ApprovalDecision` DTOs and the block render are unchanged (NG4).
- **Safety (NFR-AS-004/009, CLAR-AS-004).** A store failure must fail safe to the prompt, never
  silently auto-approve; deny must win on conflict; the mode gate must short-circuit (yolo→allow,
  plan→plan-gate) before the rule lookup; the bash explicit-wildcard stance must hold.
- **No provider branch (REQ-AS-003, NG6).** The flow reads capability/mode through ports, never a
  `providerId` literal.
- **Context (CLAR-AS-005).** Pass through the available `decisionReason`/`blockedPath` context the P4
  `ApprovalRequest.context` already renders; defer a dedicated network-approval panel (NG3).

## Decision

We compose the approval decision flow as a single application use case, **`ApprovalManager`**
(`src/application/chat/approvals/ApprovalManager.ts`), over the narrow ports, with the pure matcher in
the domain (ADR-AS-001 §3) and the inline prompt as the P4 seam.

### 1. Where it lives + what it holds

- **`ApprovalManager`** is an application service (not a domain aggregate) constructed with the
  `ApprovalRuleStorePort` (persisted rules), a `LoggerPort` + `NotificationPort` (for the fail-safe
  notice), and a getter for the active permission mode (`() => PermissionMode`, fed from the active
  tab's `controls.permissionMode`, ADR-AS-002). It owns the **in-memory session rules** (the
  `'session'` lifetime — not persisted, gone on reload, REQ-AS-033).
- It exposes `decide(req: ApprovalRequest, toolName, input): Promise<ApprovalDecision-or-prompt>` and
  is bound into the P4 `setApprovalCallback` seam: the UI registers a callback that delegates to
  `ApprovalManager.decide`. When the manager returns a definitive auto-decision, the callback resolves
  immediately (no block rendered); when it returns "prompt", the callback surfaces the P4 inline block
  and awaits the user (the unchanged P4 path).

### 2. The decision algorithm (the P7 spine, REQ-AS-020..025, CLAR-AS-004)

```
decide(toolName, input, context):
  1. mode gate (ADR-AS-002 — short-circuits the rule lookup, REQ-AS-024):
       mode === 'yolo'  → AUTO-ALLOW (no prompt, no rule lookup)            [REQ-AS-004/024]
       mode === 'plan'  → route edits/actions through the P4 exit-plan gate [REQ-AS-005/024]
                          (the plan-exit setMode sync lives in the runtime, ADR-AS-002 §3)
       mode === 'normal'→ fall through to the rule lookup
  2. derive the action pattern: getActionPattern(toolName, input)          [REQ-AS-010]
  3. load rules: persisted (ApprovalRuleStorePort.loadRules) + session (in-memory)
       on Result.err → fail safe: notify + fall through to the PROMPT      [NFR-AS-004, REQ-AS-054]
  4. match: for each rule, matchesRulePattern(toolName, pattern, rule.actionPattern) [REQ-AS-011..014]
       deny-wins: if ANY matching rule has decision 'deny' → AUTO-DENY     [REQ-AS-021/023]
       else if ANY matching rule has decision 'allow'      → AUTO-ALLOW    [REQ-AS-020]
       else (no match)                                     → PROMPT        [REQ-AS-022]
  5. PROMPT → surface the UNCHANGED P4 inline block; await the user:
       'allow' / 'deny'              → add a SESSION rule (in-memory only)  [REQ-AS-031]
       'allow-always' / 'deny-always'→ persist a rule via the store        [REQ-AS-030]
       cancel (null)                 → deny + interrupt; persist NO rule    [REQ-AS-025]
```

**Deny-wins, mode-gate-first** (CLAR-AS-004 option (a)): the mode gate is evaluated before the rule
lookup; on a rule conflict a matching deny denies. **First-match within a decision** is irrelevant
once deny-wins + allow-any are applied (the set is scanned; deny presence is decisive). The bash
explicit-wildcard stance and the null-action guard come for free from the pure matcher (ADR-AS-001 §3).

### 3. The persist-rule affordance (REQ-AS-030/031) — additive on the P4 decision, not a block re-spec

The P4 `ApprovalDecision` union (`'deny' | 'allow' | 'allow-always'`) grows the **`'deny-always'`**
member (additive — the deny-rule extension, CLAR-AS-004). The P4 block already renders the
deny/allow-once/always-allow options (REQ-CP-026); P7 adds the deny-always option to the option list.
The block's render/interaction is otherwise **unchanged** (NG4). On an `*-always` decision the manager
calls `getActionPattern` + builds an `ApprovalRule` and persists it (ADR-AS-001); on an `*-once`
decision it adds a session rule; a JSON-fallback pattern (one beginning with `{`) is stored without an
`actionPattern` (match-all for that tool) mirroring `ClaudePermissionUpdates.ts:31`.

### 4. Context pass-through (CLAR-AS-005)

The available `decisionReason`/`blockedPath`/`agentID` context (claudian `ClaudeApprovalHandler.ts:105`)
is folded into the existing P4 `ApprovalRequest.context` **string** so the prompt is informative. No
dedicated network-approval panel (NG3) — `ApprovalRequest.context` is render-only and already exists.

### 5. The no-rules / normal-mode default (REQ-AS-052, NFR-AS-001)

With no rule and `normal` mode, step 4 finds no match → PROMPT every time. That is the **byte-identical
P4 path**: the manager is a transparent pass-through to `setApprovalCallback`, and the inline block
renders exactly as on `next`. The engine changes nothing until the user opts in (a rule or a non-normal
mode).

## Considered options

### Option A — Application `ApprovalManager` use case over narrow ports + pure domain matcher (chosen)

- Pros: DDD-correct placement (orchestration in application, pure logic in domain, I/O in a port);
  reuses the P4 seam unchanged; additive (the no-rules default IS the P4 path); deny-wins +
  mode-gate-first is safe (CLAR-AS-004); no provider branch.
- Cons: the manager holds session-rule state (in-memory) — acceptable; it is a per-session concern,
  not domain state.

### Option B — Put the engine in the domain (a stateful approval aggregate)

- Pros: keeps it "domain".
- Cons: it orchestrates a port (the store) + a side-effecting prompt seam — that is application
  responsibility, not a pure domain invariant. The pure part (matching) is already domain. Rejected.

### Option C — Allow-only rules (drop deny), match Claudian exactly

- Pros: byte-parity with Claudian's allow-only model.
- Cons: a user cannot "always deny" a dangerous action — a genuine safety regression. The deny rule
  costs no parity (Claudian users still get allow rules + the prompt) and improves safety
  (CLAR-AS-004). Rejected.

## Consequences

### Positive

- The flow is testable in layers: the pure matcher (domain), the decision algorithm (application, with
  a fake store + scripted mode), the inline prompt (the unchanged P4 component).
- The no-rules/`normal` default is byte-identical to P4 (REQ-AS-052) — the engine is opt-in.
- Deny-wins + mode-gate-first + fail-safe-to-prompt give a safe-by-default posture (NFR-AS-004,
  CLAR-AS-004).
- `'deny-always'` lets users durably block actions — a safety improvement over Claudian at no parity
  cost.

### Negative

- The P4 `ApprovalDecision` union grows `'deny-always'` (additive) and the option list gains one
  entry — a controlled, additive change to the P4 surface (NG4 honoured: render/interaction otherwise
  unchanged).

### Neutral

- The manager's session rules are intentionally ephemeral (REQ-AS-033); only the persisted lifetime
  hits the store.
- Plan-mode edit-gating is the P4 exit-plan-mode block + the runtime setMode sync (ADR-AS-002 §3); P7
  routes through it, does not re-spec it (NG4).

## Compliance

- **Mode-gate-first** — a test with `yolo` + a matching deny rule asserts the action is ALLOWED (yolo
  short-circuits the lookup, TEST-AS-024).
- **Deny-wins** — a test with a matching allow + matching deny asserts DENY (TEST-AS-023).
- **Fail-safe** — a forced store load failure asserts the PROMPT is surfaced + a notice shown, never
  auto-allow (TEST-AS-054, NFR-AS-004).
- **No-rules default** — a test asserts a fresh install (`normal`, no rules) surfaces the P4 prompt
  for any tool and the block renders identically to `next` (TEST-AS-052/022).
- **Persist** — `allow-always` persists a rule via the store; `allow` adds a session rule and writes
  nothing to the store (TEST-AS-030/031).
- **No provider branch** — the manager reads mode + capability through ports/getters, never a
  `providerId` literal (REQ-AS-003).

## References

- PRD-AS-001 — REQ-AS-004/005, REQ-AS-020..025, REQ-AS-030/031/033; NFR-AS-001/004/005/009;
  CLAR-AS-004/005.
- DESIGN-AS-001 (`specs/approvals-security/design.md`) — Part C §C.2/§C.6/§C.7/§C.8; Part A §A.2/§A.3.
- ADR-AS-001 — the `ApprovalRuleStorePort` + pure matcher this composes over.
- ADR-AS-002 — the permission-mode seam the mode gate reads.
- ADR-CP-004 (`docs/adr/ADR-CP-004-...`) — the P4 `setApprovalCallback` seam + inline DTOs this
  builds behind (unchanged except the additive `'deny-always'` decision).
- claudian-main: `core/security/ApprovalManager.ts`, `providers/claude/runtime/
  ClaudeApprovalHandler.ts` (the CanUseTool callback + cancel→deny+interrupt + plan-exit setMode),
  `providers/claude/security/ClaudePermissionUpdates.ts:11-12,30`.

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
