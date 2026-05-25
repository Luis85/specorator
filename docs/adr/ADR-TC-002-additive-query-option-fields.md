---
id: ADR-TC-002
title: Thread backed toolbar widgets via one additive ChatRuntimeQueryOptions field each (mode? / reasoning? / serviceTier?), with a discriminated ReasoningChoice
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
tags: [architecture, toolbar, query-options, additivity, claudian-reboot, P6]
---

# ADR-TC-002 — Additive `ChatRuntimeQueryOptions` fields for the backed widgets

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-25): architect files, PM
accepts, human defers to one final epic-review gate. Resolves **CLAR-TC-001**. Unblocks `PRD-TC-001`
(REQ-TC-004/014/018/020; NFR-TC-001).

## Context

The three backed widgets (model, mode, thinking) and the declared-now/emitted-later service-tier
toggle each steer the next turn. `ChatRuntimeQueryOptions` already carries `model?` (P0–P5),
`forceColdStart?` (P3), and `appendSystemPrompt?` (P4) (`ChatTurn.ts:48-67`). CLAR-TC-001 asks what
fields the backed widgets thread and with what shapes. The hard constraint is **additivity**
(NFR-TC-001): the P0–P5 members must stay byte-identical, and a turn taken with no toolbar interaction
must serialise exactly as it does on `next` today. Claudian's thinking control is a discriminated
**effort vs token-budget** control (`ProviderChatUIConfig.reasoningControl: 'effort' |
'token-budget' | 'none'`, `ProviderReasoningOption.tokens?`), so a flat string cannot carry both
variants.

Two shape options: (a) one optional field per widget appended after the P5 members; (b) a single
`toolbar?: {...}` bag. P3/P4/P5 each appended single members (the established discipline).

## Decision

### 1. One additive optional field per backed widget (CLAR-TC-001 → option (a))

```ts
// src/domain/chat/ChatTurn.ts — APPENDED after appendSystemPrompt. The P0–P5
// members (model, forceColdStart, appendSystemPrompt) stay byte-identical.
export interface ChatRuntimeQueryOptions {
  model?: string;                  // P0–P5 — already exists, NOT re-added
  forceColdStart?: boolean;        // P3
  appendSystemPrompt?: string;     // P4
  // ---- P6 additive (SPEC-TC, ADR-TC-002) ----
  mode?: string;                   // mode selector (REQ-TC-014)
  reasoning?: ReasoningChoice;     // thinking selector (REQ-TC-018)
  serviceTier?: string;            // declared-now / emitted by a capable provider (REQ-TC-020, P9)
}
```

`model` is **not** re-added (it exists, REQ-TC-012). `enabledMcpServers?` (NG2 → P8) and
`externalContextPaths?` (NG3 → later) stay **excluded** from `ChatRuntimeQueryOptions`.

### 2. `reasoning` is a discriminated `ReasoningChoice` union

```ts
// src/domain/chat/Reasoning.ts — new, pure domain (no obsidian/node/class)
export type ReasoningChoice =
  | { readonly kind: 'effort'; readonly value: string }   // High/Medium/Low (Claude adaptive)
  | { readonly kind: 'budget'; readonly tokens: number }; // token-budget providers
```

The discriminant matches the provider's `reasoningControl`, so the thinking selector and the runtime
agree on the shape without a provider-id branch (REQ-TC-003). The exact effort vocabulary
(`'high'|'medium'|'low'`) and the token-budget defaults are **spec-level** field-validation details
for `spec.md`, not part of this ADR.

### 3. `serviceTier` is declared now, emitted when a capable provider backs it

`serviceTier?` is declared in P6 (so the toggle threads it where a descriptor exists) but Claude
supplies no service-tier descriptor, so the widget is capability-hidden for Claude (ADR-TC-003 §3) and
the field is absent on every Claude turn. A capable provider (Codex fast-mode) emits it in P9 — the
same declared-now/emitted-later discipline as the P2/P3/P4 `StreamChunk`/`ChatRuntimeQueryOptions`
members (`StreamChunk.ts:69`).

### 4. The fold is a pure, guarded `foldControlOptions` — only a non-default value is written

```ts
// src/application/chat/toolbar/foldControlOptions.ts — pure, total
export function foldControlOptions(controls: TabControls): Partial<ChatRuntimeQueryOptions> {
  const out: Partial<ChatRuntimeQueryOptions> = {};
  if (controls.model !== undefined) out.model = controls.model;
  if (controls.mode !== undefined) out.mode = controls.mode;
  if (controls.reasoning !== undefined) out.reasoning = controls.reasoning;
  if (controls.serviceTier !== undefined) out.serviceTier = controls.serviceTier;
  return out;
}
```

`buildTurnRequest`/`_turnQueryOptions` merge this into the turn's `queryOptions` (ADR-TC-001 §3). A
field is written **only when the control carries a value** (an untouched control / a catalog-default
selection leaves the field absent and the runtime applies its own default). This keeps a
no-interaction turn byte-identical to P5 (NFR-TC-001) and resolves the PRD's under-specified
default-vs-explicit question.

## Considered options

### Option A — one additive optional field per backed widget *(chosen)*
- Pros: mirrors the P3/P4/P5 single-member appends (lowest churn, the established discipline); each
  field is independently optional so additivity is trivially provable; the discriminated `reasoning`
  carries both effort + token-budget variants; `serviceTier` rides the declared-now/emitted-later
  discipline already in the codebase.
- Cons: three new optional members on the interface (small, additive).

### Option B — a single `toolbar?: { mode?; reasoning?; serviceTier? }` bag
- Pros: groups the P6 fields under one key.
- Cons: a nested optional bag is harder to fold guardedly (presence of the bag vs presence of each
  field); diverges from the flat append discipline P3/P4/P5 used; the runtime would unwrap a bag where
  it reads flat members today. Rejected.

## Consequences

### Positive
- A no-toolbar-interaction turn is byte-identical to a P5 turn (NFR-TC-001).
- The discriminated `reasoning` supports both Claude effort and future token-budget providers without a
  provider-id branch (REQ-TC-003).
- `serviceTier` is wired now and emitted when P9 backs it — no later interface churn.

### Negative
- The Claude runtime's query assembly grows to read `mode`/`reasoning` (additive, behind the
  optional-field guards); `serviceTier` is read by a capable provider only (Claude ignores it).

### Neutral
- `enabledMcpServers?`/`externalContextPaths?` stay excluded (NG2/NG3).

## Compliance

- A contract test asserts the P0–P5 members (`model`/`forceColdStart`/`appendSystemPrompt`) are
  byte-identical and every P6 field is optional.
- A test asserts a turn with no toolbar interaction carries none of the P6 fields (NFR-TC-001).
- A test asserts a model/mode/thinking change writes exactly that field and mutates no other member
  (REQ-TC-004).
- A test asserts `serviceTier` is absent on every Claude turn (capability-hidden widget, ADR-TC-003).
- A unit test asserts `foldControlOptions` is total and writes only present fields.

## References

- PRD-TC-001 — REQ-TC-004/014/018/020; CLAR-TC-001; NFR-TC-001.
- `specs/toolbar-controls/design.md` Part C (C.3/C.5/C.6).
- **ADR-TC-001** (per-tab `TabControls` the fold reads), **ADR-TC-003** (capability gate that hides
  the service-tier widget for Claude), ADR-CP-004 / `StreamChunk.ts:69` (the declared-now/emitted-later
  discipline this follows), ADR-CC-001 §3/§4 (grow per phase).
- Claudian reference: `core/providers/types.ts` (`reasoningControl`, `ProviderReasoningOption.tokens`,
  `ProviderServiceTierToggleConfig`), `features/chat/ui/InputToolbar.ts` (`ThinkingBudgetSelector`,
  `ServiceTierToggle`).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
