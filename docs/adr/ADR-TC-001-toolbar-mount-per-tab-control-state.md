---
id: ADR-TC-001
title: Mount the toolbar control strip as an additive ChatComposer region driven by per-tab control state on TabState
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
tags: [architecture, toolbar, composer, tabs, claudian-reboot, P6]
---

# ADR-TC-001 — Toolbar mount + per-tab control state

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-25): architect files, PM
accepts, human defers to one final epic-review gate. Resolves **CLAR-TC-003**. Unblocks `PRD-TC-001`
(REQ-TC-001/002/042).

## Context

P6 adds Claudian's `.claudian-input-toolbar` control strip (`InputToolbar.ts`) to the P1–P5 composer.
Two structural questions:

1. **How does the strip mount?** P5 already established the additive pattern: `ChatComposer.vue` hosts
   an optional context-bar region above the textarea that is hidden when its props are empty, so the
   composer is byte-identical to P4 without it (`ChatComposer.vue:39-44`/`:336-356`, ADR-CA-001 §2).
   The PRD requires the same: the strip is additive and the composer is unchanged without it
   (REQ-TC-002, NFR-TC-001).
2. **Where does control state live — per-tab or global?** (CLAR-TC-003.) Claudian keeps a per-tab
   draft model (`AppTabManagerState.openTabs[].draftModel`) and the usage meter is per-conversation by
   nature. The P3 reboot already models N tabs as `TabState` DTOs in `tabsStore`
   (`tabsStore.ts:53`), with usage already per-tab (`TabState.usage:63`). A global control state would
   break parity on tab switch (REQ-TC-042) and contradict the per-tab streaming isolation P3 built.

## Decision

### 1. Mount the strip as an additive `ChatComposer` region (mirror the P5 context bar)

`ChatComposer.vue` gains an **optional `toolbar` region** rendered between the textarea and the footer
toolbar. When the toolbar view-model prop is absent the region does not render — the composer is
byte-identical to P5 (REQ-TC-002, G5). The widgets emit their changes up to `ChatSurface` (which owns
the store), exactly as P5 re-emits `removeFile`/`previewImage` (`ChatComposer.vue:69-82`). The
composer itself owns no toolbar state — it is a presentational host.

### 2. Control state is per-tab — an additive `TabControls` bag on `TabState` (CLAR-TC-003 → option (a))

`TabState` grows one additive field:

```ts
// src/ui/stores/tabsStore.ts — additive
export interface TabControls {
  model?: string;
  mode?: string;
  reasoning?: ReasoningChoice;     // ADR-TC-002 §2
  serviceTier?: string;
}
// on TabState:
controls: TabControls;             // freshTab() seeds {}; loadIntoTab resets {}
```

A `setControl(field, value)` action updates `activeTab.controls[field]`. The widgets read
`activeTab.controls` (and `activeTab.usage` for the meter), so a `switchTab` automatically reflects the
switched-to tab's control state and usage — no extra wiring (REQ-TC-042). Usage is **already** per-tab
(P2), so the meter needs no new state.

### 3. The fold happens on submit, in `buildTurnRequest` (the existing P5 fold point)

On submit, `buildTurnRequest` (`tabsStore.ts:218`) folds `tab.controls` into `queryOptions` via the
pure `foldControlOptions` (ADR-TC-002 §3), additive + guarded so an untouched toolbar yields a turn
byte-identical to P5 (NFR-TC-001). This reuses the exact seam P4 used for `appendSystemPrompt`
(`_turnQueryOptions`, `tabsStore.ts:566`) and P5 used for context (`buildTurnRequest`).

## Considered options

### Option A — additive composer region + per-tab `TabControls` on `TabState` *(chosen)*
- Pros: reuses the proven P5 additive-region pattern (lowest churn, composer byte-identical without
  it); per-tab parity with Claudian's draft model + the P3 tab model; usage is already per-tab; the
  fold reuses the existing submit seam.
- Cons: `TabState` grows a field (additive, optional members); `switchTab` correctness depends on
  widgets reading `activeTab` (asserted by test).

### Option B — global control state in a new store / app singleton
- Pros: one place; no per-tab bookkeeping.
- Cons: breaks tab-switch parity (REQ-TC-042); contradicts the P3 per-tab isolation; the meter is
  inherently per-conversation so usage would have to be per-tab anyway, splitting the state. Rejected.

### Option C — a separate `ToolbarPort` / control-state service the runtime owns
- Pros: isolates control state from the store.
- Cons: a whole new seam for draft input the store already models as `TabState`; control state is UI
  draft, not domain/runtime state. Rejected (no port before its consumer earns it, ADR-008).

## Consequences

### Positive
- The composer is byte-identical to P5 without the toolbar (REQ-TC-002, NFR-TC-001).
- Tab switch reflects each tab's controls + usage for free (REQ-TC-042).
- The fold reuses the existing submit seam; one pure function (`foldControlOptions`) is the whole
  fold.

### Negative
- `TabState` + `freshTab`/`loadIntoTab` grow to seed/reset `controls` (additive).

### Neutral
- The seam widgets (permission/MCP/external) write **nothing** into `TabControls` in P6 — their
  backing fields stay excluded (ADR-TC-003/004).

## Compliance

- A test asserts a turn with no toolbar interaction serialises byte-identically to a P5 turn
  (NFR-TC-001).
- A test asserts `switchTab` makes the widgets reflect the switched-to tab's `controls` + `usage`
  (REQ-TC-042).
- A test asserts the composer renders byte-identical to P5 when the toolbar prop is absent
  (REQ-TC-002).
- A review check confirms control state lives on `TabState` (per-tab), not a global singleton.

## References

- PRD-TC-001 — REQ-TC-001/002/042; CLAR-TC-003; NFR-TC-001.
- `specs/toolbar-controls/design.md` Part C (C.1/C.2/C.5/C.6).
- **ADR-TC-002** (the additive query-option fields the fold writes), **ADR-CA-001 §2** (the P5
  additive-context-region pattern this mirrors), ADR-TS-002 (the per-tab `tabsStore`), ADR-008 (no
  port before its consumer earns it).
- Claudian reference: `features/chat/ui/InputToolbar.ts` (`.claudian-input-toolbar`),
  `AppTabManagerState.openTabs[].draftModel` (per-tab draft model).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
