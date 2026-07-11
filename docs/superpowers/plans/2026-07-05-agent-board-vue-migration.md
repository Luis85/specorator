# Agent Board Vue 3 + Pinia Migration — Implementation Plan

> **Status: completed** (2026-07-11). The board and all three editors ship as Vue
> 3 + Pinia islands over the unchanged run engine; the imperative renderer, card-
> actions class, portal popover, live-heartbeat tracker, and the imperative detail
> sub-panels are deleted. See the migration decision record in
> [`docs/adr/0004-agent-board-vue-migration.md`](../../adr/0004-agent-board-vue-migration.md).
>
> **As-built deltas from this plan (fold in when reading):**
> - **Board folder key** is `agentBoardWorkOrderFolder`, read through the shared
>   `boardWorkOrderFolder(settings)` accessor (default `Agent Board/tasks`) — NOT
>   the `agentBoardFolder` this plan guessed. Both the store loader and the vault
>   filter route through that one accessor so they can't drift.
> - **Shared island helper** shipped as `ui/vue/vueIsland.ts` (`VueIsland`), not
>   the spec's `modalIsland` — element-generic (modal `contentEl` or settings
>   host), with three consumers: the detail + template editor modals and the lane
>   editor render-fn. **Shared row atom** shipped as `ui/vue/components/SettingRow.vue`,
>   not the spec's `TemplateEditorRow`.
> - **Lane editor** internals became `ui/vue/LaneEditorRoot.vue`, mounted by the
>   unchanged `renderAgentBoardLaneEditor(container, plugin)` settings render-fn
>   (it has no Settings-host disposer, so it unmounts on a MutationObserver detach
>   watch) — the imperative DOM builder is gone.
> - **Task split as executed:** Task 4 → 4 (action cluster) + 4b (reply surface +
>   pause overlay + skip chip); Task 5 → 5a (store/routing wiring) + 5b (the live
>   cutover + renderer deletion); Task 7 → 7a (template editor) + 7b (lane editor).
> - **Corrections carried through:** no drag-and-drop existed (dropped from the
>   spec's Risk #4); the lane editor is a settings render-fn, not a board modal;
>   and no busy/disabled action state was added (none existed — the cluster gates
>   only on `available` + `primary:null`).
> - **Card-actions data module** was renamed `agentBoardCardActions.ts` →
>   `ui/cardActions.ts` in Task 8 (it is data + contracts only; the DOM class it
>   used to sit beside is gone). The board scaling guard moved to the Vitest lane
>   as `tests/vue/tasks/agentBoardScaling.test.ts` (the old `agentBoard.perf` spec
>   was deleted).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the imperative Agent Board view (`AgentBoardRenderer` + `agentBoardCardActions` + `patchCard`/`patchLiveStrip`) with a reactive Vue 3 + Pinia surface over the untouched run engine, then migrate the detail/lane/template editors to Vue islands, deleting the hand-rolled DOM-patch machinery.

**Architecture:** The board *view* becomes Vue; the run *engine* (`TaskRunCoordinator`, `RunSession`, `RunSidecarStore`, `sharedRunRegistry`, orphan recovery) is untouched and keeps emitting the same `task:*` EventBus events. A Pinia store (`useAgentBoardStore`) projects the resolved board layout (`TaskIndexer.indexVaultFolder` + `loadBoardConfig` + `resolveBoardLayout`) plus live overlays (heartbeats map, per-card ledger message, pause state) driven by those events. The board root owns the EventBus subscription lifecycle and routes each event to a store setter — full-refresh events → guarded `load()`, granular events → targeted refs (the O(1) live path that replaces `patchLiveStrip`). Accrete-then-swap: new Vue code lands unwired behind characterization tests; a single cutover task swaps `AgentBoardView` to the Vue root and deletes the imperative renderer. The three editors keep their existing entry points (Modal shell / settings render-function signature) unchanged and swap only their internals to a mounted Vue app, so every call site — including the out-of-scope `WorkOrderActivityProvider` and the two settings call sites — keeps working.

**Tech Stack:** Vue 3 (SFC, `<script setup>`), Pinia (setup stores), Vitest + @testing-library/vue (the `tests/vue/` lane), esbuild + unplugin-vue (already wired), the shipped `--sp-*` style baseline + atoms (`IconButton`, `useRowActionPending`, `mergeById`, `useGuardedLoad`, `useFolderVaultRefresh`).

---

## Ground truth (from the imperative surface — do not re-derive)

**Board view:** `AgentBoardView extends ItemView` (`src/features/tasks/ui/AgentBoardView.ts:53`). `getViewType()` → `VIEW_TYPE_SPECORATOR_AGENT_BOARD` (`:156`), `getIcon()` → `'kanban-square'`. Renderer is a field `private readonly renderer = new AgentBoardRenderer()` (`:56`), heartbeat tracker `new AgentBoardLiveHeartbeatTracker()` (`:98`). `render()` (`:322`) empties `contentEl`, creates `.specorator-agent-board-host` (`:331`), calls `renderer.render(host, state, callbacks)`.

**Board load composition** (`AgentBoardView.refresh()`, `:257`): `TaskIndexer.indexVaultFolder(vault, folder)` → `TaskBoardModel` → `loadBoardConfig(plugin.settings)` → `resolveBoardLayout(config, model)` → `ResolvedBoardLayout`. Folder setting: `plugin.settings.agentBoardWorkOrderFolder`, read via the `boardWorkOrderFolder(settings)` accessor (as-built; this plan originally guessed `agentBoardFolder`).

**Layout types** (`src/features/tasks/config/boardConfigTypes.ts`): `ResolvedBoardLayout = { lanes: ResolvedLane[]; errors: string[] }` (`:41`). `ResolvedLane = { id; title; tasks: TaskSpec[]; hostsNewWorkOrders; definitionOfReady: string[]; definitionOfDone: string[]; isCatchAll; collapsible; collapsed }` (`:25`). `resolveBoardLayout(config, model)` at `src/features/tasks/config/resolveBoardLayout.ts:10`. `loadBoardConfig(settings)` at `src/features/tasks/config/BoardConfigStore.ts:10`.

**Task item** = `TaskSpec` (`src/features/tasks/model/taskTypes.ts:57`) = `{ path; frontmatter: TaskFrontmatter; sections: TaskSections; body; raw }`. `TaskFrontmatter` (`:18`) has `id`, `title`, `status: TaskStatus`, `priority: TaskPriority`, `agent?`, `provider?`, `model?`, `loop?`, `run_id?`, `conversation_id?`, `started?`, `heartbeat?`, `attempts`. **No `tags`.** `TaskStatus` (`:3`): `'inbox' | 'ready' | 'running' | 'needs_input' | 'needs_approval' | 'review' | 'needs_fix' | 'needs_handoff' | 'done' | 'failed' | 'canceled'`. `LIVE_STATUSES = new Set(['running','needs_input','needs_approval'])`.

**EventBus** (`src/core/events/EventBus.ts`): `plugin.events.on(event, handler)` returns a disposer. `TaskEventMap` (`src/features/tasks/events.ts:11`) payloads (exact): `task:heartbeat {taskId,path,at}`, `task:ledger-appended {taskId,path,entry:{timestamp,status,message}}`, `task:attempt-started {taskId,path,attemptNumber}`, `task:status-changed {taskId,path,status}`, `task:resumed {taskId,path}`, `task:needs-input {taskId,path,question,why?,default?,runId}`, `task:needs-approval {taskId,path,action,risk?,reversible?,runId}`, `task:run-finished {taskId,path,status}`, `task:board-config-changed void`, `task:queue-* (various/void)`. `roster:changed void`. `chat:tabs-changed {openCount,chatCount,workOrderCount}`.

**Full board subscription table** (`AgentBoardView.onOpen`, `:182-222`) — 18 EventBus subs + 4 vault subs. Full-refresh drivers: `chat:tabs-changed`(`:182`, refreshSlots→render), `task:board-config-changed`(`:186`), `roster:changed`(`:187`), `task:queue-cap-changed`(`:214`), `task:queue-paused`/`-resumed`/`-halted`/`-tick`/`-skipped`/`-state-changed`(`:217-222`, all `render()`). Granular drivers: `task:attempt-started`→patchCard, `task:ledger-appended`→patchLiveStrip(msg), `task:heartbeat`→tracker.record + patchLiveStrip, `task:needs-input`/`-approval`→onPauseRequested(patchCard), `task:resumed`→pauseState.delete + patchCard, `task:status-changed`→patchCard. `task:run-finished`→`runner?.tick()` only. The 4 vault subs (`create/modify/delete/rename`, `:170`) debounce 100ms → `refresh()`; `delete` also `evictInMemoryStateForPath`.

**Renderer DOM** (`AgentBoardRenderer.ts`, exact class names — the parity target): root `.specorator-agent-board` (`:116`) → `.specorator-agent-board-toolbar` + `.specorator-agent-board-lanes` (`:130`) + optional `.specorator-agent-board-errors`. Lane `.specorator-agent-board-lane` (`:331`) → `-lane-header` (`-lane-title` + `-lane-header-meta` [`-lane-count`, `-lane-collapse-toggle`]) → cards → `.specorator-agent-board-lane-add` (only if `lane.hostsNewWorkOrders`). Collapsed lane `.specorator-agent-board-lane--collapsed` (`:387`, role=button, tabindex=0, aria-expanded=false). Card `.specorator-agent-board-card.specorator-agent-board-card--<status>[.--live-actions]` (`:438`) → `-card-title-row` (`-card-status-dot--<status>[--live]` + `-card-title`) + `-card-actions[--persistent]` + `-card-meta` (`-card-meta-engine` + `-card-priority--<mod>` with 3 `-card-priority-bar[.is-filled]`) + `-card-footer[.is-hidden]` (progress + `-card-assignee` 20px avatar) + `-card-live-strip` (only LIVE: `-live-strip--meta` [`-live-strip--dot .specorator-stale-<tier>` + `-live-strip--caption`] + `-live-strip--ledger`) + `-card-reply` (needs_input/needs_approval) + `-card-skip-host`. `applyStatusDot` (`:504`) sets `aria-label`/`title` to `DEFAULT_LANE_TITLES[status]`. Stale tiers `staleTier(ageMs)` (`:733`): green(<60s)/amber(<300s)/red.

**Card action cluster** (`agentBoardCardActions.ts`): `CARD_ACTIONS: Partial<Record<TaskStatus, CardActionModel>>` (`:129`), `CardActionModel = { primary: CardAction|null; secondary?: CardAction; menu: CardAction[] }` (`:62`), `CardAction = { labelKey; icon; variant?:'cta'|'danger'|'ghost'; danger?; run(cb,task); available?(cb,task) }` (`:52`). **There is no busy/disabled state in this layer** — actions gate only via `available` predicate (menu items filtered at open time; secondary at render time) and `primary:null`. Cluster `.specorator-agent-board-card-actions[--persistent]`; primary `.specorator-agent-board-card-action-primary--<variant>`; secondary `.specorator-agent-board-card-action-secondary`; overflow `.specorator-agent-board-card-action-more`; menu classes `specorator-agent-board-card-menu[/-item/-item-icon/-item--danger/--up]`; open card gets `is-menu-open`. `CardAction.run` late-binds via `deps.getCallbacks()` — never captured at render. Per-status table verbatim: inbox→primary onMarkReady(cta)/menu OpenNote,Archive; ready & needs_fix→onRun(cta)/OpenNote,BackToInbox; running→onStop(danger) + secondary GoToConversation(ghost)/OpenNote; needs_input & needs_approval→primary null/OpenNote,OpenConversation,Stop; review→onAccept(cta)/Rework,OpenNote,OpenConversation,BackToInbox; needs_handoff→onSendToReview(cta)/MarkFailed,OpenNote; done→onReopen(ghost)/OpenNote,Archive; failed & canceled→onMarkReady(cta,"Retry")/OpenNote,Archive.

**portalPopover** (`portalPopover.ts`): `class PortalPopover` with `open()`/`close()`/`isOpen()`. `close()` (`:147`) drains `this.cleanups` (removes doc `mousedown`-capture, window `scroll`-capture, window `resize`, popover `keydown`), nulls `this.popover` before `pop.remove()`, fires `onClose`, refocuses trigger. Portals to `trigger.ownerDocument.body` (popout-safe). Position constants `ITEM_HEIGHT=34, MENU_PADDING=8, MENU_MIN_WIDTH=180, OFFSET=4, VIEWPORT_MARGIN=8` (`:42`). One-popover invariant enforced by `AgentBoardCardActions.openPopover` + `closePopover()`.

**Callback contract** `AgentBoardRenderCallbacks` (`agentBoardCardActions.ts:9`, re-exported from `AgentBoardRenderer.ts:12`) — 25 members: required `onOpenDetail, onRun, onStop, onAccept, onRework, onMarkReady, onReopen, onMoveToInbox, onAddWorkOrder, onRunNextReady, onContextMenu, onToggleLaneCollapse, onArchive, onOpenNote, onOpenConversation`; optional `getSkipReason?, onAckSkip?, onReply?, onApprove?, onReject?, onCancelPaused?, onSendToReview?, onMarkFailed?, canOpenConversation?, resolvePersona?`. View bindings at `AgentBoardView.render()` `:334-381`.

**No drag-and-drop exists.** Lane movement is via status-transition callbacks (`onMoveToInbox`, `onMarkReady`, `onAccept`) gated by `canTransitionTaskStatus`. Keyboard: collapsed-lane strip Enter/Space (`AgentBoardRenderer.ts:413`), reply-input Enter-submits (`:636`); everything else is native `<button>`.

**Modals:**
- `WorkOrderDetailModal extends Modal` (`WorkOrderDetailModal.ts:102`), ctor `(app, task: TaskSpec, callbacks: WorkOrderDetailModalCallbacks)` (`:117`). Opened from `AgentBoardView.openDetail` (`:414`) **and** `WorkOrderActivityProvider.ts:211` (out of scope — keep ctor identical). Sub-panels: `renderWorkOrderProperties(sidebar, task, callbacks)` (`workOrderPropertiesPanel.ts:65`), `renderWorkOrderActivity(main, {task,app,markdownComponent})` (`workOrderActivitySection.ts:46`, read-only), `renderWorkOrderFooter(footerEl, ctx)` (`workOrderFooterActions.ts:282`), `renderWorkOrderEditForm(main, task): WorkOrderEditFormHandle` (`workOrderEditForm.ts:75`, `collect(): WorkOrderSectionUpdate`). Save routes `onSaveSections` → `TaskNoteStore.writeSections`; `onSaveFields` → `writeFields`.
- `WorkOrderTemplateEditorModal extends Modal` (`WorkOrderTemplateEditorModal.ts:42`), ctor `(app, plugin, existing: WorkOrderTemplate|null, onSave)` (`:46`). Opened from `WorkOrderTemplatePickerModal.ts:148` (not the board directly). Persists via `TemplateNoteStore.save`.
- `AgentBoardLaneEditor` is **not a Modal** — `renderAgentBoardLaneEditor(container, plugin)` (`AgentBoardLaneEditor.ts:53`). Two call sites, both Settings: `settings/registry/fields/agentBoard.ts:191`, `settings/ui/AgentBoardSettingsSection.ts:197`. Persists `plugin.settings.agentBoardConfig` + `plugin.saveSettings()` + emits `task:board-config-changed`.

**Shared helpers to reuse or port:** `renderEditableValueChip` (`editableValueChip.ts:44`), `renderSectionHeader` (`sectionHeader.ts:32`), `renderAgentAvatar` (used at size 18/20 — find its module), `AgentBoardLiveHeartbeatTracker.computePatch` (`agentBoardLiveHeartbeat.ts`), `buildWorkOrderConversationBindings` (`workOrderConversationBindings.ts`), `buildWorkOrderFieldOptions` (`workOrderFieldOptions.ts`), `showWorkOrderContextMenu` (`WorkOrderContextMenu.ts:63`).

**Island mount pattern** (copy from `src/features/library/LibraryView.ts`): `onOpen` → `vueApp?.unmount()`, `contentEl.empty()`, `addClass('specorator-vue')` + a root class, `createApp(Root)`, `app.use(pinia)`, `app.provide(KEY, markRaw(this.plugin))`, `app.mount(contentEl)`. `onClose` → `unmount()` + `empty()` + `removeClass`. Pinia singleton: mirror `globalPinia.ts` with a board-scoped `getAgentBoardPinia()`/`resetAgentBoardPinia()`.

---

## File Structure

New Vue surface under `src/features/tasks/ui/vue/`:

| File | Responsibility |
|------|----------------|
| `vue/globalPinia.ts` | Board Pinia singleton (`getAgentBoardPinia`/`resetAgentBoardPinia`), mirrors library `globalPinia.ts`. |
| `vue/boardKeys.ts` | Vue `InjectionKey`s: `PLUGIN_KEY`, `CALLBACKS_KEY` (the `AgentBoardRenderCallbacks` provided by the view). |
| `vue/stores/agentBoardStore.ts` | `useAgentBoardStore` — layout projection + live overlays + event setters. |
| `vue/AgentBoardRoot.vue` | Toolbar + lanes container + errors; owns the EventBus subscription lifecycle → store setters. |
| `vue/components/BoardToolbar.vue` | Add-work-order / Run-next-ready / auto-run switch / slot + queue info. |
| `vue/components/BoardLane.vue` | One lane column (header, collapse, criteria, cards, Inbox add-row). |
| `vue/components/WorkOrderCard.vue` | Card title row + status dot + meta + footer + reply surface + action cluster mount. |
| `vue/components/LiveStrip.vue` | Live heartbeat/ledger strip — the perf-critical isolated reactive boundary. |
| `vue/components/CardActionCluster.vue` | Per-status primary/secondary + ⋯ overflow, driven by `CARD_ACTIONS`. |
| `vue/components/OverflowMenu.vue` | Body-teleported popover (Vue reimpl of `portalPopover`) with leak-safe teardown. |
| `vue/useBoardEventRouting.ts` | Composable: subscribe the 18 EventBus + 4 vault events on mount, route to store setters, dispose on unmount. |
| `vue/statusDot.ts` (or inline) | `statusDotClass(status)` + `staleTier(ageMs)` pure helpers (ported from renderer). |

Modal islands (keep the existing entry files; add Vue roots):

| File | Responsibility |
|------|----------------|
| `vue/WorkOrderDetailRoot.vue` + sub-panels (`WorkOrderProperties.vue`, `WorkOrderActivity.vue`, `WorkOrderFooter.vue`, `WorkOrderEditForm.vue`) | Detail modal internals as Vue; `WorkOrderDetailModal.ts` keeps its ctor and mounts this root. |
| `vue/WorkOrderTemplateEditorRoot.vue` | Template editor internals; `WorkOrderTemplateEditorModal.ts` keeps its ctor and mounts this root. |
| `vue/LaneEditorRoot.vue` | Lane editor internals; `renderAgentBoardLaneEditor(container, plugin)` keeps its signature and mounts this root. |

Tests mirror under `tests/vue/tasks/` (Vitest lane) and `tests/perf/agentBoard.perf.test.ts` (rewritten). Delete on cutover: `AgentBoardRenderer.ts`, `agentBoardCardActions.ts`, `portalPopover.ts`, `agentBoardLiveHeartbeat.ts` (fold into store), and the `patch*` methods in `AgentBoardView.ts`.

---

## Correction to the approved spec (fold in, do not re-litigate)

The spec listed drag parity as Risk #4 — **there is no drag-and-drop on the board**, so it is dropped. The spec framed the lane editor as a board "modal" — it is a settings-embedded `render*(container, plugin)` function; its migration keeps that signature and mounts a Vue island, touching neither the settings registry nor the board. The spec's Task 3 mentioned a "busy-gate" for card actions — **no busy/disabled state exists in the current action layer**; strict parity means the Vue cluster gates only via `available` + `primary:null`. Do not add busy-gating (it would be new behavior).

---

## Task 1: Board Pinia store — `useAgentBoardStore` (unwired)

**Files:**
- Create: `src/features/tasks/ui/vue/globalPinia.ts`
- Create: `src/features/tasks/ui/vue/boardKeys.ts`
- Create: `src/features/tasks/ui/vue/statusDot.ts`
- Create: `src/features/tasks/ui/vue/stores/agentBoardStore.ts`
- Test: `tests/vue/tasks/agentBoardStore.test.ts`

- [ ] **Step 1: Read the two anchors so the projection matches reality.** Read `src/features/tasks/ui/AgentBoardView.ts:257-320` (`refresh()` + `render()` state shape — confirm the exact folder setting key and the `state` object the renderer consumes) and `src/features/library/vue/stores/quickActionStore.ts` (the projection template — init-guard, `useGuardedLoad`, `mergeById`). Note the live overlay the view keeps: `liveHeartbeats: Map<taskId,isoString>` (`AgentBoardView.ts:601`) and `pauseState: Map<taskId, AgentBoardPauseState>`.

- [ ] **Step 2: Write the pure helpers.** `src/features/tasks/ui/vue/statusDot.ts`:

```ts
import type { TaskStatus } from '../../model/taskTypes';

export const LIVE_STATUSES: ReadonlySet<TaskStatus> = new Set(['running', 'needs_input', 'needs_approval']);

/** Parity with AgentBoardRenderer.applyStatusDot (:504). */
export function statusDotClass(status: TaskStatus): string {
  const live = LIVE_STATUSES.has(status) ? ' specorator-agent-board-card-status-dot--live' : '';
  return `specorator-agent-board-card-status-dot specorator-agent-board-card-status-dot--${status}${live}`;
}

export type StaleTier = 'green' | 'amber' | 'red';

/** Parity with AgentBoardRenderer.staleTier (:733). */
export function staleTier(ageMs: number): StaleTier {
  if (ageMs < 60_000) return 'green';
  if (ageMs < 300_000) return 'amber';
  return 'red';
}
```

- [ ] **Step 3: Write the injection keys.** `src/features/tasks/ui/vue/boardKeys.ts`:

```ts
import type { InjectionKey } from 'vue';

import type SpecoratorPlugin from '../../../../main';
import type { AgentBoardRenderCallbacks } from '../AgentBoardRenderer';

export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('agent-board-plugin');
export const CALLBACKS_KEY: InjectionKey<AgentBoardRenderCallbacks> = Symbol('agent-board-callbacks');
```

- [ ] **Step 4: Write the Pinia singleton.** `src/features/tasks/ui/vue/globalPinia.ts` — copy `src/features/library/vue/globalPinia.ts` verbatim, renaming exports to `getAgentBoardPinia` / `resetAgentBoardPinia` and the comment to "One Pinia for every Agent Board leaf".

- [ ] **Step 5: Write the failing store test.** `tests/vue/tasks/agentBoardStore.test.ts` — first test: `load()` projects the resolved layout.

```ts
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAgentBoardPinia, resetAgentBoardPinia } from '@/features/tasks/ui/vue/globalPinia';
import { useAgentBoardStore } from '@/features/tasks/ui/vue/stores/agentBoardStore';
import type { TaskSpec } from '@/features/tasks/model/taskTypes';

function makeTask(id: string, status = 'ready'): TaskSpec {
  return {
    path: `Agent Board/${id}.md`,
    frontmatter: { type: 'specorator-work-order', schema_version: 1, id, title: id, status, priority: '2 - normal', created: '', updated: '', attempts: 0 },
    sections: { objective: '', acceptanceCriteria: '', context: '', constraints: '', ledger: '', handoff: '' },
    body: '', raw: '',
  } as TaskSpec;
}

function makePlugin(tasks: TaskSpec[]) {
  return {
    app: { vault: {} },
    settings: {},
    events: { on: vi.fn(() => vi.fn()) },
    logger: { scope: () => ({ error: vi.fn(), warn: vi.fn() }) },
  } as never;
}

describe('useAgentBoardStore', () => {
  beforeEach(() => { resetAgentBoardPinia(); setActivePinia(getAgentBoardPinia()); vi.clearAllMocks(); });

  it('load() projects lanes with their tasks from the resolved layout', async () => {
    const tasks = [makeTask('a', 'ready'), makeTask('b', 'inbox')];
    const store = useAgentBoardStore();
    // Inject a fake loader so the store stays a pure projection in the test.
    store.init(makePlugin(tasks), {
      indexVaultFolder: vi.fn().mockResolvedValue({ tasks, invalidNotes: [] }),
      loadBoardConfig: vi.fn().mockReturnValue({ config: { schemaVersion: 1, lanes: [] }, errors: [] }),
      resolveBoardLayout: vi.fn().mockReturnValue({
        lanes: [
          { id: 'ready', title: 'Ready', tasks: [tasks[0]], hostsNewWorkOrders: false, definitionOfReady: [], definitionOfDone: [], isCatchAll: false, collapsible: false, collapsed: false },
          { id: 'inbox', title: 'Inbox', tasks: [tasks[1]], hostsNewWorkOrders: true, definitionOfReady: [], definitionOfDone: [], isCatchAll: false, collapsible: false, collapsed: false },
        ],
        errors: [],
      }),
    });
    await store.load();
    expect(store.layout.lanes.map((l) => l.id)).toEqual(['ready', 'inbox']);
    expect(store.layout.lanes[0].tasks[0].frontmatter.id).toBe('a');
  });
});
```

- [ ] **Step 6: Run it, confirm it fails** (store module missing). Run: `npx vitest run tests/vue/tasks/agentBoardStore.test.ts`. Expected: FAIL (cannot resolve `agentBoardStore`).

- [ ] **Step 7: Implement the store.** `src/features/tasks/ui/vue/stores/agentBoardStore.ts`:

```ts
import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

import type SpecoratorPlugin from '../../../../main';
import { loadBoardConfig } from '../../../config/BoardConfigStore';
import type { ResolvedBoardLayout } from '../../../config/boardConfigTypes';
import { resolveBoardLayout } from '../../../config/resolveBoardLayout';
import { TaskIndexer } from '../../../indexing/TaskIndexer';
import { TaskNoteStore } from '../../../storage/TaskNoteStore';
import type { TaskSpec } from '../../../model/taskTypes';
import { mergeById } from '../../../../library/vue/mergeById';
import { useGuardedLoad } from '../../../../library/vue/useGuardedLoad';

/** Loader seam so tests inject fakes; production wires the real modules. */
export interface BoardLoaderDeps {
  indexVaultFolder(vault: unknown, folder: string): Promise<{ tasks: TaskSpec[]; invalidNotes: unknown[] }>;
  loadBoardConfig: typeof loadBoardConfig;
  resolveBoardLayout: typeof resolveBoardLayout;
}

const EMPTY_LAYOUT: ResolvedBoardLayout = { lanes: [], errors: [] };

export const useAgentBoardStore = defineStore('agent-board', () => {
  const layout = shallowRef<ResolvedBoardLayout>(EMPTY_LAYOUT);
  const liveHeartbeats = ref<Map<string, string>>(new Map());
  const liveLedger = ref<Map<string, string>>(new Map());
  const { loading, run } = useGuardedLoad();

  let plugin: SpecoratorPlugin | null = null;
  let deps: BoardLoaderDeps | null = null;

  function init(p: SpecoratorPlugin, override?: BoardLoaderDeps): void {
    if (plugin) return;
    plugin = p;
    const indexer = new TaskIndexer(new TaskNoteStore());
    deps = override ?? {
      indexVaultFolder: (vault, folder) => indexer.indexVaultFolder(vault as never, folder),
      loadBoardConfig,
      resolveBoardLayout,
    };
  }

  function folder(): string {
    // Confirm the exact setting key against AgentBoardView.refresh() in Step 1.
    return plugin ? boardWorkOrderFolder(plugin.settings) : 'Agent Board/tasks'; // as-built key: agentBoardWorkOrderFolder
  }

  async function load(): Promise<void> {
    if (!plugin || !deps) return;
    const p = plugin; const d = deps;
    await run(
      async () => {
        const model = await d.indexVaultFolder(p.app.vault, folder());
        const { config } = d.loadBoardConfig(p.settings as never);
        return d.resolveBoardLayout(config, model as never);
      },
      (next) => {
        // mergeById keeps a running card's TaskSpec identity stable across a
        // sibling reload (avatar/strip repaint = visible flicker on a live board).
        const merged = next.lanes.map((lane) => ({
          ...lane,
          tasks: mergeById(currentTasks(lane.id), lane.tasks, (t) => t.frontmatter.id),
        }));
        layout.value = { lanes: merged, errors: next.errors };
      },
    );
  }

  function currentTasks(laneId: string): TaskSpec[] {
    return layout.value.lanes.find((l) => l.id === laneId)?.tasks ?? [];
  }

  // ── Granular live setters (the O(1) path replacing patchLiveStrip) ──
  function recordHeartbeat(taskId: string, at: string): void {
    const next = new Map(liveHeartbeats.value); next.set(taskId, at); liveHeartbeats.value = next;
  }
  function recordLedger(taskId: string, message: string): void {
    const next = new Map(liveLedger.value); next.set(taskId, message); liveLedger.value = next;
  }
  function evictLive(taskId: string): void {
    if (liveHeartbeats.value.has(taskId)) { const h = new Map(liveHeartbeats.value); h.delete(taskId); liveHeartbeats.value = h; }
    if (liveLedger.value.has(taskId)) { const l = new Map(liveLedger.value); l.delete(taskId); liveLedger.value = l; }
  }

  return { layout, liveHeartbeats, liveLedger, loading, init, load, recordHeartbeat, recordLedger, evictLive };
});
```

- [ ] **Step 8: Run the test, confirm it passes.** Run: `npx vitest run tests/vue/tasks/agentBoardStore.test.ts`. Expected: PASS.

- [ ] **Step 9: Add granular-setter tests.** Append tests: `recordHeartbeat` replaces the map (new reference, so a `watch` fires) and sets the value; `recordLedger` likewise; `evictLive` drops both. Assert `store.liveHeartbeats` is a *new* Map instance after `recordHeartbeat` (reference change is what drives reactivity). Run the file; expected PASS.

- [ ] **Step 10: Add the mergeById-identity test.** Two `load()` calls where a lane's running task keeps the same `id`: assert `store.layout.lanes[0].tasks[0]` is the *same object reference* across the two loads (identity preserved → no flicker). Run; expected PASS.

- [ ] **Step 11: Typecheck + lint.** Run: `npm run typecheck:vue && npm run lint`. Expected: clean.

- [ ] **Step 12: Commit.**

```bash
git add src/features/tasks/ui/vue/ tests/vue/tasks/agentBoardStore.test.ts
git commit -m "feat(tasks): useAgentBoardStore layout projection + live setters (unwired)"
```

---

## Task 2: Event-routing composable — `useBoardEventRouting` (unwired)

**Files:**
- Create: `src/features/tasks/ui/vue/useBoardEventRouting.ts`
- Test: `tests/vue/tasks/useBoardEventRouting.test.ts`

- [ ] **Step 1: Write the failing test.** The composable must, on mount, subscribe every event in the board's table and route it to the right store method; on unmount, dispose all. Test the two tiers: a granular event calls a granular setter (no `load`), a full-refresh event calls `load`. Mount via a throwaway host component (`defineComponent`) that calls the composable in `setup`, using a fake bus that captures handlers.

```ts
import { mount } from '@testing-library/vue';
import { setActivePinia } from 'pinia';
import { defineComponent } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAgentBoardPinia, resetAgentBoardPinia } from '@/features/tasks/ui/vue/globalPinia';
import { useAgentBoardStore } from '@/features/tasks/ui/vue/stores/agentBoardStore';
import { useBoardEventRouting } from '@/features/tasks/ui/vue/useBoardEventRouting';

function makeBus() {
  const handlers: Record<string, (p: unknown) => void> = {};
  const disposers: Array<() => void> = [];
  return {
    handlers, disposers,
    on: vi.fn((e: string, h: (p: unknown) => void) => { handlers[e] = h; const d = vi.fn(); disposers.push(d); return d; }),
  };
}
```

Assert: after mount, `bus.on` was called with `'task:heartbeat'`, `'task:ledger-appended'`, `'task:status-changed'`, `'task:board-config-changed'`, `'roster:changed'`, `'task:queue-paused'` (spot-check the tiers). Fire `handlers['task:heartbeat']({ taskId: 'a', at: 'T' })` → `store.recordHeartbeat` called with `('a','T')` and `store.load` NOT called. Fire `handlers['task:board-config-changed']()` → `store.load` called. On unmount, every disposer ran.

- [ ] **Step 2: Run it, confirm it fails** (module missing).

- [ ] **Step 3: Implement the composable.** Route every board event. Full-refresh set → `store.load()` (guarded, so concurrent fires coalesce): `task:board-config-changed`, `roster:changed`, `chat:tabs-changed`, `task:queue-paused|-resumed|-halted|-tick|-skipped|-state-changed|-cap-changed`, `task:run-finished`, `task:attempt-started`, `task:status-changed`, `task:resumed`, `task:needs-input`, `task:needs-approval` (these last five change a card's status/pause → the layout re-buckets it into the right lane, so a guarded `load()` is the correct reactive equivalent of `patchCard`). Granular set → `task:heartbeat` → `store.recordHeartbeat(p.taskId, p.at)`; `task:ledger-appended` → `store.recordLedger(p.taskId, p.entry.message)`. On any status→terminal transition, also `store.evictLive(p.taskId)` (mirror the renderer's eviction). Own the 4 vault subs too (`create/modify/delete/rename`, debounced 100ms → `store.load`) — reuse `useFolderVaultRefresh` semantics but the board watches its whole `agentBoardWorkOrderFolder`. Register all disposers in an array; `onUnmounted` runs them all + clears any debounce timer.

```ts
import { onMounted, onUnmounted } from 'vue';
import type SpecoratorPlugin from '../../../../main';
import { useAgentBoardStore } from './stores/agentBoardStore';

export function useBoardEventRouting(plugin: SpecoratorPlugin): void {
  const store = useAgentBoardStore();
  const disposers: Array<() => void> = [];
  const bus = plugin.events;

  const FULL_REFRESH = [
    'task:board-config-changed', 'roster:changed', 'chat:tabs-changed',
    'task:queue-paused', 'task:queue-resumed', 'task:queue-halted', 'task:queue-tick',
    'task:queue-skipped', 'task:queue-state-changed', 'task:queue-cap-changed',
    'task:run-finished', 'task:attempt-started', 'task:status-changed',
    'task:resumed', 'task:needs-input', 'task:needs-approval',
  ] as const;

  onMounted(() => {
    for (const evt of FULL_REFRESH) disposers.push(bus.on(evt as never, () => void store.load()));
    disposers.push(bus.on('task:heartbeat' as never, (p: { taskId: string; at: string }) => store.recordHeartbeat(p.taskId, p.at)));
    disposers.push(bus.on('task:ledger-appended' as never, (p: { taskId: string; entry: { message: string } }) => store.recordLedger(p.taskId, p.entry.message)));
    disposers.push(bus.on('task:run-finished' as never, (p: { taskId: string }) => store.evictLive(p.taskId)));
    // Vault subs (whole board folder) — port useFolderVaultRefresh's debounce inline.
    // ...create/modify/delete/rename → debounced store.load; push offref disposers.
  });

  onUnmounted(() => { for (const d of disposers) d(); disposers.length = 0; });
}
```

(Fill the vault-sub block with the `useFolderVaultRefresh` body inline, or refactor `useFolderVaultRefresh` to accept an event list — implementer's call; keep the 100ms board debounce to match `AgentBoardView.onVaultChange`.)

- [ ] **Step 4: Run the test, confirm it passes.**

- [ ] **Step 5: Add a terminal-eviction test.** Fire `task:run-finished` → `store.evictLive` called and `store.load` called. Run; PASS.

- [ ] **Step 6: Typecheck + lint. Commit.**

```bash
git commit -am "feat(tasks): board EventBus→store routing composable (unwired)"
```

---

## Task 3: Board components — Root / Toolbar / Lane / Card / LiveStrip (unwired, characterization-tested)

**Files:**
- Create: `AgentBoardRoot.vue`, `components/BoardToolbar.vue`, `components/BoardLane.vue`, `components/WorkOrderCard.vue`, `components/LiveStrip.vue` (all under `src/features/tasks/ui/vue/`)
- Test: `tests/vue/tasks/boardComponents.test.ts`

- [ ] **Step 1: Capture the parity target.** Re-read the "Renderer DOM" ground-truth block above — that class list IS the characterization target. The Vue components must emit the same class names so CSS (unchanged in this task) keeps applying.

- [ ] **Step 2: Write the failing characterization test — lanes + cards.** Render `AgentBoardRoot` with a provided store whose `layout` has two lanes (one `hostsNewWorkOrders`, one collapsed) and cards across statuses. Assert exact classes: root `.specorator-agent-board`, lanes container `.specorator-agent-board-lanes`, each `.specorator-agent-board-lane`, header `.specorator-agent-board-lane-title` text, `.specorator-agent-board-lane-count`, the Inbox `.specorator-agent-board-lane-add` present only on the hosting lane, collapsed lane `.specorator-agent-board-lane--collapsed` with `role=button`/`aria-expanded=false`. For a card: `.specorator-agent-board-card.specorator-agent-board-card--ready`, status dot `.specorator-agent-board-card-status-dot--ready`, a `running` card gets `--live-actions` + `.specorator-agent-board-card-live-strip`, a non-live card has no live strip.

- [ ] **Step 3: Run it, confirm it fails.**

- [ ] **Step 4: Implement `LiveStrip.vue`** (the perf boundary — isolate reactive deps). Props: `taskId`, `task` (TaskSpec), and it reads `store.liveHeartbeats`/`store.liveLedger` itself so a heartbeat touches only this component. Compute the dot tier via `staleTier(now - heartbeatAt)` (use the store heartbeat if present else `task.frontmatter.heartbeat`), the caption via elapsed + attempt, the ledger line from `store.liveLedger.get(taskId)` else the last non-blank `task.sections.ledger` line. Classes exactly: `-card-live-strip`, `-live-strip--meta`, `-live-strip--dot .specorator-stale-<tier>`, `-live-strip--caption`, `-live-strip--ledger`. Port `AgentBoardLiveHeartbeatTracker.computePatch` logic into a pure function `computeLiveStrip(task, heartbeatAt, ledgerMsg, now)` in `agentBoardLiveHeartbeat.ts` (export it; keep the class too until cutover) and unit-test it.

- [ ] **Step 5: Implement `WorkOrderCard.vue`.** Title row (`-card-title-row` → status-dot span with `statusDotClass(status)` + aria-label `DEFAULT_LANE_TITLES[status]` + `-card-title` text), meta row (`-card-meta-engine` "provider / model", priority bars), footer (progress + `-card-assignee` via `renderAgentAvatar` in a Vue ref-mount or a small `<AgentAvatar>` wrapper), `<LiveStrip v-if="LIVE_STATUSES.has(status)">`, `<CardActionCluster>` (added in Task 4 — leave a placeholder slot for now), reply surface for needs_input/needs_approval. Card `@click` → `callbacks.onOpenDetail(task)`; `@contextmenu.prevent` → `callbacks.onContextMenu(task, $event)`. Inject `CALLBACKS_KEY`.

- [ ] **Step 6: Implement `BoardLane.vue`** (header + collapse toggle + criteria + `v-for` cards keyed by `task.frontmatter.id` + Inbox add-row) and `BoardToolbar.vue` (Add / Run-next-ready / auto-run switch / slot + queue counts — read the exact toolbar DOM from `AgentBoardRenderer.renderBoardToolbar` `:208` and reproduce classes).

- [ ] **Step 7: Implement `AgentBoardRoot.vue`.** `<BoardToolbar>` + `.specorator-agent-board-lanes` with `<BoardLane v-for="lane in store.layout.lanes" :key="lane.id">` + `.specorator-agent-board-errors` when `store.layout.errors.length`. Call `useBoardEventRouting(plugin)` in setup (subscribes live — but this component is still unwired into the view, so it only runs under test until Task 4). Inject `PLUGIN_KEY`.

- [ ] **Step 8: Run the characterization test, confirm it passes.** Iterate class names until exact parity.

- [ ] **Step 9: Add the perf-isolation test (component-level).** Mount `AgentBoardRoot` with 2 running cards. Spy on each `LiveStrip`'s render (e.g. via `onUpdated` counter or a render-count ref). Call `store.recordHeartbeat('a','T')`. Assert only card `a`'s LiveStrip re-rendered — the board root, sibling cards, and card `b`'s LiveStrip did not. This is the guard that a heartbeat stays O(1). Run; PASS.

- [ ] **Step 10: Typecheck:vue + lint + full Vue lane.** Run: `npm run typecheck:vue && npm run lint && npx vitest run tests/vue`. Expected: clean + all green.

- [ ] **Step 11: Commit.**

```bash
git commit -am "feat(tasks): Vue board components (root/toolbar/lane/card/live-strip), characterization-tested, unwired"
```

---

## Task 4: Card action cluster + overflow teleport (unwired)

**Files:**
- Create: `components/CardActionCluster.vue`, `components/OverflowMenu.vue`
- Test: `tests/vue/tasks/cardActionCluster.test.ts`

- [ ] **Step 1: Keep `CARD_ACTIONS` as the source of truth.** Do NOT re-type the table. Import `CARD_ACTIONS`, `CardAction`, `CardActionModel`, `FALLBACK_CARD_ACTIONS` from `agentBoardCardActions.ts` (they stay exported until cutover; after cutover, move the table into a `cardActions.ts` data module — plan that move in Task 8). `CardActionCluster.vue` reads `CARD_ACTIONS[status] ?? FALLBACK_CARD_ACTIONS` and renders primary/secondary/⋯ from it.

- [ ] **Step 2: Write the failing test — per-status actions.** For each status assert the rendered primary label + variant class and the ⋯ menu item labels match the table (e.g. `running` → primary `.specorator-agent-board-card-action-primary--danger` "Stop" + secondary "Go to conversation" + menu ["Open note"]; `needs_input` → no primary, menu ["Open note","Open conversation","Stop"]). Assert `available` gating: a card with no `conversation_id` hides "Go to conversation"/"Open conversation". Assert each button's click calls the right injected callback via `deps.getCallbacks()` late-binding (provide a `CALLBACKS_KEY` spy).

- [ ] **Step 3: Run it, confirm it fails.**

- [ ] **Step 4: Implement `OverflowMenu.vue`** as a Vue `<Teleport to="body">` reimplementation of `portalPopover` with the SAME teardown contract. On open: teleport a `.specorator-agent-board-card-menu` (role=menu, tabindex=-1), position via the ported `position()` math (constants `ITEM_HEIGHT=34` etc.), register doc `mousedown`-capture + window `scroll`-capture + window `resize` + menu `keydown`(Esc) — all removed on close via `onBeforeUnmount` and an explicit `close()`. Items rebuilt each open (lazy — `available` re-evaluated). Emit `close`. Use `trigger.ownerDocument` for popout-safety. The card gets `is-menu-open` while open.

- [ ] **Step 5: Implement `CardActionCluster.vue`.** Container `.specorator-agent-board-card-actions[--persistent]` (persistent when `LIVE_STATUSES.has(status)`), `@click.stop`. Primary button `.specorator-agent-board-card-action-primary--<variant>` with `<IconButton>`-style icon span + label. Secondary via `available`. ⋯ trigger `.specorator-agent-board-card-action-more` toggles `<OverflowMenu>`. Every `run` resolves callbacks fresh from the injected `CALLBACKS_KEY` (late-bind — don't capture).

- [ ] **Step 6: Wire the cluster into `WorkOrderCard.vue`** (replace the Task 3 placeholder slot).

- [ ] **Step 7: Run the per-status test, confirm it passes.**

- [ ] **Step 8: Write the teleport leak test.** Open a card's ⋯ menu → assert one `.specorator-agent-board-card-menu` exists under `document.body` and the card has `is-menu-open`. Trigger each close path (select an item, outside `mousedown`, `Escape`, unmount the card). After each: assert zero `.specorator-agent-board-card-menu` under body, `is-menu-open` removed, and (for the listener leak) that a subsequent document `mousedown` does not throw / re-invoke. Run; PASS.

- [ ] **Step 9: Add the one-popover-at-a-time test.** Open card A's menu, then card B's — assert A's teleported node is gone (only one menu in the DOM). Run; PASS.

- [ ] **Step 10: Typecheck:vue + lint + full Vue lane. Commit.**

```bash
git commit -am "feat(tasks): Vue card action cluster + overflow teleport over CARD_ACTIONS (unwired)"
```

---

## Task 5: Board cutover — the one live-run swap

**Files:**
- Modify: `src/features/tasks/ui/AgentBoardView.ts` (mount Vue root; delete render/patch machinery)
- Delete: `AgentBoardRenderer.ts`, `agentBoardLiveHeartbeat.ts` tracker class (keep the ported pure fn), and the `patch*` methods
- Modify (defer full delete to Task 8): `agentBoardCardActions.ts` (still exports `CARD_ACTIONS` + `AgentBoardRenderCallbacks`; delete the DOM-building class)
- Rewrite: `tests/perf/agentBoard.perf.test.ts`
- Test: `tests/vue/tasks/agentBoardCutover.test.ts`

- [ ] **Step 1: Read the full `AgentBoardView.render()` + callback-binding block** (`:322-395`, `:334-381`) so the callbacks object handed to Vue is byte-identical to today's. The view keeps building this `AgentBoardRenderCallbacks` object — it is now `provide`d to Vue instead of passed to the renderer.

- [ ] **Step 2: Write the failing cutover test.** Instantiate `AgentBoardView` against the obsidian fake, `onOpen()`, assert `contentEl` has `.specorator-vue` + `.specorator-agent-board-vue-root` and a mounted `.specorator-agent-board`. Assert the store's `load()` ran (lanes present). (Mirror `tests/vue/` LibraryView-mount coverage if one exists.)

- [ ] **Step 3: Run it, confirm it fails.**

- [ ] **Step 4: Swap the view to the Vue root.** In `AgentBoardView`: remove the `renderer` field and `render()`/`patchCard`/`patchLiveStrip`/`refreshSlots` DOM methods. Keep `refresh()`'s *data* path only if the store doesn't own it — but prefer: the store owns load; the view just triggers `store.load()`. `onOpen`: mount pattern from `LibraryView` — `createApp(AgentBoardRoot)`, `app.use(getAgentBoardPinia())`, `store.init(plugin)`, `app.provide(PLUGIN_KEY, markRaw(plugin))`, `app.provide(CALLBACKS_KEY, markRaw(this.buildCallbacks()))`, `app.mount(contentEl)`. Keep ALL engine wiring (coordinator, sidecar sweeps, orphan recovery, elapsed/orphan timers) — those are unchanged. The EventBus subscriptions move OUT of the view into `useBoardEventRouting` (called by `AgentBoardRoot`); delete the view's `:182-222` subscription block. `onClose`: `unmount()` + `empty()` + dispose engine as before.

- [ ] **Step 5: Extract `buildCallbacks()`** — move the `:334-381` object literal into a private method returning `AgentBoardRenderCallbacks`, wired identically (openDetail→WorkOrderDetailModal, onRun→runTask, etc.). This is the seam Vue consumes.

- [ ] **Step 6: Delete `AgentBoardRenderer.ts`** and the heartbeat tracker class (keep `computeLiveStrip` pure fn). Fix imports. Run `npm run typecheck` — resolve every dangling reference.

- [ ] **Step 7: Run the cutover test + full unit/integration suites.** Run: `npm run test -- --selectProjects unit && npm run test -- --selectProjects integration`. The engine specs (`TaskRunCoordinator`, `RunSession`, sidecar, orphan recovery) MUST stay green — that is the proof the seam held. Fix any renderer-coupled test by pointing it at the Vue surface or deleting it if it characterized deleted DOM-building code.

- [ ] **Step 8: Rewrite `agentBoard.perf.test.ts`.** Two guards: (a) mounted DOM/listeners stay O(rendered cards) as work-order count scales (mount N cards, assert node/listener count tracks a bounded window, not super-linear); (b) a single `store.recordHeartbeat` mutates one `LiveStrip`'s reactive dep — assert the board root and sibling cards do not re-render (render-count spies, as Task 3 Step 9). Keep it a scaling/structure assertion, never a timing assertion. Run: `npm run test:perf`. Expected: PASS.

- [ ] **Step 9: Manual-parity checklist in the PR body** (no flag → QA is post-cutover): open board, create/run/stop a work order, watch a live heartbeat + ledger update, open the ⋯ menu, right-click context menu, collapse a lane, Inbox add-row. Cards still open the *existing imperative* detail/lane/template modals (unchanged this task) — the safety net.

- [ ] **Step 10: Full gate.** Run: `npm run typecheck && npm run typecheck:vue && npm run lint && npm run test && npm run test:perf && npm run build && npm run check:quality`. Expected: all green (LOC/quality ratchet should IMPROVE as the renderer deletes — re-lock baselines if it does, in this commit, with justification).

- [ ] **Step 11: Commit.**

```bash
git commit -am "feat(tasks): cut Agent Board over to the Vue root; delete imperative renderer + patch machinery"
```

---

## Task 6: `WorkOrderDetailModal` internals → Vue

**Files:**
- Create: `vue/WorkOrderDetailRoot.vue` + `vue/components/WorkOrderProperties.vue`, `WorkOrderActivity.vue`, `WorkOrderFooter.vue`, `WorkOrderEditForm.vue`
- Modify: `src/features/tasks/ui/WorkOrderDetailModal.ts` (keep ctor + `.open()`; mount Vue in `onOpen`)
- Delete (after parity): `workOrderPropertiesPanel.ts`, `workOrderActivitySection.ts`, `workOrderFooterActions.ts`, `workOrderEditForm.ts` imperative bodies (keep any shared type + `footerActionsForStatus` data if reused)
- Test: `tests/vue/tasks/workOrderDetail.test.ts`

- [ ] **Step 1: Preserve the ctor contract.** `WorkOrderDetailModal` keeps `constructor(app, task, callbacks)` and `.open()` UNCHANGED so both consumers (`AgentBoardView.openDetail` and the out-of-scope `WorkOrderActivityProvider.ts:211`) keep working. `onOpen` builds the same modal shell classes (`specorator-work-order-modal` + CSS vars + header `--<status>`) then mounts `createApp(WorkOrderDetailRoot)` into `contentEl`, providing `task`, `callbacks`, and `app`. `onClose` unmounts.

- [ ] **Step 2: Write the failing parity test — properties panel.** Render `WorkOrderProperties` with a task + spy callbacks. Assert: status pill `.specorator-work-order-modal-status-pill--<status>`; editable agent/provider/model/priority chips for editable statuses (`inbox/ready/needs_fix` for agent/loop; `!== running` for provider/model/priority); changing the provider chip calls `callbacks.onSaveFields({ provider, model: '' })`; changing priority calls `onSaveFields({ priority })`. Reproduce class names from `workOrderPropertiesPanel.ts` (the ground-truth block).

- [ ] **Step 3: Run it, confirm it fails.**

- [ ] **Step 4: Implement the four sub-panel SFCs**, porting each imperative renderer 1:1 (same classes, same callback calls). `WorkOrderActivity.vue` is read-only (renders handoff/salvage/ledger via `MarkdownRenderer` in a Vue mount using `:deep()` for markdown styling — see the Library's `MarkdownRenderer` usage pattern). `WorkOrderEditForm.vue` exposes a `collect(): WorkOrderSectionUpdate` via `defineExpose`. `WorkOrderFooter.vue` drives status CTAs from `footerActionsForStatus(task, callbacks)` (reuse it) + the Edit/Cancel/Save inline-edit toggle; suppress the right-side primary while editing (parity with `workOrderFooterActions.ts:296`).

- [ ] **Step 5: Implement `WorkOrderDetailRoot.vue`.** Layout: header, body (`-modal-main` + `-modal-sidebar`), footer. Main pane shows read-only sections (Objective/Acceptance/Context/Constraints) or `<WorkOrderEditForm>` when `editing`. Sidebar `<WorkOrderProperties>`. Footer `<WorkOrderFooter>` with `onEdit`/`onCancel`/`onSave` toggling `editing` and `onSave` → `callbacks.onSaveSections(task, editForm.collect())`. Reproduce the acceptance-ring + checklist rendering (classes in the ground-truth block).

- [ ] **Step 6: Point the modal at the Vue root.** Replace the modal's imperative `renderMainPane`/`renderFooter`/sidebar calls with the single Vue mount.

- [ ] **Step 7: Run the parity tests** (properties, footer status actions per status, edit-form `collect()` → `onSaveSections`, activity dispatch by status). Iterate to green.

- [ ] **Step 8: Delete the four imperative renderer bodies** (keep shared types + `footerActionsForStatus` if reused). `npm run typecheck` — resolve dangling refs.

- [ ] **Step 9: Full gate + manual check** (open detail from a board card AND verify the chat-header activity dropdown still opens it). Commit.

```bash
git commit -am "feat(tasks): WorkOrderDetailModal internals → Vue island; delete imperative sub-panels"
```

---

## Task 7: `WorkOrderTemplateEditorModal` + `AgentBoardLaneEditor` internals → Vue

**Files:**
- Create: `vue/WorkOrderTemplateEditorRoot.vue`, `vue/LaneEditorRoot.vue`
- Modify: `WorkOrderTemplateEditorModal.ts` (keep ctor; mount Vue), `AgentBoardLaneEditor.ts` (keep `renderAgentBoardLaneEditor(container, plugin)` signature; mount Vue)
- Test: `tests/vue/tasks/workOrderTemplateEditor.test.ts`, `tests/vue/tasks/laneEditor.test.ts`

- [ ] **Step 1: Template editor — preserve ctor + persistence.** `WorkOrderTemplateEditorModal` keeps `constructor(app, plugin, existing, onSave)` and `.open()` so `WorkOrderTemplatePickerModal.ts:148` is unchanged. `onOpen` mounts `WorkOrderTemplateEditorRoot.vue` providing `plugin`, `existing`, and `onSave`. The Vue form (name/description/icon/provider/model/priority/loop/agent/body) validates name+body (Notice on empty) and calls `onSave(payload)` then `this.close()`. Provider change resets model; loop/agent options populate async (`LoopNoteStore.list`, `plugin.agentRosterStore.list`). Reproduce i18n keys `tasks.templateEditor.*` + `tasks.template.*`.

- [ ] **Step 2: Write the failing template-editor parity test** (name-required Notice; provider change resets model; `onSave` receives the built `WorkOrderTemplateEditorPayload` with `originalPath` when editing). Run → fail → implement → pass.

- [ ] **Step 3: Lane editor — preserve the render-function signature.** `renderAgentBoardLaneEditor(container, plugin)` keeps its signature (two settings call sites unchanged) but now mounts `createApp(LaneEditorRoot)` into `container` (a `.specorator-vue` wrapper) instead of building DOM imperatively. Return after mount; store the app on a WeakMap keyed by container OR expose an unmount hook the settings pane calls — check how the settings pane tears down its section and mirror it (read `AgentBoardSettingsSection.ts:197` context). The Vue editor edits `BoardConfig` lanes (title/visible/reorder/remove/collapsible/statuses/DoR/DoD, Add lane, Reset to default) and persists via `plugin.settings.agentBoardConfig = config` + `plugin.saveSettings()` + `plugin.events.emit('task:board-config-changed')`, with rollback + Notice on failure (parity with `AgentBoardLaneEditor.ts:70-91`).

- [ ] **Step 4: Write the failing lane-editor parity test** (edit a lane title → persist writes `agentBoardConfig` + emits `task:board-config-changed`; Reset → `DEFAULT_BOARD_CONFIG`; status checkbox duplicate-owner hint). Run → fail → implement → pass.

- [ ] **Step 5: Delete the imperative bodies** of both editors (keep the entry-point functions/ctors). `npm run typecheck`.

- [ ] **Step 6: Full gate + manual check** (open template editor from Add-work-order → template picker; open lane editor from Settings → Agent Board; save each and confirm the board reacts to `task:board-config-changed`). Commit.

```bash
git commit -am "feat(tasks): template + lane editor internals → Vue islands; delete imperative bodies"
```

---

## Task 8: Docs, final table moves, ratchet re-lock, full sweep

**Files:**
- Modify: `src/features/tasks/CLAUDE.md`, root `CLAUDE.md` (the features/tasks board row + perf table `agentBoard.perf` row)
- Create: `docs/adr/0004-agent-board-vue-migration.md` (note the hard-cut, no-flag decision, mirroring ADR 0003)
- Move: `CARD_ACTIONS` table + `AgentBoardRenderCallbacks` type into a data-only module (`src/features/tasks/ui/cardActions.ts`), delete the now-empty `agentBoardCardActions.ts`, delete `portalPopover.ts` (replaced by `OverflowMenu.vue`)
- Modify: `scripts/quality-baseline.json`, LOC/CSS ratchet baselines

- [ ] **Step 1: Move the data-only `CARD_ACTIONS` + callback type** out of `agentBoardCardActions.ts` into `cardActions.ts`; update imports in `CardActionCluster.vue` + the view. Delete `agentBoardCardActions.ts` and `portalPopover.ts`. `npm run typecheck`.

- [ ] **Step 2: Update `src/features/tasks/CLAUDE.md`** — rewrite the `ui/AgentBoardRenderer` + `ui/agentBoardCardActions` + modal bullets to describe the Vue surface (`AgentBoardRoot` + store projection + `useBoardEventRouting` + the three Vue modal islands). Update root `CLAUDE.md`'s features/tasks row and the perf-suite `agentBoard.perf` description (now "Vue board render stays O(rendered cards); one heartbeat updates one LiveStrip").

- [ ] **Step 3: Write ADR 0004** — frontmatter (`title`, `date: 2026-07-05`, `status: accepted`, `scope: features/tasks/ui`), record: view→Vue / engine untouched, no-flag direct replacement, drag parity N/A (no drag existed), busy-gate not added (no prior busy state), the store-as-projection + LiveStrip perf boundary.

- [ ] **Step 4: Re-lock ratchets.** Run `npm run check:quality` — the renderer/card-actions/portalPopover deletions should DROP LOC + duplication + complexity. If any metric improved, re-lock with `npm run check:quality -- --update` and justify in the PR (net improvement, like the Library consolidation). If any metric REGRESSED, fix it (extract/decompose) — do not bump.

- [ ] **Step 5: Full sweep.** Run: `npm run typecheck && npm run typecheck:vue && npm run lint && npm run test && npm run test:vue && npm run test:perf && npm run build && npm run check:artifacts && npm run check:quality && npm run check:css`. Expected: all green.

- [ ] **Step 6: Commit + push + update PR.**

```bash
git commit -am "docs(tasks): Agent Board Vue migration — CLAUDE.md, ADR 0004, ratchet re-lock; delete residual imperative modules"
git push
```

---

## Self-Review

**Spec coverage:** Task 1 (store projection), Task 2 (event routing — the EventBus→reactive mapping), Task 3 (board components + LiveStrip perf boundary), Task 4 (card action cluster + teleport, per spec §2), Task 5 (cutover + perf rewrite, the one live-run swap), Tasks 6–7 (the three editors, per spec §3 — corrected to keep entry-point signatures), Task 8 (docs + guards + ratchet, per spec §Guards & Testing). Perf contract (spec §Perf) → Task 3 Step 9 + Task 5 Step 8. Every spec section maps to a task.

**Placeholder scan:** The bulk SFC template bodies (card/lane/toolbar/modal panels) are specified by exact class-parity lists + callback maps rather than full line-by-line SFC source — this matches how the Library plan handled its panels and is deliberate for a 6k-LOC migration; each is gated by a characterization/parity test that names the exact assertions. The store, event-routing composable, pure helpers, injection keys, and the load-bearing test are given as complete code. No "TBD"/"handle edge cases" left.

**Type consistency:** `AgentBoardRenderCallbacks` (imported, not redefined), `CARD_ACTIONS`/`CardAction`/`CardActionModel` (imported from the existing module until Task 8 moves them), `ResolvedBoardLayout`/`ResolvedLane`/`TaskSpec`/`TaskStatus` (imported from their real modules), `useGuardedLoad`/`mergeById`/`useFolderVaultRefresh`/`IconButton` (shipped, reused). `store.load()`/`recordHeartbeat`/`recordLedger`/`evictLive` names are consistent across Tasks 1–5. One flagged verify: the board folder setting key was confirmed as `agentBoardWorkOrderFolder` (via `boardWorkOrderFolder(settings)`), not the `agentBoardFolder` this plan first guessed.
