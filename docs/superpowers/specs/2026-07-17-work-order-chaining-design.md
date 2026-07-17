---
title: Work-order chaining — workflow work-orders that spawn a successor on completion
date: 2026-07-17
status: approved
scope: features/tasks (model, execution, templates, storage, ui/vue, ui modal), app defaults, main.ts wiring, i18n, CLAUDE.md
---

# Work-order chaining

## Problem

A work order on the Agent Board is a single, self-contained unit: it runs, produces
a handoff, and ends in `review` → `done`. There is no way to say "when this one
finishes, start the next one." Users who think in pipelines — *Design → Implement →
Verify*, or *Research → Draft → Edit* — must manually create each next work order,
re-type its objective, and paste in the previous result as context. Every hop is
manual bookkeeping.

We want a **workflow work-order**: a work order configured so that, once it is done,
a new work order is created automatically — already seeded with the finished work
order as input/handoff, and already `ready` to be picked up (manually or by the
auto-run queue).

## Non-goals

This is deliberately **not** the autonomous orchestrator / DAG engine that the
(superseded) `docs/ideas/agent-board-symphony.md` note explicitly dropped as
over-engineering. There is:

- no new note `type` and no `specorator-workflow` note;
- no state-machine change;
- no DAG, no fan-out, no cron, no concurrency pool;
- no branching — each work order has **at most one** successor.

A chain is expressed as a per-work-order successor link, nothing more. Multi-step
pipelines emerge from single links resolved one hop at a time.

## Decisions (settled during brainstorming)

1. **Trigger — configurable per chain.** Default **accept-gated** (spawn when the
   work order reaches `done`, i.e. the human accepted the review). Opt-in
   **on-handoff** (spawn the instant the agent finishes and the work order reaches
   `review`, before human review) for fully hands-off pipelines.
2. **Successor spec — hybrid.** A successor is defined by an optional **template**
   base plus optional inline **title/objective** overrides. No template → a
   blank-based successor from the inline overrides.
3. **Handoff input — link + next action.** The successor's `## Context` is seeded
   with a `[[wikilink]]` back to the predecessor and the predecessor handoff's
   `next_action` line (the task-prompt renderer inlines `## Context` literally, so
   this is what the successor agent actually sees).
4. **Config surface — work orders and templates.** The chain is configured per work
   order in the detail modal, and a template can declare a **default successor** that
   is inherited when the template is instantiated.
5. **Landing status — `ready`.** The successor is created in `ready` (the literal
   "ready to be picked up": eligible for both manual Run and the auto-run queue).

## Architecture

The spawn mechanism follows the existing `CommitOnAcceptCoordinator` pattern
(`src/features/tasks/commit/CommitOnAcceptCoordinator.ts`): a **plugin-level service**
that subscribes once to `task:status-changed` on the shared event bus and reacts.

This single subscription is the unified chokepoint. Every path that ends a run — a
manual run (`AgentBoardView.runTask`), a queued run (`QueueRunner` → `coordinator.run`
directly, which bypasses `runTask`), and the accept button (`transitionTask` →
`done`) — emits `task:status-changed` through `plugin.events`. `RunSession` emits
`status: 'review'` on the automatic-handoff path (after writing the handoff and the
status); `transitionTask` emits `status: 'done'` on accept. A single plugin-level
listener therefore covers manual + queued + multi-pane boards with no coupling into
the board, queue, or run engine, and no risk of one board pane double-spawning.

### Data model — `model/workOrderChain.ts` (new, pure)

A work order is a "workflow work-order" iff it has a successor configured
(`chain_template` or `chain_title` present). No new note `type`.

New **optional** frontmatter on a work order (all omitted when unconfigured, exactly
like today's `loop`/`agent`):

```yaml
# user-configured (detail modal, or inherited from a template)
chain_template: "Implement stage"   # successor template name; omit → blank base
chain_title: "Wire up the API"      # optional successor title override
chain_objective: "..."              # optional successor objective override
chain_trigger: done                 # 'done' (default) | 'review'

# engine-written (provenance + guards; not hand-edited)
chained_from: task-2026...-design   # predecessor id (written on the successor)
chained_to:   task-2026...-impl     # successor id (written on the predecessor)
chain_depth:  2                     # hop count; successor = predecessor + 1
```

Flat scalars, matching the existing `loop`/`agent`/`provider` convention and the
hand-written YAML builder in `taskCommands.workOrderFrontmatter`.

The module exports:

```ts
export type ChainTrigger = 'done' | 'review';
export const DEFAULT_CHAIN_TRIGGER: ChainTrigger = 'done';

export interface WorkOrderChainConfig {
  template?: string;    // successor template name
  title?: string;       // successor title override
  objective?: string;   // successor objective override
  trigger: ChainTrigger;
}

// Returns null when no successor is configured (neither template nor title).
export function parseChainConfig(fm: Record<string, unknown>): WorkOrderChainConfig | null;

// The chain-config frontmatter lines for the YAML builder (omitted keys → no line).
export function chainConfigFrontmatterLines(config: WorkOrderChainConfig): string[];
```

`chain_trigger` normalizes to `DEFAULT_CHAIN_TRIGGER` for absent/invalid values.
`chained_from` / `chained_to` / `chain_depth` are provenance; they are not part of
`WorkOrderChainConfig` and are threaded separately through creation.

### The coordinator — `execution/WorkOrderChainCoordinator.ts` (new)

Mirrors `CommitOnAcceptCoordinator`: `start()`/`stop()`, subscribes to
`task:status-changed`, all deps injected for unit-testing. `handle(payload)`:

1. Skip unless `status === 'review' || status === 'done'`.
2. `loadTaskSpec(payload.path)` fresh; on parse error → `logger.warn` + return.
3. `config = parseChainConfig(fm)`; skip if `null`.
4. Skip unless `config.trigger === status`. (Accept-gated waits for `done`; a
   `review` event with a `done` trigger is a no-op, and vice-versa.)
5. **Idempotency:** skip if `fm.chained_to` is already set. This also makes a re-run
   or reopen→re-accept a no-op — a predecessor spawns at most one successor for its
   lifetime.
6. **In-flight guard:** a `Set<string>` of predecessor ids currently spawning
   (synchronous check-and-add, cleared in `finally`) collapses a same-tick duplicate
   event before the persistent `chained_to` guard is written.
7. **Depth guard:** if `(fm.chain_depth ?? 0) >= readSettings().agentBoardMaxChainDepth`
   → `showNotice` + `appendLedger` warning on the predecessor + return.
8. Resolve the template by name via `listTemplates()` when `config.template` is set.
   Missing → `showNotice` ("template '<name>' not found; creating a blank successor")
   and proceed with a blank base (never silently drops the chain).
9. `createSuccessor(...)` (see below) → new `TaskSpec`.
10. `writeChainLink(predecessorPath, successorId)` stamps `chained_to` on the
    predecessor (idempotency guard + forward link).
11. `appendLedger` a `Chained → [[successor]]` line on the predecessor + `showNotice`.

The board re-indexes on the new file's vault `create` event, and the queue ticks on
the same event; if auto-run is on, the `ready` successor launches.

Injected deps: `events`, `loadTaskSpec`, `listTemplates`, `createSuccessor`,
`writeChainLink`, `appendLedger`, `readSettings`, `logger`, `showNotice`.

### Successor creation — reuse `createWorkOrderFromSeed`

`WorkOrderSeed` (in `commands/taskCommands.ts`) gains optional fields:
`provider`, `model`, `agent` (inline inheritance), `chain` (a `WorkOrderChainConfig`
to persist onto the successor for the next hop), `chainedFrom`, `chainDepth`.
`workOrderFrontmatter()` conditionally emits the chain lines, mirroring the existing
`loopLine` / `agentLine` pattern (omitted → no line). This keeps the whole successor
in a single atomic creation write and reuses all existing logic (folder resolution,
unique-path, template body rendering, provider/model resolution via `resolveRunTarget`).

The coordinator's `createSuccessor` builds the seed:

- **title** = `config.title` ?? `template?.name` ?? `"<predecessor title> — next"`
- **objective** = `config.objective` (else the template body supplies it)
- **contextMarkdown** (the "input"):
  ```
  Chained from [[<predecessor path without .md>]] — see its Result / Handoff.

  ## Next action
  <next_action from parseHandoffSections(predecessor.sections.handoff)>
  ```
  When the handoff has no `next_action` (e.g. a manual send-to-review with no
  structured handoff), the `## Next action` block is omitted; the wikilink stays.
- **status** = `'ready'`
- **chainedFrom** = predecessor id; **chainDepth** = `(fm.chain_depth ?? 0) + 1`
- **chain** = the resolved template's own `chain` config (the next hop), if any; else
  undefined (the chain ends).
- **provider/model/agent** = the template's when template-based (via the normal
  `resolveRunTarget` path); otherwise **inherited from the predecessor** so a blank
  inline successor is immediately runnable.

Then `createWorkOrderFromSeed(plugin, seed, { template, status: 'ready', reveal: 'none' })`.

### Templates carry chains

- `WorkOrderTemplate` gains `chain?: WorkOrderChainConfig`.
- `TemplateNoteStore.parse` reads `chain_template` / `chain_title` / `chain_objective`
  / `chain_trigger` from template frontmatter into `chain`.
- `TemplateNoteStore.build` writes those keys back.
- `createWorkOrderFromSeed` copies a picked template's `chain` into the created work
  order's frontmatter — so instantiating a chained template (even via the normal
  "+ Add from template" flow) yields a work order pre-wired to chain, and the
  coordinator's template-based spawns propagate the pipeline one hop at a time.

### Storage — `TaskNoteStore`

- `WriteFieldsOptions` gains `chain?: WorkOrderChainConfig | null` (an explicit `null`
  clears the chain). `writeFields` writes/removes the `chain_*` keys. This reuses the
  existing detail-modal save path (`onSaveFields` → `saveTaskFields` →
  `applyNoteChange` → `writeFields`).
- A small dedicated method `writeChainLink(content, successorId, timestamp)` stamps
  `chained_to` (provenance kept out of the user-facing `writeFields` surface).
- Unknown frontmatter already round-trips (`writeStatus`/`writeFields` spread
  `...frontmatter`), so the chain/provenance fields survive every existing note
  rewrite untouched.

### UI

1. **Detail modal** — a **"Next step"** chip in `WorkOrderProperties.vue` (beside the
   Loop chip), showing the configured successor (template name / override title, or
   "None"). It opens a new Obsidian-native `ui/ChainConfigModal.ts` (mirrors
   `LoopEditorModal`; ADR 0006 keeps modals imperative): a template picker (reusing
   `chooseWorkOrderTemplate`), optional title + objective fields, a trigger toggle
   ("After I accept" / "When agent hands off"), and Clear. Saving routes through the
   `onSaveFields`-extended seam (`chain`).
2. **Template editor** — a "Default next step" section in
   `ui/workOrderTemplateEditorForm.ts` + `ui/vue/WorkOrderTemplateEditorRoot.vue`
   (template picker + trigger + optional overrides), persisted to the template's
   `chain_*` frontmatter.
3. **Card indicator** — a small chain/link icon on `ui/vue/components/WorkOrderCard.vue`
   when a card has a chain configured or a `chained_from` / `chained_to` link, so
   workflow work-orders read as distinct on the board. Purely presentational; no new
   interaction.

### Settings + safety

- New setting `agentBoardMaxChainDepth` (default **25**) in `app` defaults. Bounds a
  runaway or cyclic pipeline (e.g. template A → B → A). The `chained_to` guard already
  prevents a single predecessor spawning twice; the depth cap bounds a legitimate but
  runaway multi-hop chain. Auto-run being off also means a chain only advances on
  manual runs.
- Missing template → graceful blank successor + notice; the chain is never silently
  dropped.
- Re-triggering a chain after a reopen requires manually clearing `chained_to` (safe
  default: no duplicate successors). Documented in `CLAUDE.md`.

## Data flow

```
run ends (manual | queued) ─► RunSession writes handoff + status:'review'
                              └─► emits task:status-changed {status:'review'}
user accepts ────────────────► transitionTask writes status:'done'
                              └─► emits task:status-changed {status:'done'}
                                        │
                     WorkOrderChainCoordinator.handle
                     (trigger match? · not already chained? · under depth cap?)
                                        │ yes
                     resolve template → build seed (link + next_action, ready,
                     provenance, inherited chain) → createWorkOrderFromSeed
                                        │
                     stamp chained_to on predecessor · ledger line · notice
                                        │
              vault 'create' event ─► board re-index + queue tick ─► (auto-run?)
```

## Testing

- `tests/unit/features/tasks/model/workOrderChain.test.ts` — `parseChainConfig`
  (null when unconfigured, default trigger, invalid trigger normalization) and the
  frontmatter-line round-trip.
- `tests/unit/features/tasks/execution/workOrderChainCoordinator.test.ts` — fires only
  on a matching trigger; idempotent via `chained_to`; in-flight de-dup on a duplicate
  same-tick event; depth cap; missing-template blank fallback; context seeded with the
  wikilink + `next_action`; stamps `chained_from` + `chain_depth + 1` on the successor
  and `chained_to` on the predecessor.
- `tests/unit/features/tasks/commands/taskCommands` — successor frontmatter (chain
  config + provenance) renders and round-trips through `TaskNoteStore.parse`.
- `tests/unit/features/tasks/templates` — template `chain` parse/build round-trip and
  the instantiation copy into a new work order.
- `tests/integration/features/tasks` — full `done → spawn → ready (→ auto-run)` path
  driven through a fake event bus, asserting one successor, correct seeded context,
  and no duplicate on a repeated event.

## Files

**New:** `model/workOrderChain.ts`, `execution/WorkOrderChainCoordinator.ts`,
`ui/ChainConfigModal.ts`, plus the mirrored test files.

**Edited:** `commands/taskCommands.ts` (seed + frontmatter builder),
`templates/templateTypes.ts`, `templates/TemplateNoteStore.ts`,
`ui/workOrderTemplateEditorForm.ts`, `ui/vue/WorkOrderTemplateEditorRoot.vue`,
`storage/TaskNoteStore.ts` (`chain` in `writeFields` + `writeChainLink`),
`ui/vue/components/WorkOrderProperties.vue` + `ui/WorkOrderDetailModal.ts` /
`ui/vue/detailKeys.ts` + `ui/AgentBoardView.ts` (chip + save seam + `ChainConfigModal`
wiring + field options), `ui/vue/components/WorkOrderCard.vue` (indicator),
`src/main.ts` (wire the coordinator beside `commitOnAcceptCoordinator`),
`app` default settings (`agentBoardMaxChainDepth`), i18n locales,
`src/features/tasks/CLAUDE.md`.
