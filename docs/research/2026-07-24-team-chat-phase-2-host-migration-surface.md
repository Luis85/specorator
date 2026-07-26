---
title: Team Chat Phase 2 — ChatViewHandle host-migration surface map
date: 2026-07-24
status: research
scope: src/core/types/PluginContext.ts, src/main.ts, src/features/chat (SpecoratorView, TabManager), all getAllViews() consumers
relates-to: docs/superpowers/specs/2026-07-24-team-chat-design.md
---

# Team Chat Phase 2 — host-migration surface map

Exact map of the `getAllViews()` / `ChatViewHandle` refactor surface, to drive the
Phase 2 implementation plan. Phase 2's job: make the handle interfaces cover every
consumer and route consumers through them, so a second chat-host view (`TeamChatView`,
Phase 4) can be enumerated by `getAllViews()` and participate in lifecycle + settings +
tasks aggregation. All findings verified against the code at commit `974b28e`.

## Current interfaces (`src/core/types/PluginContext.ts`)

```ts
// :29-35
export interface ChatTabManagerHandle {
  broadcastToAllTabs(fn: (service: ChatRuntime) => Promise<void>): Promise<void>;
  broadcastToProviderTabs(providerIds: ProviderId | ProviderId[], fn: (service: ChatRuntime) => Promise<void>): Promise<void>;
}

// :42-48
export interface ChatViewHandle {
  getTabManager(): ChatTabManagerHandle | null;
  refreshModelSelector(): void;
  invalidateProviderCommandCaches(providerIds?: ProviderId | ProviderId[]): void;
  updateHiddenProviderCommands?(): void;
}

// :136-140
getView(): ChatViewHandle | null;
getAllViews(): ChatViewHandle[];
findConversationAcrossViews(conversationId: string): { view: ChatViewHandle; tabId: string } | null;
```

The callback-shaped methods (`broadcastTo*`) are the **core-safe precedent**: they only
ever expose `ChatRuntime` (a `core/runtime/` type), never a feature-owned type.

## The return-type blocker (`src/main.ts:803-826`)

`SpecoratorPlugin implements PluginContext`, but declares the **concrete** return type:

```ts
getAllViews(): SpecoratorView[] { // NOT ChatViewHandle[]
  return this.app.workspace.getLeavesOfType(VIEW_TYPE_SPECORATOR).map(l => l.view).filter(isSpecoratorView);
}
```

`isSpecoratorView` (`src/features/chat/isSpecoratorView.ts:16-20`) is a duck-type on
`getTabManager` alone. **The concrete `SpecoratorView[]` return annotation is what blocks
a second view type** — narrowing it to `ChatViewHandle[]` is trivial, but the instant it
happens, every consumer that reaches a `SpecoratorView`/`TabData`-only member (not on the
interface) fails to typecheck. So the interfaces must be widened first. `SpecoratorView`
does **not** currently `implements ChatViewHandle` (`SpecoratorView.ts:52`) — conformance
is purely structural.

## Consumer classification (all 15 sites + cousins)

**Group A — already fully covered by today's `ChatViewHandle`** (no change needed):
`EnvironmentApplyService.ts:166`, `providerWidgets.ts:35`, `customModelsCommitHooks.ts:31`,
`CustomContextLimits.ts:135`, `SpecoratorSettings.ts:293`, `claudeSettingsWidgets.ts:181`,
`opencodeSettingsWidgets.ts:38`, `OpencodeChatRuntime.ts:1010`. (All only call
`refreshModelSelector` / `invalidateProviderCommandCaches` / `broadcastTo*`.)

**Group B — need simple method additions to `ChatViewHandle`** (each satisfied by an
existing `SpecoratorView` method, so behavior-preserving):

| Consumer | Method needed | SpecoratorView member |
|---|---|---|
| `main.ts:271`, `GeneralTabSections.ts:62` | `refreshProviderAvailability(): Promise<void>` | `:361` |
| `GeneralTabSections.ts:87` | `updateLayoutForPosition(): void` | `:566` |
| `GeneralTabSections.ts:120` | `refreshTabControls(): void` | `:571` |
| `GeneralTabSections.ts:144` | `applyEditedFilesSetting(): void` | `:191` |
| `PluginViewActivator.ts:98` | `areTabsRestored(): boolean` | `:948` |
| `WorkOrderActivityProvider.ts:166` | `leaf: WorkspaceLeaf` (property) | inherited `ItemView.leaf` |

**Group C — need `ChatTabManagerHandle` additions, core-safe** (neutral return shapes):

| Consumer | Method | TabManager member | Note |
|---|---|---|---|
| `PluginViewActivator.ts:98` | `countTabsByKind(kind): number` | `:162` | safe |
| `PluginLifecycle.ts:46` | `getPersistedState(): AppTabManagerState` | `:813` | **safe** — `PersistedTabManagerState` is field-identical to core `AppTabManagerState` (`core/providers/types.ts:182-185`); already passed to `persistTabManagerState(AppTabManagerState)` today |
| `WorkOrderActivityProvider.ts:132` | `listWorkOrderTabs(): Array<{id,title,isStreaming}>` | `:558` | neutral shape |
| `WorkOrderActivityProvider.ts:150,166` | `closeTab(id,force?)`, `switchToTab(id)` | `:425`, `:390` | safe |

**Group D — deep-reach, the hard part.** These reach feature-owned `TabData` members
(`.service`, `.controllers.conversationController`/`.inputController`, `.state`, `.ui`),
which `core/` MUST NOT import (`src/core/CLAUDE.md`: `features/ → core contracts only`):

- `PluginLifecycle.shutdownActiveRuntimes` (`:31`): `getAllTabs()` → `tab.service?.cleanup()`.
- `main.ts quiesceViewsBeforeConversationDelete` (`:718`): `getAllTabs()` → per tab (gated on `conversationId`) `controllers.conversationController?.dispose()`, `inputController?.cancelStreaming()`, `whenHydrated?.()`, `save()`.
- `main.ts repairViewsAfterConversationDelete` (`:735`): `getAllTabs()` → `controllers.conversationController?.createNew({ force: true })`.
- `EnvironmentApplyService.syncAffectedTabs` (`:99`): `getAllTabs()` → collects a `SyncableTab` slice for later resync (`state.isStreaming`, `inputController?.cancelStreaming()`, `service.resetSession/ensureReady/syncConversationState`, `ui.externalContextSelector?.getExternalContexts()`).
- `WorkOrderActivityProvider.getTab` (`:150,166`): `manager.getTab(tabId): TabData` — feature type.
- `findConversationAcrossViews` (`main.ts:814`): `getAllTabs()` → reads `tab.conversationId`, `tab.id` (neutral, but via `getAllTabs()`).

**`getAllTabs(): TabData[]` cannot be added to a core interface.** Resolve Group D by
extending the **callback/command precedent**: add purpose-built `ChatTabManagerHandle`
methods that keep the `TabData` manipulation inside `TabManager` (features/) and expose
only core-safe signatures. Candidate methods (final shapes to be pinned in the plan):
- `disposeAllRuntimes(): Promise<void>` (shutdown) — **but see behavior nuance below**.
- `quiesceTabsForConversation(conversationId: string): Promise<void>` (delete flow).
- `repairTabsForConversation(conversationId: string): void` (delete flow).
- a resync driver for `syncAffectedTabs` — hardest, since it collects tabs for processing
  *outside* the manager; likely move the resync body into a `TabManager` method taking the
  environment delta, or expose a neutral per-tab resync command.
- `findTabByConversation(conversationId): { tabId: string } | null` (replaces the
  `getAllTabs()` scan in `findConversationAcrossViews`).
- a neutral work-order tab accessor for `WorkOrderActivityProvider` (avoid returning `TabData`).

## Behavior nuances (characterization tests REQUIRED before touching)

- **shutdown vs broadcast guard**: `shutdownActiveRuntimes` guards only `tab.service`, while
  `broadcastToAllTabs` (`TabManager.ts:929-946`) guards `tab.service && tab.serviceInitialized`.
  A constructed-but-not-initialized service would be skipped by a naive `broadcastToAllTabs`
  swap → behavior change, not pure refactor. The new `disposeAllRuntimes` must replicate the
  original guard.
- No "single primary view" assumptions exist in the 15 sites — all already loop over a list.
  But `getView()` (singular, used by `PluginViewActivator.ensureViewOpen`/`canCreateNewTab`)
  has the same return-type tension; decide what "the" view means once two types coexist
  (out of Phase 2's core scope, flag for Phase 4).
- `EnvSnippetManager.ts:442` hardcodes `VIEW_TYPE_SPECORATOR` (doesn't call `getAllViews()`),
  so it won't break but also won't see a second view — decide if in Phase 2 scope.

## Test files (add characterization tests here)

- `tests/unit/app/lifecycle/PluginLifecycle.test.ts` (mocks `getAllViews`).
- `tests/unit/app/environment/EnvironmentApplyService.test.ts`.
- `tests/unit/app/views/PluginViewActivator.test.ts`, `PluginViewActivatorSlots.test.ts` (slot accounting).
- `tests/unit/features/tasks/ui/WorkOrderActivityProvider.test.ts` (already mocks `getTab`/`switchToTab`/`closeTab`/`listWorkOrderTabs`).
- `tests/unit/providers/opencode/OpencodeChatRuntime.test.ts`.
- `tests/integration/main.test.ts` (env apply), `tests/integration/settings/*` (registry), `tests/integration/features/tabs/maxChatReached.test.ts`.

No existing test asserts against the *widened* interface — that gap is exactly what the
characterization tests fill.

## Recommended Phase 2 decomposition

1. **Widen interfaces (Groups B + C)** — add the simple + core-safe methods; make
   `SpecoratorView implements ChatViewHandle`; typecheck + existing tests stay green.
2. **Characterization tests** for the Group D lifecycle paths (capture current behavior incl. the shutdown guard nuance).
3. **Core-safe Group D methods** — add purpose-built `ChatTabManagerHandle` methods, move the `TabData` manipulation into `TabManager`, route the deep-reach consumers through them.
4. **Narrow `getAllViews()`/`getView()`/`findConversationAcrossViews` to `ChatViewHandle`** — locks the contract; any remaining non-interface reach fails typecheck now (before Phase 4).
5. Decide `EnvSnippetManager` / `getView()`-singular scope (likely defer to Phase 4).
