# Unified Background Activity Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give chat tabs an honest "still working" signal and one chat-header activity center that lists both in-conversation background subagents and Agent Board work-order runs, each with a live "what it's doing now" line.

**Architecture:** Approach A — merge at the edges. A new `SubagentActivityCollector` aggregates live subagents across all open tabs (fed by a new `subagent:activity-changed` event). A new `BackgroundActivityCenter` merges that with the existing `WorkOrderActivityProvider` summary (plus a work-order live-activity map sourced from `task:progress` / `task:ledger-appended`) into one `BackgroundActivitySummary`. The existing header dropdown is generalized to render both sources; `TabManager.getTabBarItems()` stops reporting false-idle by OR-ing in `hasRunningSubagents()`.

**Tech Stack:** TypeScript, Obsidian plugin APIs (`createDiv`/`setIcon`), the in-process `EventBus`, Jest (projects: `unit` / `integration` / `perf`), i18n `t()`.

**Spec:** `docs/superpowers/specs/2026-06-28-unified-background-activity-center-design.md`

**Conventions (read once):**
- No `console.*` in `src/`. No `innerHTML`/`outerHTML`/`insertAdjacentHTML` — build DOM with `createDiv`/`createSpan`/`setText`/`setIcon`.
- Tests mirror `src/` under `tests/unit/` and `tests/integration/`. Import via `@/...` and `@test/...` aliases.
- Run a single unit test file: `npm run test -- --selectProjects unit <testPath>`.
- After each task: `npm run typecheck && npm run lint`.
- Comment *why*, not *what*.

---

## Spec refinement (apply during implementation)

The center shows **active** items only (`running` / `needs_input` / `needs_approval`), exactly like the existing Work Orders dropdown. A subagent that reaches a terminal state (`completed` / `error` / `orphaned`) drops off the center; its outcome is surfaced **inline** via the informative completion line (Task 10) and the existing async subagent block. This keeps the collector timer-free and deterministic, and consistent with current dropdown behavior. Update spec Decision 6 wording to match when you touch the spec.

---

## File structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/core/types/backgroundActivity.ts` | Create | Source-neutral activity model + pure mappers/formatters |
| `src/features/chat/events.ts` | Modify | Add `subagent:activity-changed` to `ChatEventMap` |
| `src/features/chat/tabs/tabControllerSetup.ts` | Modify (~132) | Emit `subagent:activity-changed` from the existing subagent callback |
| `src/features/chat/activity/SubagentActivityCollector.ts` | Create | Aggregate live subagents across tabs → subagent activity items |
| `src/features/chat/activity/BackgroundActivityCenter.ts` | Create | Merge work-order + subagent activity into one summary; route `openItem` |
| `src/main.ts` | Modify (~176) | Instantiate / start / dispose the center |
| `src/features/chat/ui/BackgroundActivityDropdown.ts` | Create (from `WorkOrderActivityDropdown.ts`) | Render both sources + live activity line + elapsed |
| `src/features/chat/SpecoratorView.ts` | Modify (~621, ~816) | Mount center-backed dropdown; refresh tab bar on activity change |
| `src/features/chat/tabs/TabManager.ts` | Modify (~490) | False-idle badge fix |
| `src/features/chat/rendering/SubagentRenderer.ts` | Modify | `data-subagent-id` anchor on each block |
| `src/features/chat/tabs/TabManager.ts` | Modify | `scrollToSubagent(tabId, subagentId)` |
| `src/features/chat/services/SubagentManager.ts` | Modify | `getLastTerminalSubagent()` for the completion line |
| `src/features/chat/tabs/tabRuntimeHost.ts` | Modify (~160) | Informative completion line |
| `tests/perf/backgroundActivity.perf.test.ts` | Create | Summary build stays O(active items) |

Existing `WorkOrderActivityProvider`, `WorkOrderActivityItem`, `task:*` events, and the `workOrderActivity.*` i18n keys are **reused unchanged**.

---

## Task 1: Source-neutral activity types + pure helpers

**Files:**
- Create: `src/core/types/backgroundActivity.ts`
- Test: `tests/unit/core/types/backgroundActivity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import {
  describeSubagentActivity,
  mapWorkOrderItem,
  subagentToActivityItem,
} from '@/core/types/backgroundActivity';
import type { WorkOrderActivityItem } from '@/core/types/workOrderActivity';
import type { SubagentInfo } from '@/core/types';

describe('backgroundActivity helpers', () => {
  it('maps a work-order activity item, attaching a live activity line', () => {
    const wo: WorkOrderActivityItem = {
      id: 'wo-1', path: 'Agent Board/tasks/wo-1.md', title: 'Migrate settings',
      status: 'needs_input', labelKey: 'workOrderActivity.status.needsInput',
      actionHintKey: 'workOrderActivity.action.reply', sidepanelTabId: 'tab-9',
    };
    const item = mapWorkOrderItem(wo, 'Waiting on answer');
    expect(item).toMatchObject({
      id: 'wo-1', source: 'work-order', title: 'Migrate settings',
      state: 'needs_input', activity: 'Waiting on answer', tabId: 'tab-9',
      path: 'Agent Board/tasks/wo-1.md',
      labelKey: 'workOrderActivity.status.needsInput',
      actionHintKey: 'workOrderActivity.action.reply',
    });
  });

  it('describes subagent activity from the latest tool call', () => {
    const info = {
      id: 'a1', description: 'Review Task 6', isExpanded: false, status: 'running',
      asyncStatus: 'running',
      toolCalls: [
        { id: 't1', name: 'Read', input: {}, status: 'completed' },
        { id: 't2', name: 'Edit', input: { file_path: 'src/MessageRenderer.ts' }, status: 'running' },
      ],
    } as unknown as SubagentInfo;
    expect(describeSubagentActivity(info)).toBe('Editing MessageRenderer.ts');
  });

  it('returns undefined activity when no tool calls have run', () => {
    const info = { id: 'a1', description: 'x', isExpanded: false, status: 'running', asyncStatus: 'running', toolCalls: [] } as unknown as SubagentInfo;
    expect(describeSubagentActivity(info)).toBeUndefined();
  });

  it('builds a running subagent activity item', () => {
    const info = {
      id: 'a1', description: 'Review Task 6', isExpanded: false, status: 'running',
      asyncStatus: 'running', startedAt: 1000,
      toolCalls: [{ id: 't2', name: 'Bash', input: { command: 'npm test' }, status: 'running' }],
    } as unknown as SubagentInfo;
    const item = subagentToActivityItem('tab-3', 'conv-3', info);
    expect(item).toMatchObject({
      id: 'a1', source: 'subagent', title: 'Review Task 6', state: 'running',
      tabId: 'tab-3', conversationId: 'conv-3', startedAt: 1000,
      labelKey: 'workOrderActivity.status.running',
      actionHintKey: 'workOrderActivity.action.open',
    });
    expect(item.activity).toContain('npm test');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --selectProjects unit tests/unit/core/types/backgroundActivity.test.ts`
Expected: FAIL — cannot find module `@/core/types/backgroundActivity`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/types/backgroundActivity.ts
import type { TranslationKey } from '../../i18n/types';
import type { SubagentInfo, ToolCallInfo } from './tools';
import type { WorkOrderActivityItem, WorkOrderActivityClosableTab } from './workOrderActivity';

export type BackgroundActivitySource = 'subagent' | 'work-order';

export type BackgroundActivityState =
  | 'running' | 'needs_input' | 'needs_approval' | 'completed' | 'error';

export interface BackgroundActivityItem {
  id: string;
  source: BackgroundActivitySource;
  title: string;
  state: BackgroundActivityState;
  labelKey: TranslationKey;
  actionHintKey: TranslationKey;
  activity?: string;
  startedAt?: number;
  tabId?: string | null;
  conversationId?: string | null;
  path?: string | null;
}

export interface BackgroundActivitySummary {
  readonly items: readonly BackgroundActivityItem[];
  readonly runningCount: number;
  readonly attentionCount: number;
  readonly closableTabs: readonly WorkOrderActivityClosableTab[];
}

export const EMPTY_BACKGROUND_ACTIVITY_SUMMARY: BackgroundActivitySummary = Object.freeze({
  items: Object.freeze([]),
  runningCount: 0,
  attentionCount: 0,
  closableTabs: Object.freeze([]),
});

export function mapWorkOrderItem(item: WorkOrderActivityItem, activity?: string): BackgroundActivityItem {
  return {
    id: item.id,
    source: 'work-order',
    title: item.title,
    state: item.status,
    labelKey: item.labelKey,
    actionHintKey: item.actionHintKey,
    ...(activity ? { activity } : {}),
    tabId: item.sidepanelTabId ?? null,
    path: item.path,
  };
}

// Maps a subagent's latest tool call to a short, human "doing X now" phrase.
// Untranslated by design — tool targets are code identifiers, not UI copy.
export function describeSubagentActivity(info: SubagentInfo): string | undefined {
  const last = lastActiveToolCall(info.toolCalls);
  if (!last) return undefined;
  const target = toolTarget(last);
  const verb = TOOL_VERBS[last.name] ?? last.name;
  return target ? `${verb} ${target}` : verb;
}

export function subagentToActivityItem(
  tabId: string,
  conversationId: string | null,
  info: SubagentInfo,
): BackgroundActivityItem {
  const activity = describeSubagentActivity(info);
  return {
    id: info.id,
    source: 'subagent',
    title: info.description,
    state: 'running',
    labelKey: 'workOrderActivity.status.running',
    actionHintKey: 'workOrderActivity.action.open',
    ...(activity ? { activity } : {}),
    ...(typeof info.startedAt === 'number' ? { startedAt: info.startedAt } : {}),
    tabId,
    conversationId,
  };
}

const TOOL_VERBS: Record<string, string> = {
  Read: 'Reading', Edit: 'Editing', Write: 'Writing', MultiEdit: 'Editing',
  Bash: 'Running', Grep: 'Searching', Glob: 'Searching', Task: 'Delegating',
  WebFetch: 'Fetching', WebSearch: 'Searching',
};

function lastActiveToolCall(toolCalls: ToolCallInfo[]): ToolCallInfo | undefined {
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    if (toolCalls[i].status === 'running') return toolCalls[i];
  }
  return toolCalls[toolCalls.length - 1];
}

function toolTarget(tool: ToolCallInfo): string | undefined {
  const input = tool.input ?? {};
  const filePath = input.file_path ?? input.path;
  if (typeof filePath === 'string' && filePath.length > 0) return basename(filePath);
  if (typeof input.pattern === 'string') return input.pattern;
  if (typeof input.command === 'string') return truncate(input.command, 40);
  return undefined;
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --selectProjects unit tests/unit/core/types/backgroundActivity.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/types/backgroundActivity.ts tests/unit/core/types/backgroundActivity.test.ts
git commit -m "feat: background activity types and pure helpers"
```

---

## Task 2: `subagent:activity-changed` event + emit wiring

**Files:**
- Modify: `src/features/chat/events.ts`
- Modify: `src/features/chat/tabs/tabControllerSetup.ts:132-143`
- Test: `tests/unit/features/chat/tabs/subagentActivityEmit.test.ts`

- [ ] **Step 1: Add the event to `ChatEventMap`**

In `src/features/chat/events.ts`, add the import and member:

```ts
import type { SubagentInfo } from '../../core/types';
// ...inside interface ChatEventMap:
  /**
   * Emitted on every subagent state transition for a tab, so the background
   * activity center can aggregate live subagents across all open tabs without
   * coupling SubagentManager to the event bus.
   */
  'subagent:activity-changed': {
    tabId: string;
    conversationId: string | null;
    subagent: SubagentInfo;
  };
```

- [ ] **Step 2: Write the failing test**

```ts
import { EventBus } from '@/core/events/EventBus';
import type { SpecoratorEventMap } from '@/app/events/specoratorEvents';
import { emitSubagentActivity } from '@/features/chat/tabs/tabControllerSetup';
import type { SubagentInfo } from '@/core/types';

describe('emitSubagentActivity', () => {
  it('emits subagent:activity-changed with tab + conversation context', () => {
    const events = new EventBus<SpecoratorEventMap>();
    const received: unknown[] = [];
    events.on('subagent:activity-changed', (p) => received.push(p));
    const info = { id: 'a1', description: 'x', isExpanded: false, status: 'running', toolCalls: [] } as unknown as SubagentInfo;

    emitSubagentActivity({ events } as never, 'tab-1', 'conv-1', info);

    expect(received).toEqual([{ tabId: 'tab-1', conversationId: 'conv-1', subagent: info }]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/tabs/subagentActivityEmit.test.ts`
Expected: FAIL — `emitSubagentActivity` is not exported.

- [ ] **Step 4: Implement the emitter and call it from the existing callback**

In `src/features/chat/tabs/tabControllerSetup.ts`, add the helper near the top-level exports:

```ts
import type SpecoratorPlugin from '../../../main';
import type { SubagentInfo } from '../../../core/types';

/** Publishes a subagent transition onto the plugin event bus (see ChatEventMap). */
export function emitSubagentActivity(
  plugin: Pick<SpecoratorPlugin, 'events'>,
  tabId: string,
  conversationId: string | null,
  subagent: SubagentInfo,
): void {
  plugin.events.emit('subagent:activity-changed', { tabId, conversationId, subagent });
}
```

Then in `buildTabStreamController`, augment the existing `setCallback` body (the block at ~132) so it emits *before* the existing logic:

```ts
  services.subagentManager.setCallback(
    (subagent) => {
      emitSubagentActivity(plugin, tab.id, tab.conversationId, subagent);

      tab.controllers.streamController?.onAsyncSubagentStateChange(subagent);

      if (!tab.state.isStreaming && tab.state.currentConversationId) {
        void tab.controllers.conversationController?.save(false).catch(() => {});
      }
    }
  );
```

(`buildTabStreamController` already receives `plugin` and `tab`. Confirm `plugin` is in scope; the function signature is `(tab: TabData, plugin: SpecoratorPlugin)`.)

- [ ] **Step 5: Run test + typecheck**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/tabs/subagentActivityEmit.test.ts && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/chat/events.ts src/features/chat/tabs/tabControllerSetup.ts tests/unit/features/chat/tabs/subagentActivityEmit.test.ts
git commit -m "feat: emit subagent:activity-changed on subagent transitions"
```

---

## Task 3: `SubagentActivityCollector`

Aggregates live subagents across all tabs. Active items only; terminal transitions evict (the orphan path at `tabLifecycle.ts:200` / `ConversationController` 187,308 fires terminal transitions on tab close + session switch, so eviction is automatic).

**Files:**
- Create: `src/features/chat/activity/SubagentActivityCollector.ts`
- Test: `tests/unit/features/chat/activity/SubagentActivityCollector.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { EventBus } from '@/core/events/EventBus';
import type { SpecoratorEventMap } from '@/app/events/specoratorEvents';
import { SubagentActivityCollector } from '@/features/chat/activity/SubagentActivityCollector';
import type { SubagentInfo } from '@/core/types';

function info(id: string, asyncStatus: SubagentInfo['asyncStatus'], status: SubagentInfo['status'] = 'running'): SubagentInfo {
  return { id, description: `desc ${id}`, isExpanded: false, status, asyncStatus, toolCalls: [] } as unknown as SubagentInfo;
}

describe('SubagentActivityCollector', () => {
  function setup() {
    const events = new EventBus<SpecoratorEventMap>();
    const collector = new SubagentActivityCollector({ events } as never);
    collector.start();
    return { events, collector };
  }

  it('tracks running subagents across multiple tabs', () => {
    const { events, collector } = setup();
    events.emit('subagent:activity-changed', { tabId: 't1', conversationId: 'c1', subagent: info('a', 'running') });
    events.emit('subagent:activity-changed', { tabId: 't2', conversationId: 'c2', subagent: info('b', 'pending') });
    expect(collector.getItems().map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(collector.getItems().every((i) => i.source === 'subagent')).toBe(true);
  });

  it('evicts a subagent when it reaches a terminal state', () => {
    const { events, collector } = setup();
    events.emit('subagent:activity-changed', { tabId: 't1', conversationId: 'c1', subagent: info('a', 'running') });
    events.emit('subagent:activity-changed', { tabId: 't1', conversationId: 'c1', subagent: info('a', 'completed', 'completed') });
    expect(collector.getItems()).toHaveLength(0);
  });

  it('notifies subscribers on every change', () => {
    const { events, collector } = setup();
    const seen: number[] = [];
    collector.subscribe((items) => seen.push(items.length));
    events.emit('subagent:activity-changed', { tabId: 't1', conversationId: 'c1', subagent: info('a', 'running') });
    events.emit('subagent:activity-changed', { tabId: 't1', conversationId: 'c1', subagent: info('a', 'error', 'error') });
    expect(seen).toEqual([0, 1, 0]); // initial replay, add, evict
  });

  it('stops tracking after dispose', () => {
    const { events, collector } = setup();
    collector.dispose();
    events.emit('subagent:activity-changed', { tabId: 't1', conversationId: 'c1', subagent: info('a', 'running') });
    expect(collector.getItems()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/activity/SubagentActivityCollector.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/features/chat/activity/SubagentActivityCollector.ts
import type { BackgroundActivityItem } from '../../../core/types/backgroundActivity';
import { subagentToActivityItem } from '../../../core/types/backgroundActivity';
import type { SubagentInfo } from '../../../core/types';
import type SpecoratorPlugin from '../../../main';

type ChangeListener = (items: readonly BackgroundActivityItem[]) => void;

const TERMINAL: ReadonlySet<string> = new Set(['completed', 'error', 'orphaned']);

export class SubagentActivityCollector {
  private readonly items = new Map<string, BackgroundActivityItem>();
  private readonly listeners = new Set<ChangeListener>();
  private disposers: Array<() => void> = [];

  constructor(private readonly plugin: Pick<SpecoratorPlugin, 'events'>) {}

  start(): void {
    this.disposers.push(
      this.plugin.events.on('subagent:activity-changed', ({ tabId, conversationId, subagent }) =>
        this.apply(tabId, conversationId, subagent),
      ),
    );
  }

  getItems(): readonly BackgroundActivityItem[] {
    return [...this.items.values()];
  }

  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.getItems());
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.items.clear();
    this.listeners.clear();
  }

  private apply(tabId: string, conversationId: string | null, subagent: SubagentInfo): void {
    const terminal = TERMINAL.has(subagent.asyncStatus ?? '') || subagent.status !== 'running';
    if (terminal) {
      if (!this.items.delete(subagent.id)) return; // nothing changed
    } else {
      this.items.set(subagent.id, subagentToActivityItem(tabId, conversationId, subagent));
    }
    this.publish();
  }

  private publish(): void {
    const snapshot = this.getItems();
    for (const listener of [...this.listeners]) listener(snapshot);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/activity/SubagentActivityCollector.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/activity/SubagentActivityCollector.ts tests/unit/features/chat/activity/SubagentActivityCollector.test.ts
git commit -m "feat: SubagentActivityCollector aggregates live subagents across tabs"
```

---

## Task 4: `BackgroundActivityCenter` (merge + work-order live activity + routing)

**Files:**
- Create: `src/features/chat/activity/BackgroundActivityCenter.ts`
- Test: `tests/unit/features/chat/activity/BackgroundActivityCenter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { EventBus } from '@/core/events/EventBus';
import type { SpecoratorEventMap } from '@/app/events/specoratorEvents';
import { BackgroundActivityCenter } from '@/features/chat/activity/BackgroundActivityCenter';
import { SubagentActivityCollector } from '@/features/chat/activity/SubagentActivityCollector';
import type { WorkOrderActivitySummary } from '@/core/types/workOrderActivity';
import { EMPTY_WORK_ORDER_ACTIVITY_SUMMARY } from '@/core/types/workOrderActivity';
import type { SubagentInfo } from '@/core/types';

function fakeWorkOrderProvider(initial: WorkOrderActivitySummary) {
  let summary = initial;
  const subs = new Set<(s: WorkOrderActivitySummary) => void>();
  return {
    handle: {
      getSummary: () => summary,
      subscribe: (cb: (s: WorkOrderActivitySummary) => void) => { subs.add(cb); cb(summary); return () => subs.delete(cb); },
      openItem: jest.fn(async () => {}),
      closeTab: jest.fn(async () => {}),
      dispose: () => {},
    },
    push: (s: WorkOrderActivitySummary) => { summary = s; for (const cb of subs) cb(s); },
  };
}

describe('BackgroundActivityCenter', () => {
  it('merges work-order and subagent items and recomputes counts', () => {
    const events = new EventBus<SpecoratorEventMap>();
    const collector = new SubagentActivityCollector({ events } as never);
    collector.start();
    const wo = fakeWorkOrderProvider({
      ...EMPTY_WORK_ORDER_ACTIVITY_SUMMARY,
      items: [{ id: 'wo1', path: 'p', title: 'WO One', status: 'needs_input',
        labelKey: 'workOrderActivity.status.needsInput', actionHintKey: 'workOrderActivity.action.reply', sidepanelTabId: 't9' }],
      runningCount: 0, attentionCount: 1,
    });
    const center = new BackgroundActivityCenter({ events, getAllViews: () => [] } as never, wo.handle as never, collector);
    center.start();

    events.emit('subagent:activity-changed', {
      tabId: 't1', conversationId: 'c1',
      subagent: { id: 'a1', description: 'Review Task 6', isExpanded: false, status: 'running', asyncStatus: 'running', toolCalls: [] } as unknown as SubagentInfo,
    });

    const s = center.getSummary();
    expect(s.items.map((i) => i.id).sort()).toEqual(['a1', 'wo1']);
    expect(s.runningCount).toBe(1);     // a1
    expect(s.attentionCount).toBe(1);   // wo1 needs_input
  });

  it('attaches the latest task:progress step as a work-order live activity line', () => {
    const events = new EventBus<SpecoratorEventMap>();
    const collector = new SubagentActivityCollector({ events } as never);
    collector.start();
    const wo = fakeWorkOrderProvider({
      ...EMPTY_WORK_ORDER_ACTIVITY_SUMMARY,
      items: [{ id: 'wo1', path: 'p', title: 'WO One', status: 'running',
        labelKey: 'workOrderActivity.status.running', actionHintKey: 'workOrderActivity.action.open', sidepanelTabId: 't9' }],
      runningCount: 1, attentionCount: 0,
    });
    const center = new BackgroundActivityCenter({ events, getAllViews: () => [] } as never, wo.handle as never, collector);
    center.start();

    events.emit('task:progress', { taskId: 'wo1', path: 'p', step: 'Running test suite' });

    expect(center.getSummary().items.find((i) => i.id === 'wo1')?.activity).toBe('Running test suite');
  });

  it('routes openItem to the work-order provider for work-order items', async () => {
    const events = new EventBus<SpecoratorEventMap>();
    const collector = new SubagentActivityCollector({ events } as never);
    collector.start();
    const wo = fakeWorkOrderProvider({
      ...EMPTY_WORK_ORDER_ACTIVITY_SUMMARY,
      items: [{ id: 'wo1', path: 'p', title: 'WO One', status: 'running',
        labelKey: 'workOrderActivity.status.running', actionHintKey: 'workOrderActivity.action.open', sidepanelTabId: 't9' }],
      runningCount: 1, attentionCount: 0,
    });
    const center = new BackgroundActivityCenter({ events, getAllViews: () => [] } as never, wo.handle as never, collector);
    center.start();
    await center.openItem('wo1');
    expect(wo.handle.openItem).toHaveBeenCalledWith('wo1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/activity/BackgroundActivityCenter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/features/chat/activity/BackgroundActivityCenter.ts
import type {
  BackgroundActivityItem,
  BackgroundActivitySummary,
} from '../../../core/types/backgroundActivity';
import { EMPTY_BACKGROUND_ACTIVITY_SUMMARY, mapWorkOrderItem } from '../../../core/types/backgroundActivity';
import type { WorkOrderActivityProvider } from '../../../core/types/workOrderActivity';
import { revealWorkspaceLeaf } from '../../../utils/obsidianCompat';
import type SpecoratorPlugin from '../../../main';
import type { SubagentActivityCollector } from './SubagentActivityCollector';

type SummaryListener = (summary: BackgroundActivitySummary) => void;

export class BackgroundActivityCenter {
  private readonly listeners = new Set<SummaryListener>();
  private readonly workOrderActivityLine = new Map<string, string>();
  private summary: BackgroundActivitySummary = EMPTY_BACKGROUND_ACTIVITY_SUMMARY;
  private disposers: Array<() => void> = [];

  constructor(
    private readonly plugin: SpecoratorPlugin,
    private readonly workOrders: WorkOrderActivityProvider,
    private readonly subagents: SubagentActivityCollector,
  ) {}

  start(): void {
    this.disposers.push(this.workOrders.subscribe(() => this.rebuild()));
    this.disposers.push(this.subagents.subscribe(() => this.rebuild()));
    this.disposers.push(this.plugin.events.on('task:progress', ({ taskId, step }) => {
      this.workOrderActivityLine.set(taskId, step);
      this.rebuild();
    }));
    this.disposers.push(this.plugin.events.on('task:ledger-appended', ({ taskId, entry }) => {
      if (entry.message) { this.workOrderActivityLine.set(taskId, entry.message); this.rebuild(); }
    }));
    this.disposers.push(this.plugin.events.on('task:run-finished', ({ taskId }) => {
      this.workOrderActivityLine.delete(taskId);
      this.rebuild();
    }));
    this.rebuild();
  }

  getSummary(): BackgroundActivitySummary {
    return this.summary;
  }

  subscribe(listener: SummaryListener): () => void {
    this.listeners.add(listener);
    listener(this.summary);
    return () => this.listeners.delete(listener);
  }

  async openItem(id: string): Promise<void> {
    const item = this.summary.items.find((i) => i.id === id);
    if (!item) return;
    if (item.source === 'work-order') { await this.workOrders.openItem(id); return; }
    await this.revealSubagent(item);
  }

  closeTab(tabId: string): Promise<void> {
    return this.workOrders.closeTab(tabId);
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.listeners.clear();
    this.workOrderActivityLine.clear();
  }

  private rebuild(): void {
    const wo = this.workOrders.getSummary();
    const woItems = wo.items.map((i) => mapWorkOrderItem(i, this.workOrderActivityLine.get(i.id)));
    const items: BackgroundActivityItem[] = [...woItems, ...this.subagents.getItems()];
    this.summary = {
      items,
      runningCount: items.filter((i) => i.state === 'running').length,
      attentionCount: items.filter((i) => i.state === 'needs_input' || i.state === 'needs_approval').length,
      closableTabs: wo.closableTabs,
    };
    for (const listener of [...this.listeners]) listener(this.summary);
  }

  private async revealSubagent(item: BackgroundActivityItem): Promise<void> {
    if (!item.tabId) return;
    for (const view of this.plugin.getAllViews()) {
      const manager = view.getTabManager();
      if (!manager?.getTab(item.tabId)) continue;
      await revealWorkspaceLeaf(this.plugin.app.workspace, view.leaf);
      await manager.switchToTab(item.tabId);
      manager.scrollToSubagent?.(item.tabId, item.id); // added in Task 8
      return;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/activity/BackgroundActivityCenter.test.ts`
Expected: PASS (3 tests). `scrollToSubagent?.` is an optional call, so the missing method does not break compilation.

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/activity/BackgroundActivityCenter.ts tests/unit/features/chat/activity/BackgroundActivityCenter.test.ts
git commit -m "feat: BackgroundActivityCenter merges work-order and subagent activity"
```

---

## Task 5: Wire the center into `main.ts`

**Files:**
- Modify: `src/main.ts` (import block ~93; field ~152; init ~176)
- Test: `tests/unit/main.activity.test.ts` (light wiring assertion) — optional if `tests/integration/main.test.ts` already exercises plugin boot; otherwise add the file below.

- [ ] **Step 1: Add the field and import**

In `src/main.ts`:

```ts
// near other imports (~93)
import { SubagentActivityCollector } from './features/chat/activity/SubagentActivityCollector';
import { BackgroundActivityCenter } from './features/chat/activity/BackgroundActivityCenter';

// in the class fields (~152, next to workOrderActivity)
backgroundActivity: BackgroundActivityCenter | null = null;
```

- [ ] **Step 2: Instantiate after `workOrderActivity.start()` (~177)**

```ts
    this.workOrderActivity = new WorkOrderActivityProvider(this);
    this.workOrderActivity.start();

    const subagentActivity = new SubagentActivityCollector(this);
    subagentActivity.start();
    this.backgroundActivity = new BackgroundActivityCenter(this, this.workOrderActivity, subagentActivity);
    this.backgroundActivity.start();
    this.register(() => {
      this.backgroundActivity?.dispose();
      this.backgroundActivity = null;
      subagentActivity.dispose();
    });

    this.register(() => {
      this.workOrderActivity?.dispose();
      this.workOrderActivity = null;
    });
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: clean. (`getAllViews()`, `app`, and `events` already exist on the plugin — used by `WorkOrderActivityProvider`.)

- [ ] **Step 4: Run the existing integration boot test**

Run: `npm run test -- --selectProjects integration tests/integration/main.test.ts`
Expected: PASS (no regressions in plugin load/unload).

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire BackgroundActivityCenter into plugin lifecycle"
```

---

## Task 6: Generalize the header dropdown + repoint `SpecoratorView`

Render both sources, the live `activity` line, and elapsed. Reuse the `workOrderActivity.*` i18n keys via the item's `labelKey`/`actionHintKey` (zero locale churn).

**Files:**
- Create: `src/features/chat/ui/BackgroundActivityDropdown.ts` (port of `WorkOrderActivityDropdown.ts`)
- Modify: `src/features/chat/SpecoratorView.ts` (import ~42; field ~78; mount ~621; subscription)
- Delete: `src/features/chat/ui/WorkOrderActivityDropdown.ts` and its test (replaced)
- Test: `tests/unit/features/chat/ui/BackgroundActivityDropdown.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { createMockEl } from '@test/helpers/mockElement';
import { BackgroundActivityDropdown } from '@/features/chat/ui/BackgroundActivityDropdown';
import type { BackgroundActivitySummary } from '@/core/types/backgroundActivity';

function summary(): BackgroundActivitySummary {
  return {
    items: [
      { id: 'a1', source: 'subagent', title: 'Review Task 6', state: 'running',
        labelKey: 'workOrderActivity.status.running', actionHintKey: 'workOrderActivity.action.open',
        activity: 'Editing MessageRenderer.ts', tabId: 't3' },
      { id: 'wo1', source: 'work-order', title: 'Migrate settings', state: 'needs_input',
        labelKey: 'workOrderActivity.status.needsInput', actionHintKey: 'workOrderActivity.action.reply',
        activity: 'Waiting on answer', tabId: 't9', path: 'p' },
    ],
    runningCount: 1, attentionCount: 1, closableTabs: [],
  };
}

describe('BackgroundActivityDropdown', () => {
  it('renders a row per item with its activity line', () => {
    const host = createMockEl();
    const dd = new BackgroundActivityDropdown(host as never, { summary: summary(), onOpenItem: () => {}, onCloseItem: () => {} });
    (host.querySelector('.specorator-work-order-activity-toggle') as never as HTMLElement).dispatchEvent(new Event('click'));
    const rows = host.querySelectorAll('.specorator-work-order-activity-item');
    expect(rows.length).toBe(2);
    expect(host.querySelectorAll('.specorator-background-activity-line').length).toBe(2);
  });

  it('invokes onOpenItem with the item id when a row is selected', () => {
    const host = createMockEl();
    const opened: string[] = [];
    const dd = new BackgroundActivityDropdown(host as never, { summary: summary(), onOpenItem: (id) => opened.push(id), onCloseItem: () => {} });
    (host.querySelector('.specorator-work-order-activity-toggle') as never as HTMLElement).dispatchEvent(new Event('click'));
    (host.querySelectorAll('.specorator-work-order-activity-item')[0] as never as HTMLElement).dispatchEvent(new Event('click'));
    expect(opened).toEqual(['a1']);
  });
});
```

> If `createMockEl` lacks `dispatchEvent`/`querySelectorAll`, mirror the interaction style already used in the existing `WorkOrderActivityDropdown` test (open the file `tests/unit/features/chat/ui/WorkOrderActivityDropdown.test.ts` and copy its element-driving helper). Keep the assertions above.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/ui/BackgroundActivityDropdown.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the dropdown**

Copy `WorkOrderActivityDropdown.ts` to `BackgroundActivityDropdown.ts`, rename the class, retype to `BackgroundActivitySummary`/`BackgroundActivityItem`, and in `renderMenu`'s item loop add a source icon + the activity line + elapsed. Keep all CSS class names (reuse existing styles) and add one new class `specorator-background-activity-line`:

```ts
import { setIcon } from 'obsidian';
import type { BackgroundActivityItem, BackgroundActivitySummary } from '../../../core/types/backgroundActivity';
import { t } from '../../../i18n/i18n';

export interface BackgroundActivityDropdownProps {
  summary: BackgroundActivitySummary;
  onOpenItem(id: string): void | Promise<void>;
  onCloseItem(tabId: string): void | Promise<void>;
}

// ...class shell identical to WorkOrderActivityDropdown (open/render/toggle/closableTabs),
// but the per-item row in renderMenu becomes:

  private renderItemRow(menu: HTMLElement, item: BackgroundActivityItem): void {
    const row = menu.createDiv({ cls: 'specorator-work-order-activity-item' });
    row.setAttribute('role', 'menuitem');
    row.setAttribute('tabindex', '0');
    row.setAttribute('data-source', item.source);

    const head = row.createDiv({ cls: 'specorator-work-order-activity-head' });
    setIcon(head.createSpan({ cls: 'specorator-background-activity-icon' }), item.source === 'subagent' ? 'bot' : 'wrench');
    head.createSpan({ cls: 'specorator-work-order-activity-title', text: item.title });
    head.createSpan({ cls: 'specorator-work-order-activity-status', text: t(item.labelKey) });

    if (item.activity) {
      row.createSpan({ cls: 'specorator-background-activity-line', text: item.activity });
    }
    row.createSpan({ cls: 'specorator-work-order-activity-action', text: t(item.actionHintKey) });

    const select = () => this.selectItem(item.id);
    row.addEventListener('click', select);
    row.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      select();
    });
  }
```

The toggle count/label logic and the `closableTabs` loop carry over unchanged (they already read `summary.items.length`, `summary.attentionCount`, `summary.closableTabs`).

- [ ] **Step 4: Repoint `SpecoratorView`**

- Import (`~42`): replace `WorkOrderActivityDropdown` with `BackgroundActivityDropdown`.
- Field (`~78`): retype to `BackgroundActivityDropdown | null`.
- `mountWorkOrderActivityDropdown` (`~621`): read from `this.plugin.backgroundActivity` instead of `this.plugin.workOrderActivity`, and in the subscription callback also refresh the tab bar so badges recompute:

```ts
  private mountWorkOrderActivityDropdown(): void {
    if (!this.workOrderActivitySlotEl || !this.plugin.backgroundActivity) return;
    this.disposeWorkOrderActivitySubscription?.();
    this.workOrderActivityDropdown?.destroy();
    const center = this.plugin.backgroundActivity;
    this.workOrderActivityDropdown = new BackgroundActivityDropdown(this.workOrderActivitySlotEl, {
      summary: center.getSummary(),
      onOpenItem: (id) => center.openItem(id),
      onCloseItem: (tabId) => center.closeTab(tabId),
    });
    this.disposeWorkOrderActivitySubscription = center.subscribe((summary) => {
      this.workOrderActivityDropdown?.update(summary);
      this.updateTabBar(); // recompute false-idle badge state (Task 7)
    });
  }
```

- [ ] **Step 5: Delete the obsolete dropdown + its test**

```bash
git rm src/features/chat/ui/WorkOrderActivityDropdown.ts tests/unit/features/chat/ui/WorkOrderActivityDropdown.test.ts
```

(If any other file imports `WorkOrderActivityDropdown`, repoint it — `grep -rn WorkOrderActivityDropdown src` should return only `SpecoratorView` before this task.)

- [ ] **Step 6: Run tests + typecheck + lint**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/ui/BackgroundActivityDropdown.test.ts && npm run typecheck && npm run lint`
Expected: PASS; no dangling references to the removed file.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: unified background activity dropdown rendering both sources"
```

---

## Task 7: False-idle tab-badge fix

**Files:**
- Modify: `src/features/chat/tabs/TabManager.ts:490-492`
- Test: `tests/unit/features/chat/tabs/tabBadgeBackgroundActivity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { TabManager } from '@/features/chat/tabs/TabManager';

describe('TabManager.getTabBarItems — background-aware working state', () => {
  it('reports a tab as working when subagents run even if the foreground stream ended', () => {
    const manager = Object.create(TabManager.prototype) as TabManager;
    const tab = {
      id: 't1', kind: 'chat', conversationId: null,
      state: { isStreaming: false, needsAttention: false },
      services: { subagentManager: { hasRunningSubagents: () => true } },
    };
    // minimal scaffolding the method reads:
    (manager as never as { tabs: Map<string, unknown> }).tabs = new Map([['t1', tab]]);
    (manager as never as { activeTabId: string }).activeTabId = 't1';
    (manager as never as { plugin: unknown }).plugin = { getConversationSync: () => null };
    (manager as never as { getOrderedTabs: () => unknown[] }).getOrderedTabs = () => [tab];

    const [item] = manager.getTabBarItems();
    expect(item.isStreaming).toBe(true);
    expect(item.canClose).toBe(false);
  });
});
```

> If `getTabTitle`/`getTabProviderId` (module-scope imports in `TabManager`) throw on the bare stub, extend the `tab` stub with the fields they read (`providerId`, `draftModel`, `pinnedModel`) — inspect `tabShared.ts` for the exact reads. Keep the two assertions.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/tabs/tabBadgeBackgroundActivity.test.ts`
Expected: FAIL — `isStreaming` is `false`.

- [ ] **Step 3: Implement the derivation**

In `TabManager.getTabBarItems()` (line ~484-497), introduce a `working` local and use it for both `isStreaming` and `canClose`:

```ts
    for (const tab of this.getOrderedTabs()) {
      if (tab.kind === 'work-order') continue;
      const working = tab.state.isStreaming || tab.services.subagentManager.hasRunningSubagents();
      items.push({
        id: tab.id,
        index: index++,
        title: getTabTitle(tab, this.plugin),
        providerId: getTabProviderId(tab, this.plugin),
        isActive: tab.id === this.activeTabId,
        isStreaming: working,
        needsAttention: tab.state.needsAttention,
        canClose: this.tabs.size > 1 || !working,
        kind: tab.kind,
        isAgentBound: Boolean(
          tab.conversationId && this.plugin.getConversationSync(tab.conversationId)?.boundAgentId,
        ),
      });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/tabs/tabBadgeBackgroundActivity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/tabs/TabManager.ts tests/unit/features/chat/tabs/tabBadgeBackgroundActivity.test.ts
git commit -m "fix: keep tab badge working while it waits on background subagents"
```

---

## Task 8: Subagent block anchor + scroll-to navigation

**Files:**
- Modify: `src/features/chat/rendering/SubagentRenderer.ts` (block creation)
- Modify: `src/features/chat/tabs/TabManager.ts` (add `scrollToSubagent`)
- Test: `tests/unit/features/chat/tabs/scrollToSubagent.test.ts`

- [ ] **Step 1: Add the anchor in `SubagentRenderer`**

Find where the async subagent wrapper element is created (`createAsyncSubagentBlock`, and the sync `createSubagentBlock`). On the top-level `wrapperEl`, set the id attribute:

```ts
wrapperEl.setAttribute('data-subagent-id', taskToolId);
```

(Use the same `taskToolId` that becomes `SubagentInfo.id` — confirm by reading `SubagentManager.createAsyncTask`, where `info.id = taskToolId`.)

- [ ] **Step 2: Write the failing test for `scrollToSubagent`**

```ts
import { TabManager } from '@/features/chat/tabs/TabManager';

describe('TabManager.scrollToSubagent', () => {
  it('scrolls the matching subagent block into view', () => {
    let scrolled = false;
    const blockEl = { scrollIntoView: () => { scrolled = true; } };
    const contentEl = { querySelector: (sel: string) => (sel === '[data-subagent-id="a1"]' ? blockEl : null) };
    const tab = { id: 't1', dom: { contentEl } };
    const manager = Object.create(TabManager.prototype) as TabManager;
    (manager as never as { tabs: Map<string, unknown> }).tabs = new Map([['t1', tab]]);

    manager.scrollToSubagent('t1', 'a1');
    expect(scrolled).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/tabs/scrollToSubagent.test.ts`
Expected: FAIL — `scrollToSubagent` is not a function.

- [ ] **Step 4: Implement `scrollToSubagent`**

In `TabManager`:

```ts
  scrollToSubagent(tabId: string, subagentId: string): void {
    const tab = this.tabs.get(tabId);
    const el = tab?.dom.contentEl.querySelector<HTMLElement>(`[data-subagent-id="${CSS.escape(subagentId)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
```

> If `CSS.escape` is unavailable in the jest DOM, the subagent ids are tool-use ids (`[A-Za-z0-9_-]`), so a guarded plain interpolation is acceptable; keep `CSS.escape` for production. If the test environment lacks `CSS`, stub it in the test or drop to plain interpolation.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/tabs/scrollToSubagent.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/chat/rendering/SubagentRenderer.ts src/features/chat/tabs/TabManager.ts tests/unit/features/chat/tabs/scrollToSubagent.test.ts
git commit -m "feat: anchor subagent blocks and scroll-to navigation from the activity center"
```

---

## Task 9: Informative completion line

Replace the bare `(background task completed)` placeholder with the most recently finished subagent's name + one-line result. Heuristic: the last subagent to reach a terminal state in this tab (documented as a heuristic in the spec).

**Files:**
- Modify: `src/features/chat/services/SubagentManager.ts` (track last terminal)
- Modify: `src/features/chat/tabs/tabRuntimeHost.ts:160-162`
- Test: `tests/unit/features/chat/services/subagentLastTerminal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { SubagentManager } from '@/features/chat/services/SubagentManager';

describe('SubagentManager.getLastTerminalSubagent', () => {
  it('returns the most recently completed async subagent', () => {
    const mgr = new SubagentManager({} as never, () => {});
    // Drive an async subagent to completion through the public API:
    // (the engineer wires the minimal sequence — createAsyncTask via handleTaskToolUse
    //  with a content element, then handleTaskToolResult to obtain agent_id, then
    //  handleAgentOutputToolResult/handleAsyncSubagentResult to a 'completed' state.)
    const completed = mgr.handleAsyncSubagentResult('agent-x', 'completed', 'Found 2 issues');
    // handleAsyncSubagentResult returns undefined unless the agent is active; seed it first.
    expect(completed).toBeUndefined(); // sanity: no active agent yet
    expect(mgr.getLastTerminalSubagent()).toBeUndefined();
  });
});
```

> The full happy-path completion sequence is involved; the failing-test bar here is just that `getLastTerminalSubagent()` exists and returns `undefined` before any terminal. Add a richer integration assertion in the existing `tests/unit/features/chat/services/SubagentManager.test.ts` (which already exercises the async lifecycle) — append a case that, after its existing "completes async subagent" flow, asserts `getLastTerminalSubagent()?.description` matches the finished subagent.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/services/subagentLastTerminal.test.ts`
Expected: FAIL — `getLastTerminalSubagent` is not a function.

- [ ] **Step 3: Implement tracking in `SubagentManager`**

Add a field and setter on every terminal transition, plus the getter. In `handleAgentOutputToolResult`, `handleAsyncSubagentResult`, and `transitionToError` / `markOrphaned`, after the subagent is marked terminal, record it:

```ts
  private lastTerminalSubagent: SubagentInfo | null = null;

  public getLastTerminalSubagent(): SubagentInfo | undefined {
    return this.lastTerminalSubagent ?? undefined;
  }

  private recordTerminal(subagent: SubagentInfo): void {
    if (subagent.asyncStatus === 'completed' || subagent.asyncStatus === 'error') {
      this.lastTerminalSubagent = subagent;
    }
  }
```

Call `this.recordTerminal(subagent)` immediately before each terminal `this.onStateChange(subagent)` in those methods. Reset it in `clear()`.

- [ ] **Step 4: Use it in `tabRuntimeHost.renderAutoTriggeredTurn`**

Replace the placeholder block (~159-163):

```ts
    if (hasVisibleContent && !hasVisibleAutoTurnMessageContent(assistantMsg)) {
      const placeholder = formatBackgroundCompletion(tab.services.subagentManager.getLastTerminalSubagent());
      assistantMsg.content = placeholder;
      await tab.controllers.streamController?.appendText(placeholder);
    }
```

Add the formatter near the bottom of `tabRuntimeHost.ts`:

```ts
function formatBackgroundCompletion(last: SubagentInfo | undefined): string {
  if (!last) return '(background task completed)';
  const name = last.description?.trim() || 'Background task';
  const summary = oneLine(last.result);
  if (last.asyncStatus === 'error' || last.status === 'error') {
    return summary ? `✗ ${name} failed — ${summary}` : `✗ ${name} failed`;
  }
  return summary ? `✓ ${name} — ${summary}` : `✓ ${name} completed`;
}

function oneLine(result: string | undefined): string {
  if (!result) return '';
  const firstLine = result.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  return firstLine.length > 120 ? `${firstLine.slice(0, 120)}…` : firstLine;
}
```

Add `import type { SubagentInfo } from '../../../core/types';` to `tabRuntimeHost.ts`.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/services && npm run typecheck`
Expected: PASS (new getter test + existing SubagentManager suite green).

- [ ] **Step 6: Commit**

```bash
git add src/features/chat/services/SubagentManager.ts src/features/chat/tabs/tabRuntimeHost.ts tests/unit/features/chat/services/subagentLastTerminal.test.ts
git commit -m "feat: informative background-task completion line"
```

---

## Task 10: Performance guard

Summary build must stay O(active items), independent of how many terminal transitions have flowed through.

**Files:**
- Create: `tests/perf/backgroundActivity.perf.test.ts`

- [ ] **Step 1: Write the perf spec**

```ts
/**
 * Background activity center scaling guard.
 *
 * The center's published summary tracks the number of ACTIVE background items
 * (running subagents + active work orders), never the total number of state
 * transitions that have ever flowed through. A conversation that spawns and
 * finishes thousands of subagents must leave the center holding only what is
 * still live.
 */
import { EventBus } from '@/core/events/EventBus';
import type { SpecoratorEventMap } from '@/app/events/specoratorEvents';
import { SubagentActivityCollector } from '@/features/chat/activity/SubagentActivityCollector';
import type { SubagentInfo } from '@/core/types';

import { reportMetrics } from './perfReport';

function sub(id: string, asyncStatus: SubagentInfo['asyncStatus'], status: SubagentInfo['status'] = 'running'): SubagentInfo {
  return { id, description: id, isExpanded: false, status, asyncStatus, toolCalls: [] } as unknown as SubagentInfo;
}

describe('Background activity scaling', () => {
  it('retains only active subagents regardless of churn volume', () => {
    const churns = [10, 100, 1000];
    const metrics = [];
    for (const n of churns) {
      const events = new EventBus<SpecoratorEventMap>();
      const collector = new SubagentActivityCollector({ events } as never);
      collector.start();
      // Spawn then immediately finish n subagents; keep exactly 3 alive at the end.
      for (let i = 0; i < n; i++) {
        events.emit('subagent:activity-changed', { tabId: 't', conversationId: 'c', subagent: sub(`a${i}`, 'running') });
        events.emit('subagent:activity-changed', { tabId: 't', conversationId: 'c', subagent: sub(`a${i}`, 'completed', 'completed') });
      }
      events.emit('subagent:activity-changed', { tabId: 't', conversationId: 'c', subagent: sub('live1', 'running') });
      events.emit('subagent:activity-changed', { tabId: 't', conversationId: 'c', subagent: sub('live2', 'pending') });
      events.emit('subagent:activity-changed', { tabId: 't', conversationId: 'c', subagent: sub('live3', 'running') });

      const held = collector.getItems().length;
      metrics.push({ n, values: { held } });
      // The retained set is the live count (3), not a function of churn.
      expect(held).toBe(3);
    }
    reportMetrics('Background activity — retained items vs churn volume', metrics);
  });
});
```

- [ ] **Step 2: Run the perf suite**

Run: `npm run test:perf -- backgroundActivity`
Expected: PASS; metrics table printed; `held` is `3` for every churn size.

- [ ] **Step 3: Commit**

```bash
git add tests/perf/backgroundActivity.perf.test.ts
git commit -m "test: background activity scaling guard"
```

---

## Final verification

- [ ] Run the full gate:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

Expected: all green. (Per CLAUDE.md the standard post-edit gate.)

- [ ] Manual smoke (optional, in Obsidian): dispatch a `run_in_background` subagent from a chat tab; confirm (1) the tab badge stays in its working state after the foreground turn ends, (2) the header activity center shows the subagent with a live "doing X" line, (3) switching to another tab still shows the count, (4) selecting the row returns to the owning tab and scrolls to the block, (5) on completion the inline line reads `✓ <name> — <result>`.

---

## Self-review notes (author)

- **Spec coverage:** Data model → T1; `subagent:activity-changed` event → T2; `SubagentActivityCollector` → T3; `BackgroundActivityCenter` + work-order live activity → T4; lifecycle wiring → T5; unified dropdown + live line + elapsed + cross-tab refresh → T6; false-idle badge (reuse working style, D5) → T7; scroll-to navigation (approved new plumbing) → T8; informative completion (D6) → T9; perf guard → T10. Out-of-scope (provider-native `/bg`, Approach B, board-card streaming) intentionally excluded.
- **Refinement vs spec:** terminal items drop off the center (no linger timer); completion is surfaced inline instead. Update spec Decision 6 wording during T9.
- **Type consistency:** `BackgroundActivityItem` shape (incl. `labelKey`/`actionHintKey`/`source`/`state`/`activity`/`tabId`) is identical across T1, T3, T4, T6. `scrollToSubagent(tabId, subagentId)` matches between T4 (optional call) and T8 (definition). `getLastTerminalSubagent()` matches between T9 implementation and use.
- **Elapsed rendering:** the dropdown receives `startedAt`; rendering "running 2m" is a display concern inside `BackgroundActivityDropdown` — compute `Date.now() - startedAt` at render time (allowed in `src/`). If you add it, extend the T6 test with an elapsed assertion using an injected/frozen value, or assert the element exists.
