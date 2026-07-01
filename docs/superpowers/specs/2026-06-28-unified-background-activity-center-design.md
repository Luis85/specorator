---
title: Unified background activity center
date: 2026-06-28
status: draft
scope: chat/tabs, chat/ui, chat/services, core/types, core/events, tasks/ui
source_idea: "Chat tab shows no progress while waiting on dispatched background work"
related:
  - "[[docs/issues/agent-board-background-runs]]"
  - "[[docs/superpowers/specs/2026-06-07-work-order-activity-dropdown-design]]"
  - "[[docs/superpowers/specs/2026-06-22-chat-header-and-tab-agent-indicators-design]]"
---

# Unified background activity center

## Problem

When a conversation dispatches `run_in_background` subagents, the chat tab gives no signal that it is still working. The tab is genuinely waiting on that background work (the runtime fires auto-turns when each subagent completes), yet:

1. **The tab badge goes false-idle.** `InputController.completeFinishedTurn` sets `state.isStreaming = false` when the foreground turn ends, even when `SubagentManager.hasRunningSubagents()` is still `true`. The badge drops from its "working" state to "idle" while the tab is still awaiting results.
2. **There is no count or list of in-flight background work.** Subagents are not work orders, so they never appear in the existing chat-header Work Orders dropdown (`WorkOrderActivityProvider`). Nothing surfaces "what is running, how far along, what's left."
3. **Completion is uninformative.** A finished background subagent injects a bare `(background task completed)` line via `renderAutoTriggeredTurn` — no task name, no result, no sense of what just finished or what remains.
4. **No cross-tab awareness.** When the user is on tab 3 and tab 2's subagents are still running, there is no indication anywhere.

Work-order runs already have decent observability (a `task:*` event bus, a 30s heartbeat + `ledger.jsonl` sidecar, live heartbeat strips on cards, and the Work Orders header dropdown). In-conversation subagents have almost none of it. The two should converge into one surface.

## Goal

A single **background activity center** that:

- Spans both in-conversation subagents and Agent Board work-order runs.
- Shows **live activity** per item ("what is it doing right now"), updating as work proceeds.
- Always reflects the tab honestly working while it waits on background subagents.
- Reflects background work owned by *any* tab, not just the active one.

## Decisions

| # | Decision | Chosen | Rejected |
|---|----------|--------|----------|
| 1 | Scope | In-conversation subagents **and** Agent Board work-order runs | Subagents only; everything incl. provider-native `/bg` now |
| 2 | Unification model | One unified activity center (extend the existing header dropdown + activity-provider machinery) | Keep subagents and runs in separate surfaces; build a brand-new dedicated panel |
| 3 | Implementation approach | **Approach A — merge at the edges**: reuse `WorkOrderActivityProvider`, add a `SubagentActivityCollector`, merge via a thin plugin-level `BackgroundActivityCenter` | Approach B (single activity bus in `core`, refactor both sources); Approach C (inline-first minimal, dropdown is only an index) |
| 4 | Detail level | **Live activity** — name + state + elapsed + current action, updating live | Glanceable only (state + elapsed); live + mini-progress (subagents have no known total) |
| 5 | Waiting tab badge style | Reuse the existing "working" badge state (no distinct "waiting" style) | A separate steady-dot/pulse style to distinguish waiting from active streaming |
| 6 | Completion treatment | Informative line (`✓ <name> — <result>` / `✗ <name> failed — <reason>`) and the center row flips to a terminal state | Keep the bare `(background task completed)` placeholder |

## Data model

New provider-neutral model in `core/types/backgroundActivity.ts`. The existing `WorkOrderActivityItem` maps in cleanly (`status → state`, add `source: 'work-order'`), so board/work-order code is untouched.

```ts
type BackgroundActivitySource = 'subagent' | 'work-order';

type BackgroundActivityState =
  | 'running'
  | 'needs_input'
  | 'needs_approval'
  | 'completed'
  | 'error';

interface BackgroundActivityItem {
  id: string;                         // subagent id or work-order id
  source: BackgroundActivitySource;
  title: string;                      // subagent description / work-order title
  state: BackgroundActivityState;
  activity?: string;                  // LIVE line: "Editing foo.ts" / latest ledger message
  startedAt?: number;                 // → elapsed
  tabId?: string | null;              // owning chat tab (subagent owner / WO sidepanel tab)
  conversationId?: string | null;
  path?: string | null;              // work-order note path
}

interface BackgroundActivitySummary {
  readonly items: readonly BackgroundActivityItem[];
  readonly runningCount: number;
  readonly attentionCount: number;    // needs_input + needs_approval
  readonly closableTabs: readonly BackgroundActivityClosableTab[]; // work-order only, preserved
}
```

A rendered row reads roughly:

```
🤖 Review Task 6 · running 2m · Editing MessageRenderer.ts
🔧 Migrate settings tab · needs input · waiting on approval
```

## Architecture (Approach A)

```text
                       ┌─────────────────────────────┐
 task:* events  ─────▶ │ WorkOrderActivityProvider   │ ── work-order summary ─┐
                       └─────────────────────────────┘                        │
                                                                              ▼
 subagent:activity-    ┌─────────────────────────────┐         ┌──────────────────────────┐
 changed events ─────▶ │ SubagentActivityCollector   │ ──────▶ │ BackgroundActivityCenter │
 (per tab)             └─────────────────────────────┘ subagent└──────────────────────────┘
                                                        summary           │ merged summary
                                                                          ▼
                                          ┌──────────────────────┐   ┌──────────────────┐
                                          │ BackgroundActivity   │   │ TabManager badge │
                                          │ Dropdown (header)    │   │ derivation       │
                                          └──────────────────────┘   └──────────────────┘
```

### Components

| Component | Layer | Responsibility |
|---|---|---|
| `SubagentActivityCollector` | plugin-level (`features/chat`) | Aggregates live subagents across all open tabs into subagent `BackgroundActivityItem`s. Subscribes to `subagent:activity-changed`. Maintains a per-tab map; drops a tab's entries on tab close. |
| `BackgroundActivityCenter` | plugin-level | Merges `WorkOrderActivityProvider.getSummary()` with the collector's summary into one `BackgroundActivitySummary`. Republishes on either source changing. Owns `openItem(id)` routing. Same `getSummary`/`subscribe`/`dispose` contract as the existing provider. |
| `BackgroundActivityDropdown` | `features/chat/ui` | Generalization of `WorkOrderActivityDropdown` to render both sources — an icon per source, the live `activity` line, and elapsed. Count = total active. Closable-tabs section preserved. |
| Tab-badge derivation | `features/chat/tabs/TabManager` | `getTabBarItems()` working state becomes `isStreaming \|\| subagentManager.hasRunningSubagents()` (same for `canClose`). |

### Event plumbing

`SubagentManager` already invokes a single `onStateChange` callback (consumed by `SubagentStreamCoordinator` via `setCallback`). Rather than disturb that single-owner callback, the tab wiring emits a typed `subagent:activity-changed` event on the plugin `EventBus` alongside the existing callback, keyed by `tabId` / `conversationId`. The collector subscribes to that event. This mirrors the existing `task:*` event pattern and keeps `SubagentManager` free of plugin/event-bus coupling.

New event (in `core/events` typed map):

```ts
'subagent:activity-changed': {
  tabId: string;
  conversationId: string | null;
  subagent: SubagentInfo;   // the changed subagent
}
```

## Live activity sourcing

The "live activity" tier is derived from data that already streams in — no polling.

- **Subagent** — `activity` from the latest entry in `SubagentInfo.toolCalls`, labeled via existing `core/tools/toolIcons` + `toolInput` helpers (e.g. "Editing foo.ts", "Running tests", "Searching"). `state` from `asyncStatus` (`pending`/`running` → running, `completed`/`error`/`orphaned` → terminal). `startedAt` already tracked.
- **Work-order run** — `activity` from the latest `TaskLedgerEntry.message`, available on the existing `task:heartbeat` / ledger stream and `AgentBoardView.liveHeartbeats`.

## Tab badge fix

`TabManager.getTabBarItems()` currently sets `isStreaming: tab.state.isStreaming` directly. Change the working-state input to:

```ts
const working = tab.state.isStreaming || tab.services.subagentManager.hasRunningSubagents();
```

applied to both the badge `isStreaming` flag and `canClose` (a tab waiting on background work should not be casually closeable). A tab-bar refresh must fire when subagent state changes — wire an `onBackgroundActivityChanged` callback into the tab so the badge re-renders on subagent transitions, alongside the existing `onStreamingChanged` / `onAttentionChanged` callbacks. Per Decision 5, the waiting state reuses the existing "working" badge style; no new visual variant.

## Completion & cross-tab behavior

- **Informative completion** — in `renderAutoTriggeredTurn`, replace the `(background task completed)` placeholder with `✓ <description> — <one-line result>` (or `✗ <description> failed — <reason>` on error), drawn from the finished `SubagentInfo`. The center row independently flips to `completed`/`error` and lingers briefly before dropping off the summary.
- **Cross-tab** — because the collector aggregates across all open tabs, the header count/center reflects background work owned by any tab. Selecting a subagent row routes through `BackgroundActivityCenter.openItem` → reveal the owning tab's workspace leaf (`revealWorkspaceLeaf`, as `WorkOrderActivityProvider.openItem` already does) → switch to the tab → scroll to the subagent block.

### New navigation plumbing

Scroll-to-block requires a `subagentId → rendered block element` lookup. The subagent renderer (`MessageSubagentRenderer` / `SubagentRenderer`) gains a stable `data-subagent-id` anchor on each block, and the tab exposes a `scrollToSubagent(id)` helper. (Approved as a small addition.)

## Edge cases

- **Tab close / dispose** — the collector unsubscribes per-tab and drops that tab's items; `BackgroundActivityCenter.dispose` tears down both source subscriptions.
- **Orphaned subagents** — conversation-ended subagents surface as `error`/orphaned, consistent with `SubagentManager.orphanAllActive`. They flip the row to terminal rather than vanishing silently.
- **Out-of-order updates** — reuse the monotonic refresh-generation guard pattern already in `WorkOrderActivityProvider.refresh` for the merged summary.
- **Empty state** — the dropdown self-hides when total entry count is 0 (existing behavior preserved).

## Performance

The aggregator stays O(active items) and is event-driven (no vault/history scan on the subagent side). Add a `backgroundActivity.perf` spec alongside the existing `agentBoard.perf` / `multiTabStreaming.perf` guards: summary-build cost must track active-item count, not conversation length or tab count. The collector's per-tab map and merge must not grow with transcript size.

## Testing (TDD)

Unit (mirrored under `tests/unit/`):

- `SubagentActivityCollector` — per-tab aggregation, terminal-state transitions, tab-close eviction.
- `BackgroundActivityCenter` — merge of both sources, republish on either change, `openItem` routing.
- `BackgroundActivityDropdown` — dual-source rendering, count, live-activity line, closable-tabs section.
- Tab-badge derivation — `isStreaming || hasRunningSubagents` for both `isStreaming` flag and `canClose`.
- Completion-line formatting — success / error / empty-result.

Integration (`tests/integration/`):

- Cross-tab visibility: a subagent running in a background tab appears in the active tab's header center.
- Navigation: selecting a subagent row reveals the owning tab and scrolls to its block.

## Out of scope

- **Provider-native detached background tasks** (Claude `/bg`, Codex Automations) — tracked separately in [[docs/issues/agent-board-background-runs]]. Approach A leaves a clean seam to add such a source to `BackgroundActivityCenter` later.
- **Approach B single activity bus refactor** — deferred; revisit if/when a third source (provider-native `/bg`) lands.
- **Streaming the live run feed into the Agent Board card itself** — separate concern from the chat-header center.
