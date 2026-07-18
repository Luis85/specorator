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

A work order is a "workflow work-order" iff it has a successor configured — i.e.
**any** of `chain_template`, `chain_title`, or `chain_objective` is present. (A
successor needs no template and no explicit title: an objective-only config is
valid, because creation supplies a fallback title. Excluding `chain_objective`
from the predicate would let an objective-only config save yet silently never
spawn.) No new note `type`.

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

// Returns null only when no successor is configured — i.e. template, title, and
// objective are all absent. Any one of the three marks the chain as configured.
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
   → `showNotice` + return (no note-ledger write — see step 10).
8. Resolve the template by name via `listTemplates()` when `config.template` is set.
   Missing → `showNotice` ("template '<name>' not found; creating a blank successor")
   and proceed with a blank base (never silently drops the chain).
9. `createSuccessor(...)` (see below) → new `TaskSpec`.
10. `markChained`: stamp `chained_to` on the predecessor (idempotency guard + forward
    link) via a `vault.process` write. The chain's durable audit is **frontmatter only**
    — `chained_to` on the predecessor plus `chained_from`/`chain_depth` on the successor.
    The coordinator deliberately does NOT write the note's Run Ledger region: on the
    `review` trigger, `RunSession` emits `task:status-changed` and then replaces that whole
    region with its sidecar snapshot (`writeLedgerSnapshot`), which would erase any
    coordinator-appended ledger line (the append isn't part of the sidecar). Frontmatter
    survives the snapshot and is the right home for a structural predecessor↔successor link.
11. `showNotice` the spawn (and, on a depth-cap skip, a Notice — no ledger line).

The in-flight reserve (step 6) happens **after** the trigger check (step 4), and only a
matching event reserves the path — otherwise a non-matching event (a `review` event for
a `done`-triggered chain) could hold the path and suppress the matching `done` event,
since `EventBus.emit` does not await handlers. The `has()`+`add()` reserve is synchronous,
so two concurrent matching events still yield exactly one spawn.

The board re-indexes on the new file's vault `create` event, and the queue ticks on
the same event; if auto-run is on, the `ready` successor launches.

Injected deps: `events`, `loadTaskSpec`, `listTemplates`, `createSuccessor`,
`markChained` (stamps `chained_to` via `vault.process`), `readSettings`, `logger`,
`showNotice`. There is no `appendLedger` dep — the coordinator never writes the note's
Run Ledger region (its durable audit is frontmatter). Plugin-level wiring is assembled by
`execution/createWorkOrderChainCoordinator.ts` and called from `main.ts` in a few lines
(the deps block lives in that module, not inlined into `main.ts`, to respect its LOC gate).

### Successor creation

Successor creation reuses `createWorkOrderFromSeed`, and injects the chain-specific
content **inside the same `vault.create`** via a `postProcess` hook, so the note is
written fully seeded and already `ready` — it is never observable in a runnable but
un-seeded state. That single-write property is essential: the board reacts to the
vault `create` event by re-indexing and ticking `QueueRunner`, which reloads the fresh
note and launches it when auto-run is on. A create-then-modify sequence would expose a
window where the queue reloads a `ready` note **before** the seed write lands, starting
the successor with the bare template/default body and no handoff context. Seeding in the
create write closes that race.

The seeding also fixes a **template-branch** gap: today `buildWorkOrderMarkdownForSeed`'s
template path renders only the template body — it never forwards `contextMarkdown` or
`objective` (those are wired only in the blank branch) — and `createWorkOrderFromSeed`
lets `template?.name` dominate `seed.title`. So a naive "just pass a seed" reuse would
create every template-based successor **without** the predecessor wikilink / next-action
seed and would **ignore** the configured title/objective overrides. The `postProcess`
hook injects those inputs uniformly for template and blank successors.

**Step 1 — base markdown via `createWorkOrderFromSeed`.** `WorkOrderSeed` (in
`commands/taskCommands.ts`) gains optional fields: `titleOverride`, `provider`, `model`,
`agent` (inline inheritance), `chain` (a `WorkOrderChainConfig` to persist onto the
successor for the next hop), `chainedFrom`, `chainDepth`. `workOrderFrontmatter()`
conditionally emits the chain/provenance lines, mirroring the existing `loopLine` /
`agentLine` pattern (omitted → no line). The title-precedence line in
`createWorkOrderFromSeed` becomes
`seed.titleOverride?.trim() || template?.name?.trim() || seed.title || 'New work order'`
— backward-compatible (no override → the template name still dominates the normal
"+ Add from template" flow), but a chain's configured title now wins over the template
name. Step 1 owns the frontmatter (provenance + inherited chain), provider/model/agent,
folder/unique-path, and the body (template-rendered or the default blank body).

The coordinator computes:
- **titleOverride** = `config.title` (undefined when unset)
- **seed.title** (base fallback) = `"<predecessor title> — next"` — used only when there
  is neither a `titleOverride` nor a template
- **chain** = the resolved template's own `chain` config (the next hop), if any; else
  undefined (the chain ends)
- **provider/model/agent** = the template's when template-based (via the normal
  `resolveRunTarget` path); otherwise inherited from the predecessor so a blank inline
  successor is immediately runnable. For an **agent-only** predecessor (a `roster:` agent
  with no explicit provider/model), the coordinator wiring resolves the agent's backend
  (`resolveAgentRunTarget`, as `TaskRunCoordinator` does) and writes concrete provider/model
  — so the successor runs on the assigned agent and stays queue-eligible, not on board
  defaults
- **status** = `'ready'`; **chainedFrom** = predecessor id;
  **chainDepth** = `(fm.chain_depth ?? 0) + 1`

**Step 2 — seed via a `postProcess` hook, applied before `vault.create`.**
`CreateWorkOrderOptions` gains `postProcess?: (markdown: string) => string`, applied to
the generated markdown immediately before the single `vault.create` (a no-op for every
existing call site). Because `writeChainContext`/`writeSections` are pure content
transforms, the coordinator composes them into `postProcess` so the note is created with
the seed already present:

- `writeChainContext(markdown, { predecessorPath, nextAction })` — a new store method
  that inserts the seed at the **top** of the `## Context` section, dropping the default
  Context placeholder when present and preserving any template-authored context below.
  The seed stays within the section (no `##` sub-heading, which `writeSections` would
  treat as the next section boundary):
  ```
  Chained from [[<predecessor path without .md>]] — see its Result / Handoff.

  **Next action:** <next_action from parseHandoffSections(predecessor.sections.handoff)>
  ```
  When the handoff has no `next_action` (e.g. a manual send-to-review with no structured
  handoff), the `**Next action:**` line is omitted; the wikilink stays.
- `writeSections(markdown, { objective: config.objective })` — **only** when an objective
  override is set, so a template-based successor honors the override instead of keeping
  the template's authored objective.

Because the hook injects context + objective for **both** branches inside the create
write, the blank branch no longer relies on `contextMarkdown`/`objective` being threaded
through `createWorkOrderFromSeed`, the one path is uniform and directly testable, and
there is no create-then-modify window for the queue to race. The predecessor's own
writes (`chained_to` back-link, ledger line) happen after and don't affect the
successor's runnability; the in-flight guard covers a duplicate predecessor event during
that window.

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
- A new `writeChainContext(content, { predecessorPath, nextAction })` inserts the chain
  seed at the top of the `## Context` section (drops the default placeholder; preserves
  any existing context below). The next-action is **blockquoted** so a heading the handoff
  parser preserved inside it (`## …`) can't create a false `## ` section boundary that a
  later parse would read as the next section (truncating the seed). Pure string transform,
  unit-tested independently.
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
                     resolve template → createWorkOrderFromSeed with postProcess
                     (one vault.create: frontmatter/provider/model/title/body +
                      seeded context + objective override — already `ready`)
                                        │
                     stamp chained_to on predecessor · ledger line · notice
                                        │
              vault 'create' event ─► board re-index + queue tick ─► (auto-run?)
```

## Testing

- `tests/unit/features/tasks/model/workOrderChain.test.ts` — `parseChainConfig`
  (null only when template + title + objective are all absent; **objective-only config
  is non-null**; default trigger; invalid trigger normalization) and the frontmatter-line
  round-trip.
- `tests/unit/features/tasks/storage/taskNoteStore` — `writeChainContext` inserts the
  seed at the top of `## Context`, drops the default placeholder, preserves existing
  context below, and omits the `**Next action:**` line when `nextAction` is empty;
  `writeChainLink` stamps `chained_to`.
- `tests/unit/features/tasks/execution/workOrderChainCoordinator.test.ts` — fires only
  on a matching trigger; idempotent via `chained_to`; in-flight de-dup on a duplicate
  same-tick event; depth cap; missing-template blank fallback; stamps `chained_from` +
  `chain_depth + 1` on the successor and `chained_to` on the predecessor. **Both a blank
  and a template-based successor get the wikilink + `next_action` seeded into Context,
  and a template-based successor honors the configured title/objective overrides (they
  are not lost to the template body / template name).**
- `tests/unit/features/tasks/commands/taskCommands` — successor frontmatter (chain
  config + provenance) renders and round-trips through `TaskNoteStore.parse`;
  `titleOverride` wins over `template.name`, and its absence preserves the existing
  template-name-dominates behavior.
- `tests/unit/features/tasks/templates` — template `chain` parse/build round-trip and
  the instantiation copy into a new work order.
- `tests/integration/features/tasks` — full `done → spawn → ready (→ auto-run)` path
  driven through a fake event bus, for **both** a blank and a template-based chain,
  asserting one successor, correct seeded context + overrides, and no duplicate on a
  repeated event. Asserts the created note is **already seeded and `ready` from its
  single `vault.create`** (the `postProcess` output), so an auto-run reload can never
  observe a runnable-but-un-seeded successor.

## Known limitations (follow-ups)

- **A chained successor falls back to board defaults when a bound roster agent can't supply
  a backend.** Two cases:
  1. *Agent-only template* — a chain template that sets only `agent: roster:*` (no explicit
     `provider`/`model`) instantiates the successor with the board-default provider/model,
     because `createWorkOrderFromSeed` resolves a template's provider/model without consulting
     the roster agent.
  2. *Inline agent deleted/renamed* — an inline chain that inherits `agent: roster:*` (no
     provider/model) from its predecessor, where the roster entry no longer resolves
     (`resolveAgentRunTarget` → `null`): the successor is created `ready` on board defaults
     with a dangling agent instead of surfacing the missing agent.

  Both are the same root: `TaskRunCoordinator` only falls back to the agent when
  provider/model are *absent*, but `createWorkOrderFromSeed`'s `inlineRunDefaults` fills board
  defaults, so the agent is never consulted at run time. This is **pre-existing**
  `createWorkOrderFromSeed`/roster behavior surfaced by chaining (the normal "+ Add from an
  agent-only template" flow has the same gap). Agent specialization **works today** for inline
  chains whose agent *resolves* (covered by the integration test) and for templates that pin
  provider/model. A proper fix belongs in the general creation/roster path — make
  `createWorkOrderFromSeed` resolve an agent-backed WO's backend via `resolveAgentRunTarget`,
  and skip + surface when a *bound* agent can't be resolved — which touches the shared creation
  flow and is deliberately **out of scope for this chaining slice** (a tracked follow-up; note
  the lint rule requires the surface Notice to be i18n'd via `t()`). Workaround: pin
  provider/model on the template/work order, or keep the roster agent valid.

## Files

**New:** `model/workOrderChain.ts`, `execution/WorkOrderChainCoordinator.ts`,
`execution/createWorkOrderChainCoordinator.ts` (plugin-level deps wiring, kept out of
`main.ts` for its LOC gate), `ui/ChainConfigModal.ts`, plus the mirrored test files.

**Edited:** `commands/taskCommands.ts` (seed fields + `titleOverride` precedence in
`createWorkOrderFromSeed` + `workOrderFrontmatter` chain/provenance lines +
`CreateWorkOrderOptions.postProcess` applied to the markdown before `vault.create`),
`commands/workOrderResolution.ts` (forward `chain`/`chainedFrom`/`chainDepth`/`agent`
through `WorkOrderMarkdownContext` + the `WorkOrderMarkdownBuilders` arg shapes;
`titleOverride` needs no change here — the final title is computed in
`createWorkOrderFromSeed` and passed down as `ctx.title`),
`templates/templateTypes.ts`, `templates/TemplateNoteStore.ts`,
`ui/workOrderTemplateEditorForm.ts`, `ui/vue/WorkOrderTemplateEditorRoot.vue`,
`storage/TaskNoteStore.ts` (`chain` in `writeFields` + `writeChainLink` +
`writeChainContext`),
`ui/vue/components/WorkOrderProperties.vue` + `ui/WorkOrderDetailModal.ts` /
`ui/vue/detailKeys.ts` + `ui/AgentBoardView.ts` (chip + save seam + `ChainConfigModal`
wiring + field options), `ui/vue/components/WorkOrderCard.vue` (indicator),
`src/main.ts` (wire the coordinator beside `commitOnAcceptCoordinator`),
`app` default settings (`agentBoardMaxChainDepth`), i18n locales,
`src/features/tasks/CLAUDE.md`.
