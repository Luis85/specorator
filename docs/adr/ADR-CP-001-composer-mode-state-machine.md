---
id: ADR-CP-001
title: Arbitrate the five composer triggers + plan mode + inline blocks through a useComposerMode state-machine composable over an extended ChatComposer
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
tags: [architecture, composer, state-machine, claudian-reboot, P4]
---

# ADR-CP-001 — Composer-mode state machine via `useComposerMode`

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-25): architect files,
PM accepts, human defers to one final epic-review gate. Resolves **CLAR-CP-001**. Unblocks
`PRD-CP-001` (REQ-CP-034/036 directly; underpins all of Group A–F).

## Context

P4 turns the P1 send-only `ChatComposer.vue` (REQ-CC-008 keyboard contract, borderless
auto-growing textarea + send/stop control) into the Claudian power composer: five trigger
characters (`/` `$` `@` `#` `!`), a `Shift+Tab` plan-mode toggle, and three inline interactive
blocks (ask-user / exit-plan / plan-approval) that *replace* the composer while active.

Claudian arbitrates all of this imperatively in one ~3000-line `InputController.ts` that mutates
the DOM directly (`handleInputChange` switches on trigger char; `inputContainerHideDepth` hides
the composer behind an inline block; mode managers — `InstructionModeManager`,
`BangBashModeManager` — toggle CSS classes on the textarea wrapper). That imperative,
DOM-mutating shape is exactly what the charter forbids us to fork (charter §1 "not a fork of
Claudian's code"; CLAUDE.md no-`innerHTML`/no-`v-html`).

The decision: how do the trigger detections + the dropdown/overlay state + the
"replace-the-composer" swap compose into a single deterministic mode machine attached to the P1
`ChatComposer.vue` **without** rewriting it or breaking REQ-CC-008?

Constraints: extend not rewrite `ChatComposer.vue` (NFR-CP-009); preserve the P1 send contract
(REQ-CP-035); DTO-only store boundary (NFR-CP-005, ADR-003); mirror `InputController`'s
arbitration without its imperative DOM; pure trigger-parse in application/domain (no Obsidian).

## Decision

### 1. A `useComposerMode` state-machine composable owns one discriminated `ComposerMode` union (Option B)

We will introduce a **`useComposerMode` composable** (`src/ui/chat/composer/useComposerMode.ts`)
that owns a single reactive **`ComposerMode`** discriminated union and is the *sole* arbiter of
which trigger surface is active. The composable is the Vue-reactive realisation of Claudian's
`InputController` mode arbitration — minus the DOM mutation, which Vue templates own declaratively.

```ts
// src/domain/chat/composer/ComposerMode.ts  (pure DTO + value types — domain layer)
export type ComposerModeKind =
  | 'default'      // P1 send contract in force
  | 'slash'        // '/' palette open
  | 'skills'       // '$' palette open
  | 'mention'      // '@' palette open
  | 'instruction'  // '#' at empty input
  | 'bang-bash'    // '!' at empty input
  | 'inline-block';// an ask-user/exit-plan/plan-approval block replaces the composer

export interface ComposerMode {
  readonly kind: ComposerModeKind;
  /** plan mode is an ORTHOGONAL toggle (REQ-CP-020), not a mode-union member — it can
   *  coexist with default/slash/etc. Carried beside the union, not inside it. */
  readonly planActive: boolean;
}
```

The union is a flat single-active-mode model (REQ-CP-034): entering one trigger mode
deterministically resolves any other. `planActive` is a **separate boolean** beside the union
(not a union member) because plan mode is orthogonal — the user can be in plan mode *and* typing
a `/` command (mirrors Claudian, where the `PermissionToggle` plan state is independent of the
input mode). `inline-block` is the one mode that *replaces* the composer (REQ-CP-027).

### 2. Trigger detection + token parsing is a set of pure functions in the application layer

The "where is the caret, what trigger is active, what is the search filter" logic ports
Claudian's `utils/slashCommand.ts` + `utils/contextMentionResolver.ts` + the mode-manager
trigger guards (`BangBashModeManager.handleTriggerKey`: `!` only at empty input;
`InstructionModeManager`: `#` only at empty input) as **pure, total functions** under
`src/application/chat/composer/`:

```ts
// pure — no Vue, no Obsidian, no DOM. Given the textarea value + caret, classify.
detectTrigger(value: string, caret: number): TriggerHit | null
//   → { kind: 'slash'|'skills'|'mention'; tokenStart: number; filter: string }
//     for '/'/'$'/'@' at start-of-token; null otherwise.
shouldEnterInstruction(value: string): boolean   // '#' rule: value is empty
shouldEnterBangBash(value: string): boolean       // '!' rule: value is empty
replaceTriggerToken(value, tokenStart, insertion): { value: string; caret: number }
```

`useComposerMode` calls these on every `@input`/`@keydown` and sets the `ComposerMode` from the
result. The pure functions carry the edge-case rules (start-of-token, whitespace-closes-palette
REQ-CP-007, empty-input gate) so they are unit-testable in isolation with no mount.

### 3. `ChatComposer.vue` is extended additively; the P1 send path is gated behind `kind === 'default'`

`ChatComposer.vue` keeps its existing `onKeydown`/`submitTurn` byte-for-byte. P4 wraps them: a
new `onKeydown` first delegates to `useComposerMode.handleKeydown(event)`; **only when the mode
is `default` and plan-mode/inline-block are not intercepting** does control fall through to the
unchanged P1 Enter/Shift+Enter/IME logic (REQ-CP-035). The composable returns a "handled"
boolean exactly like Claudian's mode managers (`handleKeydown(e): boolean`) so the precedence is
explicit and testable. Escape in any trigger mode restores the composer text intact
(REQ-CP-036) — the cancelled trigger token is preserved because the textarea `v-model` value is
never destructively rewritten on cancel, only on confirm (Decision §2 `replaceTriggerToken`).

### 4. The dropdown/overlay surfaces are sibling components driven by the mode, not children of the textarea

The slash/skills/mention palettes (`ComposerDropdown.vue`) and the inline blocks
(`InlineAskUserQuestion.vue` etc., ADR-CP-004) render as **siblings** of the textarea inside the
composer wrapper, shown by `v-if` on the `ComposerMode.kind`. The `inline-block` mode toggles a
`v-if` that hides the textarea+toolbar and shows the active block (REQ-CP-027 "replaces, not
overlays") — the declarative Vue equivalent of Claudian's `inputContainerHideDepth` depth-counted
hide. Depth-counting (multiple concurrent blocks, REQ-CP-027 acceptance) is modelled as a small
queue in `useComposerMode` (an array of pending inline-block requests; the composer reappears
only when the last resolves).

### 5. State crosses the store boundary as plain DTOs only

`ComposerMode` is a plain DTO (string-kind + boolean + numbers); no class instance, no function,
no Obsidian handle crosses into reactive state (NFR-CP-005, ADR-003). The composable holds the
mode in a `ref<ComposerMode>` local to the composer subtree — it does **not** need a Pinia store
(the mode is per-composer ephemeral UI state, not shared cross-component state, so a composable
`ref` is the right scope; this is the deliberate choice between CLAR-CP-001 option (a) Pinia and
option (b) composable). The persistent outcomes (a confirmed instruction append, a sent message)
flow through the existing `tabsStore` actions / `SettingsPort`, not through composer-mode state.

## Considered options

### Option A — A Pinia composer-mode store + per-mode composables
- Pros: inspectable in devtools; matches the `tabsStore` precedent.
- Cons: composer-mode is ephemeral per-composer UI state, not shared application state; a store
  adds a serialization/DTO boundary and global singleton semantics the mode does not need;
  Pinia for transient widget state is over-reach. Rejected — kept the DTO discipline (Decision §5)
  without the store.

### Option B — A `useComposerMode` state-machine composable owning a discriminated union *(chosen)*
- Pros: scopes the mode to the composer subtree exactly where it lives; the discriminated union +
  pure trigger-parse functions are directly unit-testable; mirrors `InputController`'s single-arbiter
  shape; no global state; extends `ChatComposer.vue` additively (Decision §3).
- Cons: the composable must implement the precedence + depth-count itself (a small, well-bounded
  amount of logic — mitigated by the pure functions carrying the edge cases).

### Option C — A formal XState-style machine
- Pros: exhaustive transition modelling; visualisable.
- Cons: a new dependency + concept for ~7 states that a discriminated union + a `handleKeydown`
  switch model just as clearly; supply-chain + bundle cost for no parity gain; the team has no
  XState elsewhere. Rejected.

## Consequences

### Positive
- The five triggers, plan toggle, and inline-block swap are arbitrated in one place
  (`useComposerMode`) with a single source of truth (REQ-CP-034), reproducing `InputController`
  without its imperative DOM.
- `ChatComposer.vue` grows additively; the P1 send contract (REQ-CC-008/REQ-CP-035) is preserved
  by gating it behind `kind === 'default'` and an explicit "handled" precedence.
- Trigger detection is pure and unit-testable with no mount; the mount-level tests assert the
  wiring via PageObjects (NFR-CP-012).

### Negative
- Two keydown paths now coexist (the composable's `handleKeydown` and the P1 fall-through); the
  precedence must be documented + tested so a future maintainer does not reorder them (Compliance).

### Neutral
- Plan mode being orthogonal (a boolean beside the union) is a deliberate divergence from a
  "flat single mode" reading of REQ-CP-034 — it matches Claudian and is the only correct model
  (you can be in plan mode while typing a slash command).

## Compliance

- A unit test suite covers `detectTrigger`/`shouldEnterInstruction`/`shouldEnterBangBash`/
  `replaceTriggerToken` against the Claudian edge-case rules (start-of-token, whitespace closes,
  empty-input gate) with no mount.
- A `ChatComposer` PageObject test asserts: default-mode Enter still sends (REQ-CP-035); a `/`
  opens the palette and the send path does not fire; Escape restores `look at @no` intact
  (REQ-CP-036); the composer is hidden while an inline block is active and restored after the
  last resolves (REQ-CP-027).
- A review check confirms `ComposerMode` is a plain DTO and no Pinia store holds it (Decision §5);
  no `obsidian` import appears in `useComposerMode` or the pure parse functions.

## References

- PRD-CP-001 (`specs/composer-power/requirements.md`) — REQ-CP-001/002/007/008/015/019/029/033/034/035/036; CLAR-CP-001.
- `specs/composer-power/design.md` Part C — layer placement.
- ADR-CC-001 §3 (grow the runtime per phase additively), ADR-003 (Vue Composition API + DTO-only stores), ADR-008 (narrow ports).
- Claudian reference: `features/chat/controllers/InputController.ts` (`handleInputChange`, `inputContainerHideDepth`), `features/chat/ui/{InstructionModeManager,BangBashModeManager}.ts`, `utils/{slashCommand,contextMentionResolver}.ts`, `shared/components/SlashCommandDropdown.ts`.

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
