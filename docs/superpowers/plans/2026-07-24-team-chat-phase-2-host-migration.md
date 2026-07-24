---
title: "Team Chat — Phase 2: ChatViewHandle host-migration — Implementation Plan"
date: 2026-07-24
status: draft
scope: src/core/types/PluginContext.ts, src/features/chat (SpecoratorView, TabManager), src/app (PluginLifecycle, EnvironmentApplyService), src/main.ts, src/features/tasks/ui/WorkOrderActivityProvider.ts, src/features/chat/feedback/sendFeedbackPrompt.ts
relates-to: docs/research/2026-07-24-team-chat-phase-2-host-migration-surface.md, docs/superpowers/specs/2026-07-24-team-chat-design.md
---

# Team Chat — Phase 2: ChatViewHandle host-migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widen the core `ChatViewHandle` / `ChatTabManagerHandle` interfaces so every `getAllViews()` consumer runs through them, route the deep-reach consumers through purpose-built core-safe TabManager commands, and narrow `getAllViews()` / `findConversationAcrossViews` to `ChatViewHandle` — so that adding a second chat-host view (`TeamChatView`, Phase 4) is a small, safe change with no user-visible behavior change now.

**Architecture:** The chat engine is enumerated everywhere through `SpecoratorPlugin.getAllViews()`, which today returns the concrete `SpecoratorView[]`. Phase 2 keeps that runtime enumeration but moves the *type contract* onto the existing `ChatViewHandle` seam: Group B settings/lifecycle methods and Group C neutral tab queries go straight onto the interfaces (they already exist on `SpecoratorView`/`TabManager`), while Group D consumers that reach into feature-owned `TabData` (`.service`, `.controllers.*`, `.state`, `.ui`) are served by new `ChatTabManagerHandle` command methods whose bodies live inside `TabManager` and whose signatures carry only core-safe types — extending the established `broadcastToAllTabs`/`broadcastToProviderTabs` precedent. The return-type narrowing lands last so the compiler flags any remaining non-interface reach as the final gate.

**Tech Stack:** TypeScript, Obsidian API, Jest.

---

## Constraints (non-negotiable)

- **Behavior-preserving.** No user-visible change; every existing test stays green. Only relocation of logic behind core-safe interfaces — no logic changes.
- **Core-safety** (`src/core/CLAUDE.md`: `features/ → core contracts only`; core must NOT import feature types). No feature-owned type (`TabData`, controllers, `ChatState`, `ui.*`, `TabKind`, `PersistedTabManagerState`) may appear in a `core/` interface signature. Group D `TabData` manipulation stays INSIDE `TabManager`; the handle exposes only core-safe shapes (`ProviderId`, `string`, `number`, `AppTabManagerState`, and inline neutral object literals).
- **Characterization tests FIRST** for every Group D path, capturing current behavior before code moves — with special attention to the **shutdown-guard nuance** (below).
- **Shutdown-guard nuance.** `PluginLifecycle.shutdownActiveRuntimes` guards only `tab.service` (`?.cleanup()`), while `broadcastToTabs` (`TabManager.ts:929-946`) guards `tab.service && tab.serviceInitialized`. A constructed-but-not-initialized runtime IS torn down by shutdown but SKIPPED by a naive `broadcastToAllTabs` swap. The replacement `disposeAllRuntimes()` MUST replicate the `tab.service`-only guard; a test pins this.

## Deferred to Phase 4 (explicitly out of Phase 2 scope)

- **`getView()` (singular) retyping.** `main.ts:803 getView(): SpecoratorView | null` stays concrete. It is used by many *singular* deep-reach consumers that are NOT `getAllViews()` consumers — `registerPluginCommands.ts` (`getActiveTab().ui.externalContextSelector`), `InlineEditModal.ts:353`, `ensureChatTabManager.ts`, `ChatTabExecutionSurface.ts`, `cliPathSetting.ts`, `PluginViewActivator.openNewTab`/`canCreateNewTab`, `quickActions`, and `sendFeedbackPrompt`'s `getActiveTab()` fallback. Narrowing it forces a "what does *the* view mean once two host types coexist" decision that belongs with the actual `TeamChatView` (Phase 4). The `PluginContext` interface already types it `ChatViewHandle | null`; interface consumers already see the handle. Leaving the concrete return as `SpecoratorView | null` is behavior-preserving and keeps Phase 2 bounded.
- **`EnvSnippetManager.ts:442`** hardcodes `VIEW_TYPE_SPECORATOR` and does not call `getAllViews()`, so it neither breaks in Phase 2 nor sees a second view. No change here; it is a Phase 4 enumeration task.

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `src/core/types/PluginContext.ts` | **Modify** | Widen `ChatViewHandle` (Group B + `leaf`) and `ChatTabManagerHandle` (Group C + Group D). Import `WorkspaceLeaf`. Sole owner of the core-safe host contract. |
| `src/features/chat/SpecoratorView.ts` | **Modify** | Add `implements ChatViewHandle` (compile-time conformance gate). Import `ChatViewHandle`. Task 7: `isSpecoratorView` guard in the work-order-bridge `findConversationTab` callback. |
| `src/features/chat/tabs/TabManager.ts` | **Modify** | Home of the Group D command bodies (`disposeAllRuntimes`, `quiesceTabsForConversation`, `repairTabsForConversation`, `cancelStreamingTabsForProviders`, `restartRuntimeTabsForProviders`, `findTabByConversation`, `hasTab`). All `TabData` reach stays here. Import `DEFAULT_CHAT_PROVIDER_ID`. |
| `src/app/lifecycle/PluginLifecycle.ts` | **Modify** | Route `shutdownActiveRuntimes` through `disposeAllRuntimes`. |
| `src/main.ts` | **Modify** | Route quiesce/repair/findConversationAcrossViews through handle methods; narrow `getAllViews()` and `findConversationAcrossViews` return types to `ChatViewHandle`. Import `ChatViewHandle`. |
| `src/app/environment/EnvironmentApplyService.ts` | **Modify** | Route `syncAffectedTabs` through `cancelStreamingTabsForProviders` + `restartRuntimeTabsForProviders`. Delete the `SyncableTab` alias + `TabData` import + `DEFAULT_CHAT_PROVIDER_ID` import. Import `ChatTabManagerHandle`. |
| `src/features/tasks/ui/WorkOrderActivityProvider.ts` | **Modify** | Replace the two `getTab(id)` existence checks with `hasTab(id)`. |
| `src/features/chat/feedback/sendFeedbackPrompt.ts` | **Modify** | Task 7: `isSpecoratorView` guard so the concrete `getTab` reach survives the narrowed `findConversationAcrossViews` return. |
| `tests/unit/app/lifecycle/PluginLifecycle.test.ts` | **Modify** | Guard-nuance characterization (Task 2) → delegation test (Task 3). |
| `tests/unit/features/chat/tabs/TabManager.test.ts` | **Modify** | New `describe('TabManager - host migration (Group D)')` block: red→green unit tests for every new command (Tasks 3–6). |
| `tests/unit/app/environment/EnvironmentApplyService.test.ts` | **Modify** | Cross-view cancel-before-restart ordering characterization (Task 2) → orchestration/delegation test (Task 5). |
| `tests/integration/main.test.ts` | **Modify** | Characterization for `findConversationAcrossViews` / `quiesceViewsBeforeConversationDelete` / `repairViewsAfterConversationDelete` (Task 2) → routed-through-handle updates (Tasks 4, 6). |
| `tests/unit/features/tasks/ui/WorkOrderActivityProvider.test.ts` | **Modify** | Swap the `getTab` manager mocks for `hasTab` (Task 6). |

**Ordering:** widen interfaces for Groups B+C (safe) → characterization tests for Group D → core-safe Group D methods + route consumers → narrow the return types last (any remaining non-interface reach then fails typecheck as the final gate).

---

## Task 1 — Widen interfaces (Groups B + C) and make `SpecoratorView implements ChatViewHandle`

Pure type widening plus a conformance annotation. Every Group B/C member already exists on `SpecoratorView`/`TabManager`, so this compiles with no behavior change. This is the safe foundation; adding members to an interface never breaks a consumer that only *reads* it.

**Files:**
- Modify: `src/core/types/PluginContext.ts` (`ChatTabManagerHandle` ~:29-35, `ChatViewHandle` ~:42-48, import ~:1)
- Modify: `src/features/chat/SpecoratorView.ts` (class declaration ~:52, imports)
- Test: none new — verified by `npm run typecheck` (the `implements` gate) + the full suite staying green.

Steps:

- [ ] 1.1 In `src/core/types/PluginContext.ts`, add `WorkspaceLeaf` to the obsidian import (line 1):
  ```ts
  import type { Plugin, WorkspaceLeaf } from 'obsidian';
  ```

- [ ] 1.2 Replace the `ChatTabManagerHandle` interface (currently ~:29-35) with the Group-C-widened version. `AppTabManagerState` is already imported (line 9); `ProviderId` is already imported (line 19). The Group C shapes are field-identical to what `TabManager` already returns — `countTabsByKind(kind: TabKind)` where `TabKind = 'chat' | 'work-order'`, and `getPersistedState(): PersistedTabManagerState` which is field-identical to core `AppTabManagerState` — so they are declared with the inline literal / core type (never the feature names):
  ```ts
  export interface ChatTabManagerHandle {
    broadcastToAllTabs(fn: (service: ChatRuntime) => Promise<void>): Promise<void>;
    broadcastToProviderTabs(
      providerIds: ProviderId | ProviderId[],
      fn: (service: ChatRuntime) => Promise<void>,
    ): Promise<void>;

    // --- Group C: neutral tab queries/commands consumed by getAllViews() call sites ---
    /** Count open tabs of a kind. Literal union mirrors `AppTabManagerState.openTabs[].kind`. */
    countTabsByKind(kind: 'chat' | 'work-order'): number;
    /** Open work-order tabs with display title + live-stream flag (neutral shape). */
    listWorkOrderTabs(): Array<{ id: string; title: string; isStreaming: boolean }>;
    /** Persisted tab-manager state (core type; field-identical to `PersistedTabManagerState`). */
    getPersistedState(): AppTabManagerState;
    /** Force-close a tab; `force` closes even while streaming. */
    closeTab(tabId: string, force?: boolean): Promise<boolean>;
    /** Activate an open tab by id. */
    switchToTab(tabId: string): Promise<void>;
  }
  ```

- [ ] 1.3 In the same file, replace the `ChatViewHandle` interface (currently ~:42-48) with the Group-B-widened version. Keep the existing members verbatim; append `leaf` and the five Group B methods:
  ```ts
  export interface ChatViewHandle {
    /** Owning workspace leaf (inherited from `ItemView`). Lets cross-view callers reveal the host leaf. */
    leaf: WorkspaceLeaf;
    getTabManager(): ChatTabManagerHandle | null;
    refreshModelSelector(): void;
    invalidateProviderCommandCaches(providerIds?: ProviderId | ProviderId[]): void;
    /** Re-applies `hiddenProviderCommands` to open command dropdowns. Optional: implemented by the full chat view. */
    updateHiddenProviderCommands?(): void;

    // --- Group B: settings-broadcast + lifecycle surface consumed by getAllViews() call sites ---
    /** Re-probe provider availability; promote/drop the tab engine when the enabled-provider set changed. */
    refreshProviderAvailability(): Promise<void>;
    /** Re-project the shell after a `tabBarPosition` change. */
    updateLayoutForPosition(): void;
    /** Re-project the shell after a tab-bar-visibility setting change. */
    refreshTabControls(): void;
    /** Apply the "show files changed by the agent" setting to open tabs immediately. */
    applyEditedFilesSetting(): void;
    /** Whether the tab manager has finished restoring its persisted tabs. */
    areTabsRestored(): boolean;
  }
  ```

- [ ] 1.4 In `src/features/chat/SpecoratorView.ts`, import the interface (add to the existing core-types imports):
  ```ts
  import type { ChatViewHandle } from '@/core/types/PluginContext';
  ```
  (Match the file's existing import style — if it imports core types via relative paths, use `'../../core/types/PluginContext'`.)

- [ ] 1.5 Change the class declaration (~:52) to declare conformance:
  ```ts
  export class SpecoratorView extends ItemView implements ChatViewHandle {
  ```
  `SpecoratorView` already has `leaf` (via `ItemView`), `getTabManager(): TabManager | null` (`TabManager` structurally satisfies the widened `ChatTabManagerHandle`), `refreshModelSelector`, `invalidateProviderCommandCaches`, `updateHiddenProviderCommands`, `refreshProviderAvailability`, `updateLayoutForPosition`, `refreshTabControls`, `applyEditedFilesSetting`, and `areTabsRestored`. No method bodies change.

- [ ] 1.6 Run the gate. `implements ChatViewHandle` is a compile-time assertion; if any Group B/C member drifted it fails here.
  ```bash
  npm run typecheck && npm run lint && npm run test
  ```
  Expected: green. No test asserts against the widened interface yet (that gap is what Task 2 fills).

- [ ] 1.7 Commit:
  ```bash
  git add -A && git commit \
    -m "Phase 2 (1/7): widen ChatViewHandle/ChatTabManagerHandle (Groups B+C), SpecoratorView implements ChatViewHandle" \
    -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" \
    -m "Claude-Session: https://claude.ai/code/session_01JogyQ4pDLBAxqPLRVBt8sX"
  ```

---

## Task 2 — Characterization tests for the Group D paths (capture current behavior)

Lock the *current* observable behavior of every deep-reach consumer BEFORE any code moves. These tests pass immediately against the current code (that is the point of characterization). The shutdown-guard nuance is pinned here at the consumer level; Task 3 relocates that pin to the new `TabManager` home.

**Files:**
- Modify: `tests/unit/app/lifecycle/PluginLifecycle.test.ts`
- Modify: `tests/unit/app/environment/EnvironmentApplyService.test.ts`
- Modify: `tests/integration/main.test.ts`
- (WorkOrderActivityProvider is already characterized — see 2.4.)

Steps:

- [ ] 2.1 **Shutdown-guard nuance.** In `tests/unit/app/lifecycle/PluginLifecycle.test.ts`, inside `describe('PluginLifecycle.shutdownActiveRuntimes', …)`, add a test pinning that a service-present-but-uninitialized tab is STILL cleaned up (guard is `tab.service` only), and a service-null tab is skipped without throwing:
  ```ts
  it('cleans up a tab whose service exists but is uninitialized (guard is tab.service only, broader than broadcast)', () => {
    const cleanup = jest.fn();
    const tabManager = {
      getAllTabs: jest.fn().mockReturnValue([
        { service: { cleanup }, serviceInitialized: false },
        { service: null, serviceInitialized: false },
      ]),
    };
    const view = { getTabManager: jest.fn().mockReturnValue(tabManager) } as unknown as SpecoratorView;
    const plugin = createPlugin([view]);

    new PluginLifecycle(plugin).shutdownActiveRuntimes();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });
  ```

- [ ] 2.2 Run it. Expected: PASS against current code (`shutdownActiveRuntimes` reads `tab.service?.cleanup()` off `getAllTabs()`).
  ```bash
  npx jest tests/unit/app/lifecycle/PluginLifecycle.test.ts -t "guard is tab.service only"
  ```

- [ ] 2.3 **Cross-view cancel-before-restart ordering.** In `tests/unit/app/environment/EnvironmentApplyService.test.ts`, add a two-view test pinning that EVERY affected tab's stream is cancelled (across all views) BEFORE any runtime is restarted:
  ```ts
  it('cancels every affected tab across all views before restarting any (env-apply ordering)', async () => {
    jest.spyOn(providerEnv, 'getEnvironmentVariablesForScope').mockReturnValue('OLD');
    jest.spyOn(providerEnv, 'setEnvironmentVariablesForScope').mockImplementation(() => undefined);
    jest.spyOn(ProviderRegistry, 'getRegisteredProviderIds').mockReturnValue(['claude']);
    jest.spyOn(ProviderSettingsCoordinator, 'handleEnvironmentChange' as any).mockImplementation(() => undefined);
    jest.spyOn(ProviderSettingsCoordinator, 'reconcileProviders' as any).mockReturnValue({
      changed: false,
      invalidatedConversations: [],
    });

    const order: string[] = [];
    const makeTab = (name: string) => ({
      providerId: 'claude' as ProviderId,
      state: { isStreaming: true },
      service: {
        cleanup: jest.fn(),
        syncConversationState: jest.fn(),
        resetSession: jest.fn(),
        ensureReady: jest.fn(() => { order.push(`restart:${name}`); return Promise.resolve(); }),
      },
      serviceInitialized: true,
      conversationId: null,
      controllers: { inputController: { cancelStreaming: jest.fn(() => order.push(`cancel:${name}`)) } },
      ui: { externalContextSelector: undefined },
    });
    const t1 = makeTab('v1');
    const t2 = makeTab('v2');
    const view1 = { getTabManager: () => ({ getAllTabs: () => [t1] }), invalidateProviderCommandCaches: jest.fn(), refreshModelSelector: jest.fn() };
    const view2 = { getTabManager: () => ({ getAllTabs: () => [t2] }), invalidateProviderCommandCaches: jest.fn(), refreshModelSelector: jest.fn() };
    const plugin = { ...createPlugin(), getAllViews: jest.fn().mockReturnValue([view1, view2]) } as unknown as SpecoratorPlugin;

    await new EnvironmentApplyService(plugin).apply('shared', 'NEW');

    // Both cancels precede both restarts (cancel-all-then-restart-all).
    expect(order.indexOf('cancel:v1')).toBeLessThan(order.indexOf('restart:v1'));
    expect(order.indexOf('cancel:v2')).toBeLessThan(order.indexOf('restart:v1'));
    expect(order.indexOf('cancel:v2')).toBeLessThan(order.indexOf('restart:v2'));
  });
  ```
  Run it. Expected: PASS against current code (`syncAffectedTabs` collects all affected tabs, cancels all, then resyncs all).
  ```bash
  npx jest tests/unit/app/environment/EnvironmentApplyService.test.ts -t "before restarting any"
  ```

- [ ] 2.4 **WorkOrderActivityProvider tab ops** are already characterized by the existing tests — `switches to a live sidepanel tab before opening the modal`, `reveals the owning workspace leaf before switching to its tab`, `falls back to detail modal when no live tab is found`, `force-closes the owning work-order tab to free the slot`, `reports no closable tabs when the tab manager cannot enumerate them`, `never lists a streaming (live) work-order tab as closable` (`tests/unit/features/tasks/ui/WorkOrderActivityProvider.test.ts`). No new test needed; note that these currently mock `getTab` and will be updated to `hasTab` in Task 6. Confirm they pass now:
  ```bash
  npx jest tests/unit/features/tasks/ui/WorkOrderActivityProvider.test.ts
  ```

- [ ] 2.5 **findConversationAcrossViews + delete flow.** In `tests/integration/main.test.ts` (which already value-imports `SpecoratorPlugin from '@/main'`), add a `describe` that exercises the three plugin methods through the prototype, stubbing only `getAllViews`. This pins the current `getAllTabs()`-scan behavior and the per-tab delete effects:
  ```ts
  describe('host-migration characterization', () => {
    function viewWithTabs(tabs: any[], extra: Record<string, unknown> = {}) {
      return {
        leaf: { id: `leaf-${Math.random()}` },
        getTabManager: () => ({ getAllTabs: () => tabs }),
        ...extra,
      };
    }

    it('findConversationAcrossViews returns the owning view + tab id via getAllTabs scan', () => {
      const view1 = viewWithTabs([{ id: 't1', conversationId: 'c-1' }]);
      const view2 = viewWithTabs([{ id: 't2', conversationId: 'c-2' }]);
      const ctx = { getAllViews: () => [view1, view2] } as unknown as SpecoratorPlugin;

      const result = SpecoratorPlugin.prototype.findConversationAcrossViews.call(ctx, 'c-2');

      expect(result).toEqual({ view: view2, tabId: 't2' });
      expect(SpecoratorPlugin.prototype.findConversationAcrossViews.call(ctx, 'missing')).toBeNull();
    });

    it('quiesceViewsBeforeConversationDelete disposes/cancels/hydrates/saves matching tabs only', async () => {
      const cc = {
        dispose: jest.fn(),
        whenHydrated: jest.fn().mockResolvedValue(undefined),
        save: jest.fn().mockResolvedValue(undefined),
      };
      const matching = { conversationId: 'c-1', controllers: { conversationController: cc, inputController: { cancelStreaming: jest.fn() } } };
      const other = { conversationId: 'c-9', controllers: { conversationController: { dispose: jest.fn(), whenHydrated: jest.fn(), save: jest.fn() }, inputController: { cancelStreaming: jest.fn() } } };
      const view = viewWithTabs([matching, other]);
      const ctx = { getAllViews: () => [view] } as unknown as SpecoratorPlugin;

      await (SpecoratorPlugin.prototype as any).quiesceViewsBeforeConversationDelete.call(ctx, 'c-1');

      expect(cc.dispose).toHaveBeenCalledTimes(1);
      expect(matching.controllers.inputController.cancelStreaming).toHaveBeenCalledTimes(1);
      expect(cc.whenHydrated).toHaveBeenCalledTimes(1);
      expect(cc.save).toHaveBeenCalledTimes(1);
      expect(other.controllers.conversationController.dispose).not.toHaveBeenCalled();
    });

    it('repairViewsAfterConversationDelete recreates a fresh conversation (force) on matching tabs only', async () => {
      const createNew = jest.fn().mockResolvedValue(undefined);
      const nonMatchCreate = jest.fn().mockResolvedValue(undefined);
      const view = viewWithTabs([
        { conversationId: 'c-1', controllers: { conversationController: { createNew } } },
        { conversationId: 'c-9', controllers: { conversationController: { createNew: nonMatchCreate } } },
      ]);
      const ctx = { getAllViews: () => [view] } as unknown as SpecoratorPlugin;

      await (SpecoratorPlugin.prototype as any).repairViewsAfterConversationDelete.call(ctx, 'c-1');

      expect(createNew).toHaveBeenCalledWith({ force: true });
      expect(nonMatchCreate).not.toHaveBeenCalled();
    });
  });
  ```
  Run it. Expected: PASS against current code.
  ```bash
  npx jest tests/integration/main.test.ts -t "host-migration characterization" --selectProjects integration
  ```

- [ ] 2.6 Commit the characterization tests (green against current code):
  ```bash
  git add -A && git commit \
    -m "Phase 2 (2/7): characterization tests for Group D host-migration paths (shutdown guard, env resync ordering, delete flow, findConversationAcrossViews)" \
    -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" \
    -m "Claude-Session: https://claude.ai/code/session_01JogyQ4pDLBAxqPLRVBt8sX"
  ```

---

## Task 3 — Group D: `disposeAllRuntimes` (shutdown) + route `PluginLifecycle`

The first Group D command. The new method replicates the `tab.service`-only guard (NOT `serviceInitialized`), and the guard-nuance pin moves from `PluginLifecycle` to `TabManager` (its permanent home).

**Files:**
- Modify: `src/core/types/PluginContext.ts` (`ChatTabManagerHandle`)
- Modify: `src/features/chat/tabs/TabManager.ts` (add method after the Broadcast section ~:946)
- Modify: `src/app/lifecycle/PluginLifecycle.ts` (`shutdownActiveRuntimes` ~:30-42)
- Test: `tests/unit/features/chat/tabs/TabManager.test.ts` (new `describe`), `tests/unit/app/lifecycle/PluginLifecycle.test.ts` (delegation)

Steps:

- [ ] 3.1 **Red — TabManager guard test.** In `tests/unit/features/chat/tabs/TabManager.test.ts`, add a new block at the end. It uses the existing `createManager()` harness and seeds `(manager as any).tabs` directly (these commands touch only `this.tabs` / `this.plugin`):
  ```ts
  describe('TabManager - host migration (Group D)', () => {
    describe('disposeAllRuntimes', () => {
      it('cleans up a service even when serviceInitialized is false (guard is tab.service only)', () => {
        const manager = createManager();
        const cleanupInit = jest.fn();
        const cleanupUninit = jest.fn();
        (manager as any).tabs = new Map<string, any>([
          ['a', { service: { cleanup: cleanupInit }, serviceInitialized: true }],
          ['b', { service: { cleanup: cleanupUninit }, serviceInitialized: false }],
          ['c', { service: null, serviceInitialized: false }],
        ]);

        manager.disposeAllRuntimes();

        expect(cleanupInit).toHaveBeenCalledTimes(1);
        expect(cleanupUninit).toHaveBeenCalledTimes(1);
      });

      it('swallows a throwing cleanup and still disposes the rest', () => {
        const manager = createManager();
        const ok = jest.fn();
        (manager as any).tabs = new Map<string, any>([
          ['a', { service: { cleanup: () => { throw new Error('boom'); } }, serviceInitialized: true }],
          ['b', { service: { cleanup: ok }, serviceInitialized: true }],
        ]);

        expect(() => manager.disposeAllRuntimes()).not.toThrow();
        expect(ok).toHaveBeenCalledTimes(1);
      });
    });
  });
  ```
  Run it. Expected: FAIL (`manager.disposeAllRuntimes is not a function`).
  ```bash
  npx jest tests/unit/features/chat/tabs/TabManager.test.ts -t "disposeAllRuntimes"
  ```

- [ ] 3.2 **Green — implement.** In `src/features/chat/tabs/TabManager.ts`, add a new `// Host migration (Group D)` section immediately after the Broadcast section (after `broadcastToTabs`, ~:946):
  ```ts
  // ============================================
  // Host migration (Group D commands)
  //
  // Purpose-built commands that keep every TabData reach inside TabManager and
  // expose only core-safe signatures on ChatTabManagerHandle, extending the
  // broadcastToAllTabs/broadcastToProviderTabs precedent so a second chat-host
  // view can drive the same lifecycle without core importing feature types.
  // ============================================

  /**
   * Fire-and-forget cleanup of every tab's runtime. Guards ONLY on `tab.service`
   * (NOT `serviceInitialized`), matching the pre-migration
   * `PluginLifecycle.shutdownActiveRuntimes` guard — intentionally broader than
   * `broadcastToTabs`, so a constructed-but-uninitialized runtime is still torn
   * down. Errors are swallowed so one failing cleanup can't strand the rest.
   */
  disposeAllRuntimes(): void {
    for (const tab of this.tabs.values()) {
      try {
        void tab.service?.cleanup();
      } catch {
        // best-effort: keep tearing down remaining runtimes
      }
    }
  }
  ```

- [ ] 3.3 Add `disposeAllRuntimes(): void;` to `ChatTabManagerHandle` in `src/core/types/PluginContext.ts` (under a `// --- Group D ---` comment):
  ```ts
    // --- Group D: purpose-built commands that keep TabData reach inside TabManager ---
    /** Best-effort cleanup of every tab's runtime (guards `tab.service` only). */
    disposeAllRuntimes(): void;
  ```

- [ ] 3.4 Run the TabManager test. Expected: PASS.
  ```bash
  npx jest tests/unit/features/chat/tabs/TabManager.test.ts -t "disposeAllRuntimes"
  ```

- [ ] 3.5 **Route the consumer.** In `src/app/lifecycle/PluginLifecycle.ts`, replace `shutdownActiveRuntimes` (~:30-42):
  ```ts
  shutdownActiveRuntimes(): void {
    for (const view of this.plugin.getAllViews()) {
      view.getTabManager()?.disposeAllRuntimes();
    }
  }
  ```

- [ ] 3.6 **Update the consumer test.** In `tests/unit/app/lifecycle/PluginLifecycle.test.ts`, update the `createView` helper so its mocked manager exposes `disposeAllRuntimes` (and keep `getPersistedState` for the persist test):
  ```ts
  function createView(tabs: ReturnType<typeof createTab>[]) {
    const tabManager = {
      disposeAllRuntimes: jest.fn(),
      getPersistedState: jest.fn().mockReturnValue({ openTabs: [] }),
    };
    return {
      getTabManager: jest.fn().mockReturnValue(tabManager),
      __tabManager: tabManager,
    } as unknown as SpecoratorView & { __tabManager: { disposeAllRuntimes: jest.Mock } };
  }
  ```
  Replace the two `shutdownActiveRuntimes` tests (the `getAllTabs`/`cleanup` ones AND the Task 2.1 guard-nuance one — the guard now lives in the TabManager test) with delegation tests:
  ```ts
  describe('PluginLifecycle.shutdownActiveRuntimes', () => {
    it('delegates to disposeAllRuntimes on every view', () => {
      const viewA = createView([]) as any;
      const viewB = createView([]) as any;
      const plugin = createPlugin([viewA, viewB]);

      new PluginLifecycle(plugin).shutdownActiveRuntimes();

      expect(viewA.__tabManager.disposeAllRuntimes).toHaveBeenCalledTimes(1);
      expect(viewB.__tabManager.disposeAllRuntimes).toHaveBeenCalledTimes(1);
    });

    it('skips views without a tab manager', () => {
      const view = { getTabManager: jest.fn().mockReturnValue(null) } as unknown as SpecoratorView;
      const plugin = createPlugin([view]);

      expect(() => new PluginLifecycle(plugin).shutdownActiveRuntimes()).not.toThrow();
    });
  });
  ```

- [ ] 3.7 Run the full gate for the touched files. Expected: PASS.
  ```bash
  npm run typecheck && npx jest tests/unit/app/lifecycle/PluginLifecycle.test.ts tests/unit/features/chat/tabs/TabManager.test.ts
  ```

- [ ] 3.8 Commit:
  ```bash
  git add -A && git commit \
    -m "Phase 2 (3/7): add TabManager.disposeAllRuntimes, route PluginLifecycle shutdown through it" \
    -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" \
    -m "Claude-Session: https://claude.ai/code/session_01JogyQ4pDLBAxqPLRVBt8sX"
  ```

---

## Task 4 — Group D: `quiesceTabsForConversation` + `repairTabsForConversation` + route `main.ts` delete flow

Move the conversation-delete quiesce/repair `TabData` reach into `TabManager`. The original iterates views sequentially, and within a view iterates tabs sequentially awaiting per matching tab — preserved exactly (per-view sequential outer loop in `main.ts`, per-tab sequential inner loop inside the manager).

**Files:**
- Modify: `src/core/types/PluginContext.ts` (`ChatTabManagerHandle` Group D)
- Modify: `src/features/chat/tabs/TabManager.ts` (Host-migration section)
- Modify: `src/main.ts` (`quiesceViewsBeforeConversationDelete` ~:717-731, `repairViewsAfterConversationDelete` ~:734-745)
- Test: `tests/unit/features/chat/tabs/TabManager.test.ts`, `tests/integration/main.test.ts`

Steps:

- [ ] 4.1 **Red — TabManager tests.** Add to the `TabManager - host migration (Group D)` block:
  ```ts
  describe('quiesceTabsForConversation', () => {
    it('disposes, cancels, drains hydration, then saves matching tabs in order', async () => {
      const manager = createManager();
      const calls: string[] = [];
      const cc = {
        dispose: jest.fn(() => calls.push('dispose')),
        whenHydrated: jest.fn(() => { calls.push('whenHydrated'); return Promise.resolve(); }),
        save: jest.fn(() => { calls.push('save'); return Promise.resolve(); }),
      };
      const inputController = { cancelStreaming: jest.fn(() => calls.push('cancel')) };
      const other = { conversationId: 'other', controllers: { conversationController: { dispose: jest.fn(), whenHydrated: jest.fn(), save: jest.fn() }, inputController: { cancelStreaming: jest.fn() } } };
      (manager as any).tabs = new Map<string, any>([
        ['a', { conversationId: 'c-1', controllers: { conversationController: cc, inputController } }],
        ['b', other],
      ]);

      await manager.quiesceTabsForConversation('c-1');

      expect(calls).toEqual(['dispose', 'cancel', 'whenHydrated', 'save']);
      expect(other.controllers.conversationController.dispose).not.toHaveBeenCalled();
    });

    it('swallows whenHydrated/save rejections', async () => {
      const manager = createManager();
      const cc = {
        dispose: jest.fn(),
        whenHydrated: jest.fn().mockRejectedValue(new Error('h')),
        save: jest.fn().mockRejectedValue(new Error('s')),
      };
      (manager as any).tabs = new Map<string, any>([
        ['a', { conversationId: 'c-1', controllers: { conversationController: cc, inputController: { cancelStreaming: jest.fn() } } }],
      ]);

      await expect(manager.quiesceTabsForConversation('c-1')).resolves.toBeUndefined();
    });
  });

  describe('repairTabsForConversation', () => {
    it('recreates a fresh conversation (force) only on matching tabs', async () => {
      const manager = createManager();
      const match = { conversationId: 'c-1', controllers: { conversationController: { createNew: jest.fn().mockResolvedValue(undefined) } } };
      const nonMatch = { conversationId: 'c-2', controllers: { conversationController: { createNew: jest.fn().mockResolvedValue(undefined) } } };
      (manager as any).tabs = new Map<string, any>([['a', match], ['b', nonMatch]]);

      await manager.repairTabsForConversation('c-1');

      expect(match.controllers.conversationController.createNew).toHaveBeenCalledWith({ force: true });
      expect(nonMatch.controllers.conversationController.createNew).not.toHaveBeenCalled();
    });
  });
  ```
  Run it. Expected: FAIL (methods undefined).
  ```bash
  npx jest tests/unit/features/chat/tabs/TabManager.test.ts -t "quiesceTabsForConversation|repairTabsForConversation"
  ```

- [ ] 4.2 **Green — implement** in `TabManager.ts` (Host-migration section, after `disposeAllRuntimes`). Bodies are moved verbatim from `main.ts`:
  ```ts
  /**
   * Quiesce every tab bound to `conversationId` before its conversation is
   * deleted: dispose the conversation controller, cancel any in-flight stream,
   * then drain hydration and save (both best-effort). Moved from the shell's
   * `quiesceViewsBeforeConversationDelete`; the per-tab sequencing is unchanged.
   */
  async quiesceTabsForConversation(conversationId: string): Promise<void> {
    for (const tab of this.tabs.values()) {
      if (tab.conversationId !== conversationId) continue;
      tab.controllers.conversationController?.dispose();
      tab.controllers.inputController?.cancelStreaming();
      await tab.controllers.conversationController?.whenHydrated?.().catch(() => {});
      await tab.controllers.conversationController?.save().catch(() => {});
    }
  }

  /** Reset every tab bound to `conversationId` back to a fresh conversation. */
  async repairTabsForConversation(conversationId: string): Promise<void> {
    for (const tab of this.tabs.values()) {
      if (tab.conversationId !== conversationId) continue;
      await tab.controllers.conversationController?.createNew({ force: true });
    }
  }
  ```

- [ ] 4.3 Add to `ChatTabManagerHandle` (Group D section) in `PluginContext.ts`:
  ```ts
    /** Quiesce tabs bound to a conversation before its metadata is deleted. */
    quiesceTabsForConversation(conversationId: string): Promise<void>;
    /** Reset tabs bound to a deleted conversation back to a fresh chat. */
    repairTabsForConversation(conversationId: string): Promise<void>;
  ```

- [ ] 4.4 Run the TabManager tests. Expected: PASS.
  ```bash
  npx jest tests/unit/features/chat/tabs/TabManager.test.ts -t "quiesceTabsForConversation|repairTabsForConversation"
  ```

- [ ] 4.5 **Route the consumers** in `src/main.ts`. Replace `quiesceViewsBeforeConversationDelete` (~:717-731):
  ```ts
  private async quiesceViewsBeforeConversationDelete(conversationId: string): Promise<void> {
    for (const view of this.getAllViews()) {
      await view.getTabManager()?.quiesceTabsForConversation(conversationId);
    }
  }
  ```
  and `repairViewsAfterConversationDelete` (~:734-745):
  ```ts
  private async repairViewsAfterConversationDelete(conversationId: string): Promise<void> {
    for (const view of this.getAllViews()) {
      await view.getTabManager()?.repairTabsForConversation(conversationId);
    }
  }
  ```

- [ ] 4.6 **Update the consumer characterization tests.** In `tests/integration/main.test.ts`, change the `viewWithTabs` manager mock (in the `host-migration characterization` describe) so views expose the routed methods, and rewrite the two delete-flow tests to assert delegation while keeping the per-tab effect assertions in the TabManager suite:
  ```ts
    it('quiesceViewsBeforeConversationDelete delegates to quiesceTabsForConversation per view', async () => {
      const quiesce = jest.fn().mockResolvedValue(undefined);
      const view = { leaf: {}, getTabManager: () => ({ quiesceTabsForConversation: quiesce }) };
      const ctx = { getAllViews: () => [view] } as unknown as SpecoratorPlugin;

      await (SpecoratorPlugin.prototype as any).quiesceViewsBeforeConversationDelete.call(ctx, 'c-1');

      expect(quiesce).toHaveBeenCalledWith('c-1');
    });

    it('repairViewsAfterConversationDelete delegates to repairTabsForConversation per view', async () => {
      const repair = jest.fn().mockResolvedValue(undefined);
      const view = { leaf: {}, getTabManager: () => ({ repairTabsForConversation: repair }) };
      const ctx = { getAllViews: () => [view] } as unknown as SpecoratorPlugin;

      await (SpecoratorPlugin.prototype as any).repairViewsAfterConversationDelete.call(ctx, 'c-1');

      expect(repair).toHaveBeenCalledWith('c-1');
    });
  ```
  (Keep the Task 2.5 `findConversationAcrossViews` characterization test unchanged — it is routed in Task 6.)

- [ ] 4.7 Run the gate. Expected: PASS.
  ```bash
  npm run typecheck && npx jest tests/unit/features/chat/tabs/TabManager.test.ts && npx jest tests/integration/main.test.ts -t "host-migration characterization" --selectProjects integration
  ```

- [ ] 4.8 Commit:
  ```bash
  git add -A && git commit \
    -m "Phase 2 (4/7): add TabManager quiesce/repair TabsForConversation, route main.ts delete flow through them" \
    -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" \
    -m "Claude-Session: https://claude.ai/code/session_01JogyQ4pDLBAxqPLRVBt8sX"
  ```

---

## Task 5 — Group D: env resync (`cancelStreamingTabsForProviders` + `restartRuntimeTabsForProviders`) + route `EnvironmentApplyService`

The hardest path. `EnvironmentApplyService.syncAffectedTabs` currently collects a `SyncableTab` slice across views, cancels streaming on all, then resyncs all. Two handle methods preserve the exact "cancel-all-then-restart-all" ordering while keeping every `TabData` reach (`.state`, `.controllers`, `.service`, `.ui`, `.conversationId`) inside `TabManager`. The `SyncableTab` alias and `TabData` import are deleted from `EnvironmentApplyService`.

**Files:**
- Modify: `src/core/types/PluginContext.ts` (`ChatTabManagerHandle` Group D)
- Modify: `src/features/chat/tabs/TabManager.ts` (Host-migration section; add `DEFAULT_CHAT_PROVIDER_ID` import)
- Modify: `src/app/environment/EnvironmentApplyService.ts` (replace `syncAffectedTabs`, `resyncTab`, `syncTabRuntimeState`, `resolveExternalContextPaths`; delete `SyncableTab` + `TabData`/`DEFAULT_CHAT_PROVIDER_ID` imports)
- Test: `tests/unit/features/chat/tabs/TabManager.test.ts`, `tests/unit/app/environment/EnvironmentApplyService.test.ts`

Steps:

- [ ] 5.1 **Red — TabManager tests.** Add to the Group D block. A local `tab()` factory mirrors the env-apply `SyncableTab` fields; `createManager()`'s default plugin supplies `getConversationSync` (→ null) and `settings` (no `persistentExternalContextPaths` → `[]`):
  ```ts
  describe('cancelStreamingTabsForProviders / restartRuntimeTabsForProviders', () => {
    function tab(overrides: any = {}) {
      return {
        providerId: overrides.providerId ?? 'claude',
        state: { isStreaming: overrides.isStreaming ?? false },
        service: 'service' in overrides ? overrides.service : {
          cleanup: jest.fn(),
          syncConversationState: jest.fn(),
          resetSession: jest.fn(),
          ensureReady: jest.fn().mockResolvedValue(undefined),
        },
        serviceInitialized: overrides.serviceInitialized ?? true,
        conversationId: overrides.conversationId ?? null,
        controllers: { inputController: { cancelStreaming: jest.fn() } },
        ui: { externalContextSelector: undefined },
      };
    }

    it('cancels only streaming tabs whose provider is affected', () => {
      const manager = createManager();
      const streamingClaude = tab({ isStreaming: true });
      const idleClaude = tab({ isStreaming: false });
      const streamingCodex = tab({ providerId: 'codex', isStreaming: true });
      (manager as any).tabs = new Map<string, any>([['a', streamingClaude], ['b', idleClaude], ['c', streamingCodex]]);

      manager.cancelStreamingTabsForProviders(['claude']);

      expect(streamingClaude.controllers.inputController.cancelStreaming).toHaveBeenCalled();
      expect(idleClaude.controllers.inputController.cancelStreaming).not.toHaveBeenCalled();
      expect(streamingCodex.controllers.inputController.cancelStreaming).not.toHaveBeenCalled();
    });

    it('force-restarts initialized runtimes and drops the session when changed', async () => {
      const manager = createManager();
      const t = tab();
      (manager as any).tabs = new Map<string, any>([['a', t]]);

      const failed = await manager.restartRuntimeTabsForProviders(['claude'], true);

      expect(failed).toBe(0);
      expect(t.service.syncConversationState).toHaveBeenCalled();
      expect(t.service.resetSession).toHaveBeenCalled();
      expect(t.service.ensureReady).toHaveBeenCalledWith({ force: true });
    });

    it('does not drop the session when unchanged', async () => {
      const manager = createManager();
      const t = tab();
      (manager as any).tabs = new Map<string, any>([['a', t]]);

      await manager.restartRuntimeTabsForProviders(['claude'], false);

      expect(t.service.resetSession).not.toHaveBeenCalled();
      expect(t.service.ensureReady).toHaveBeenCalledWith({ force: true });
    });

    it('skips uninitialized tabs as success and counts a throwing restart as one failure', async () => {
      const manager = createManager();
      const uninit = tab({ serviceInitialized: false });
      const throwing = tab({
        service: { cleanup: jest.fn(), syncConversationState: jest.fn(), resetSession: jest.fn(), ensureReady: jest.fn().mockRejectedValue(new Error('x')) },
      });
      (manager as any).tabs = new Map<string, any>([['a', uninit], ['b', throwing]]);

      const failed = await manager.restartRuntimeTabsForProviders(['claude'], false);

      expect(failed).toBe(1);
      expect(uninit.service.ensureReady).not.toHaveBeenCalled();
    });
  });
  ```
  Run it. Expected: FAIL (methods undefined).
  ```bash
  npx jest tests/unit/features/chat/tabs/TabManager.test.ts -t "cancelStreamingTabsForProviders"
  ```

- [ ] 5.2 **Green — implement** in `TabManager.ts` (Host-migration section). Add the value import near the top (merge with the existing `ProviderId` type import from the same module or add a sibling `import`):
  ```ts
  import { DEFAULT_CHAT_PROVIDER_ID } from '../../../core/providers/types';
  ```
  Then the methods + moved privates (`Conversation` and `ProviderId` are already imported in `TabManager.ts`):
  ```ts
  /**
   * Cancel in-flight streams on every tab whose active provider is in
   * `providerIds`. Split from the restart pass so the env-apply flow can cancel
   * across ALL managers before restarting any (preserving the original
   * "cancel all, then resync all" ordering).
   */
  cancelStreamingTabsForProviders(providerIds: ProviderId[]): void {
    for (const tab of this.affectedProviderTabs(providerIds)) {
      if (tab.state.isStreaming) tab.controllers.inputController?.cancelStreaming();
    }
  }

  /**
   * Re-sync + force-restart every initialized runtime whose provider is in
   * `providerIds`; when `changed`, drop the session first. Returns the count of
   * tabs whose restart threw (so the caller can surface a partial-failure
   * Notice). Uninitialized tabs count as success (skipped). The affected set is
   * captured before the first await, matching the original "capture once" pass.
   */
  async restartRuntimeTabsForProviders(providerIds: ProviderId[], changed: boolean): Promise<number> {
    const affectedTabs = [...this.affectedProviderTabs(providerIds)];
    let failed = 0;
    for (const tab of affectedTabs) {
      if (!(await this.resyncTabRuntime(tab, changed))) failed++;
    }
    return failed;
  }

  private *affectedProviderTabs(providerIds: ProviderId[]): Iterable<TabData> {
    for (const tab of this.tabs.values()) {
      if (providerIds.includes(tab.providerId ?? DEFAULT_CHAT_PROVIDER_ID)) yield tab;
    }
  }

  private async resyncTabRuntime(tab: TabData, changed: boolean): Promise<boolean> {
    if (!tab.service || !tab.serviceInitialized) return true;
    try {
      this.syncTabRuntimeState(tab);
      // Always FORCE a respawn: a persistent runtime (Claude / Cursor / Codex /
      // Opencode ACP) keeps a live child that still holds the OLD credentials /
      // base URL, so a non-forced ensureReady early-returns and the env change
      // never reaches the process. `changed` additionally drops the session.
      if (changed) tab.service.resetSession();
      await tab.service.ensureReady({ force: true });
      return true;
    } catch {
      return false;
    }
  }

  private syncTabRuntimeState(tab: TabData): void {
    if (!tab.service || !tab.serviceInitialized) return;
    const conversation = tab.conversationId
      ? this.plugin.getConversationSync(tab.conversationId)
      : null;
    tab.service.syncConversationState(
      conversation,
      this.resolveExternalContextPaths(tab, conversation),
    );
  }

  /** Prefer the tab's live selection; else the conversation's (when it has context), else the persistent default. */
  private resolveExternalContextPaths(tab: TabData, conversation: Conversation | null): string[] {
    const selected = tab.ui.externalContextSelector?.getExternalContexts();
    if (selected) return selected;
    const hasContext = (conversation?.messages.length ?? 0) > 0;
    return hasContext
      ? conversation?.externalContextPaths ?? []
      : this.plugin.settings.persistentExternalContextPaths ?? [];
  }
  ```

- [ ] 5.3 Add to `ChatTabManagerHandle` (Group D section):
  ```ts
    /** Cancel in-flight streams on tabs whose provider is affected by an env change. */
    cancelStreamingTabsForProviders(providerIds: ProviderId[]): void;
    /** Re-sync + force-restart affected runtimes; returns the count that threw. */
    restartRuntimeTabsForProviders(providerIds: ProviderId[], changed: boolean): Promise<number>;
  ```

- [ ] 5.4 Run the TabManager tests. Expected: PASS.
  ```bash
  npx jest tests/unit/features/chat/tabs/TabManager.test.ts -t "cancelStreamingTabsForProviders"
  ```

- [ ] 5.5 **Route the consumer** in `src/app/environment/EnvironmentApplyService.ts`:
  - Add the import: `import type { ChatTabManagerHandle } from '@/core/types/PluginContext';`
  - Delete `import type { TabData } from '@/features/chat/tabs/types';` (line 15) and the `SyncableTab` type alias (~:19-23).
  - Delete `import { DEFAULT_CHAT_PROVIDER_ID } from '@/core/providers/types';` (line 11) — it is now used only inside `TabManager`. Keep the `ProviderId` type import (line 10).
  - Replace `syncAffectedTabs` (~:97-120) and DELETE `resyncTab` (~:122-142), `syncTabRuntimeState` (~:144-153), and `resolveExternalContextPaths` (~:155-163):
    ```ts
    /** Cancel in-flight streams on affected tabs across every view, then re-sync/restart each. */
    private async syncAffectedTabs(affected: ProviderId[], changed: boolean): Promise<void> {
      const managers = this.collectTabManagers();
      for (const manager of managers) manager.cancelStreamingTabsForProviders(affected);
      let failedTabs = 0;
      for (const manager of managers) {
        failedTabs += await manager.restartRuntimeTabsForProviders(affected, changed);
      }
      if (failedTabs > 0) {
        new Notice(t('env.applyPartial', { count: failedTabs }));
      }
    }

    private collectTabManagers(): ChatTabManagerHandle[] {
      const managers: ChatTabManagerHandle[] = [];
      for (const view of this.plugin.getAllViews()) {
        const manager = view.getTabManager();
        if (manager) managers.push(manager);
      }
      return managers;
    }
    ```
    `refreshAffectedViews` (~:165-170) is unchanged (Group A). Note: the cancel loop is fully synchronous (no await), so no tab can be added between it and the restart loop; each `restartRuntimeTabsForProviders` captures its own affected set at method entry — see the Self-Review "micro-deviation" note.

- [ ] 5.6 **Update the consumer tests** in `tests/unit/app/environment/EnvironmentApplyService.test.ts`:
  - The `createPlugin` view mock (`{ getAllTabs }`) → give the manager the two new methods. Replace the `tabManager` in `createPlugin` (~:38-40):
    ```ts
    const tabManager = {
      cancelStreamingTabsForProviders: jest.fn(),
      restartRuntimeTabsForProviders: jest.fn().mockResolvedValue(0),
    };
    ```
  - Replace the existing `cancels streaming tabs before restarting them on change` test (which asserted tab-level `cancelStreaming`/`resetSession`/`ensureReady` — those now live in the TabManager suite) with an orchestration/delegation test:
    ```ts
    it('delegates cancel + restart to each view tab manager with the affected providers', async () => {
      jest.spyOn(providerEnv, 'getEnvironmentVariablesForScope').mockReturnValue('OLD');
      jest.spyOn(providerEnv, 'setEnvironmentVariablesForScope').mockImplementation(() => undefined);
      jest.spyOn(ProviderRegistry, 'getRegisteredProviderIds').mockReturnValue(['claude']);
      jest.spyOn(ProviderSettingsCoordinator, 'handleEnvironmentChange' as any).mockImplementation(() => undefined);
      jest.spyOn(ProviderSettingsCoordinator, 'reconcileProviders' as any).mockReturnValue({ changed: true, invalidatedConversations: [] });

      const plugin = createPlugin();
      const manager = plugin.getAllViews()[0].getTabManager() as unknown as {
        cancelStreamingTabsForProviders: jest.Mock;
        restartRuntimeTabsForProviders: jest.Mock;
      };

      await new EnvironmentApplyService(plugin).apply('shared', 'NEW');

      expect(manager.cancelStreamingTabsForProviders).toHaveBeenCalledWith(['claude']);
      expect(manager.restartRuntimeTabsForProviders).toHaveBeenCalledWith(['claude'], true);
    });
    ```
  - Rewrite the Task 2.3 ordering characterization to drive the two manager methods (managers, not tabs, carry the ordering now):
    ```ts
    it('cancels every affected view before restarting any (env-apply ordering)', async () => {
      jest.spyOn(providerEnv, 'getEnvironmentVariablesForScope').mockReturnValue('OLD');
      jest.spyOn(providerEnv, 'setEnvironmentVariablesForScope').mockImplementation(() => undefined);
      jest.spyOn(ProviderRegistry, 'getRegisteredProviderIds').mockReturnValue(['claude']);
      jest.spyOn(ProviderSettingsCoordinator, 'handleEnvironmentChange' as any).mockImplementation(() => undefined);
      jest.spyOn(ProviderSettingsCoordinator, 'reconcileProviders' as any).mockReturnValue({ changed: false, invalidatedConversations: [] });

      const order: string[] = [];
      const managerFor = (name: string) => ({
        cancelStreamingTabsForProviders: jest.fn(() => { order.push(`cancel:${name}`); }),
        restartRuntimeTabsForProviders: jest.fn(() => { order.push(`restart:${name}`); return Promise.resolve(0); }),
      });
      const view1 = { getTabManager: () => managerFor('v1'), invalidateProviderCommandCaches: jest.fn(), refreshModelSelector: jest.fn() };
      const view2 = { getTabManager: () => managerFor('v2'), invalidateProviderCommandCaches: jest.fn(), refreshModelSelector: jest.fn() };
      const plugin = { ...createPlugin(), getAllViews: jest.fn().mockReturnValue([view1, view2]) } as unknown as SpecoratorPlugin;

      await new EnvironmentApplyService(plugin).apply('shared', 'NEW');

      expect(order).toEqual(['cancel:v1', 'cancel:v2', 'restart:v1', 'restart:v2']);
    });
    ```
    Note the `getTabManager: () => managerFor(name)` mock returns a fresh object per call; the orchestration calls `getTabManager()` once per view via `collectTabManagers()` then reuses the collected managers, so both loops hit the SAME instances and the order array is stable.

- [ ] 5.7 Run the gate. Expected: PASS.
  ```bash
  npm run typecheck && npx jest tests/unit/app/environment/EnvironmentApplyService.test.ts tests/unit/features/chat/tabs/TabManager.test.ts
  ```

- [ ] 5.8 Commit:
  ```bash
  git add -A && git commit \
    -m "Phase 2 (5/7): move env resync into TabManager (cancel/restart TabsForProviders), route EnvironmentApplyService, drop SyncableTab" \
    -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" \
    -m "Claude-Session: https://claude.ai/code/session_01JogyQ4pDLBAxqPLRVBt8sX"
  ```

---

## Task 6 — Group D: `findTabByConversation` + `hasTab` + route `findConversationAcrossViews` and `WorkOrderActivityProvider`

The last two Group D methods. `findConversationAcrossViews` keeps its concrete `{ view: SpecoratorView; tabId }` return here (the annotation narrows in Task 7); only its *body* changes from a `getAllTabs()` scan to `findTabByConversation`. `WorkOrderActivityProvider` swaps its two `getTab(id)` existence checks for `hasTab(id)`.

**Files:**
- Modify: `src/core/types/PluginContext.ts` (`ChatTabManagerHandle` Group C queries)
- Modify: `src/features/chat/tabs/TabManager.ts` (Host-migration section)
- Modify: `src/main.ts` (`findConversationAcrossViews` body ~:813-826)
- Modify: `src/features/tasks/ui/WorkOrderActivityProvider.ts` (`closeTab` ~:152, `openItem` ~:168)
- Test: `tests/unit/features/chat/tabs/TabManager.test.ts`, `tests/unit/features/tasks/ui/WorkOrderActivityProvider.test.ts`, `tests/integration/main.test.ts`

Steps:

- [ ] 6.1 **Red — TabManager tests.** Add to the Group D block:
  ```ts
  describe('findTabByConversation / hasTab', () => {
    it('returns the first tab id bound to a conversation, else null', () => {
      const manager = createManager();
      (manager as any).tabs = new Map<string, any>([
        ['a', { id: 'a', conversationId: 'c-1' }],
        ['b', { id: 'b', conversationId: 'c-2' }],
      ]);

      expect(manager.findTabByConversation('c-2')).toEqual({ tabId: 'b' });
      expect(manager.findTabByConversation('missing')).toBeNull();
    });

    it('hasTab reflects open-tab membership', () => {
      const manager = createManager();
      (manager as any).tabs = new Map<string, any>([['a', { id: 'a' }]]);

      expect(manager.hasTab('a')).toBe(true);
      expect(manager.hasTab('z')).toBe(false);
    });
  });
  ```
  Run it. Expected: FAIL.
  ```bash
  npx jest tests/unit/features/chat/tabs/TabManager.test.ts -t "findTabByConversation / hasTab"
  ```

- [ ] 6.2 **Green — implement** in `TabManager.ts` (Host-migration section):
  ```ts
  /** First tab (in insertion order) bound to `conversationId`, or null. */
  findTabByConversation(conversationId: string): { tabId: TabId } | null {
    for (const tab of this.tabs.values()) {
      if (tab.conversationId === conversationId) return { tabId: tab.id };
    }
    return null;
  }

  /** Whether a tab with this id is currently open. */
  hasTab(tabId: string): boolean {
    return this.tabs.has(tabId);
  }
  ```
  (`TabId` = `string`, so `{ tabId: TabId }` satisfies the interface's `{ tabId: string }`.)

- [ ] 6.3 Add to `ChatTabManagerHandle` (Group C queries section, next to `hasTab`'s siblings):
  ```ts
    /** First open tab bound to a conversation, or null (neutral id shape). */
    findTabByConversation(conversationId: string): { tabId: string } | null;
    /** Whether a tab id is currently open. */
    hasTab(tabId: string): boolean;
  ```

- [ ] 6.4 Run the TabManager tests. Expected: PASS.
  ```bash
  npx jest tests/unit/features/chat/tabs/TabManager.test.ts -t "findTabByConversation / hasTab"
  ```

- [ ] 6.5 **Route `findConversationAcrossViews`** in `src/main.ts` — change the BODY only; keep the concrete `SpecoratorView` return annotation (narrowed in Task 7):
  ```ts
  findConversationAcrossViews(conversationId: string): { view: SpecoratorView; tabId: string } | null {
    for (const view of this.getAllViews()) {
      const match = view.getTabManager()?.findTabByConversation(conversationId);
      if (match) return { view, tabId: match.tabId };
    }
    return null;
  }
  ```

- [ ] 6.6 **Route `WorkOrderActivityProvider`** in `src/features/tasks/ui/WorkOrderActivityProvider.ts`:
  - `closeTab` (~:152): `if (!manager?.getTab(tabId)) continue;` → `if (!manager?.hasTab(tabId)) continue;`
  - `openItem` (~:168): `if (!manager?.getTab(item.sidepanelTabId)) continue;` → `if (!manager?.hasTab(item.sidepanelTabId)) continue;`
  - `collectClosableTabs` is unchanged — it already uses `listWorkOrderTabs` (Group C) and its `typeof manager?.listWorkOrderTabs !== 'function'` guard stays (a mock manager can still omit the method; pinned by the existing "cannot enumerate them" test).

- [ ] 6.7 **Update `WorkOrderActivityProvider` mocks** in `tests/unit/features/tasks/ui/WorkOrderActivityProvider.test.ts`:
  - `harness` (~:37): `getTabManager: () => ({ getTab: jest.fn(() => ({})), switchToTab })` → `getTabManager: () => ({ hasTab: jest.fn(() => true), switchToTab })`
  - `closableHarness` (~:230-231): replace
    ```ts
    const getTab = jest.fn((id: string) => (id === 'tab-1' || id === 'tab-2' ? {} : null));
    const manager = { getTab, switchToTab: jest.fn(), closeTab, listWorkOrderTabs, ...overrides };
    ```
    with
    ```ts
    const hasTab = jest.fn((id: string) => id === 'tab-1' || id === 'tab-2');
    const manager = { hasTab, switchToTab: jest.fn(), closeTab, listWorkOrderTabs, ...overrides };
    ```

- [ ] 6.8 **Update the `findConversationAcrossViews` characterization** in `tests/integration/main.test.ts` (Task 2.5's `viewWithTabs`) to route through the new method — change the manager mock from `getAllTabs` to `findTabByConversation`:
  ```ts
      function viewWithTabs(convToTab: Record<string, string>, extra: Record<string, unknown> = {}) {
        return {
          leaf: { id: `leaf-${Math.random()}` },
          getTabManager: () => ({
            findTabByConversation: (id: string) => (id in convToTab ? { tabId: convToTab[id] } : null),
          }),
          ...extra,
        };
      }

      it('findConversationAcrossViews returns the owning view + tab id via findTabByConversation', () => {
        const view1 = viewWithTabs({ 'c-1': 't1' });
        const view2 = viewWithTabs({ 'c-2': 't2' });
        const ctx = { getAllViews: () => [view1, view2] } as unknown as SpecoratorPlugin;

        const result = SpecoratorPlugin.prototype.findConversationAcrossViews.call(ctx, 'c-2');

        expect(result).toEqual({ view: view2, tabId: 't2' });
        expect(SpecoratorPlugin.prototype.findConversationAcrossViews.call(ctx, 'missing')).toBeNull();
      });
  ```

- [ ] 6.9 Run the gate. Expected: PASS.
  ```bash
  npm run typecheck && npx jest tests/unit/features/chat/tabs/TabManager.test.ts tests/unit/features/tasks/ui/WorkOrderActivityProvider.test.ts && npx jest tests/integration/main.test.ts -t "host-migration characterization" --selectProjects integration
  ```

- [ ] 6.10 Commit:
  ```bash
  git add -A && git commit \
    -m "Phase 2 (6/7): add TabManager.findTabByConversation + hasTab, route findConversationAcrossViews + WorkOrderActivityProvider through them" \
    -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" \
    -m "Claude-Session: https://claude.ai/code/session_01JogyQ4pDLBAxqPLRVBt8sX"
  ```

---

## Task 7 — Narrow the return types (the final compile gate)

Flip `getAllViews()` and `findConversationAcrossViews`'s `.view` to `ChatViewHandle`. Any consumer still reaching a `SpecoratorView`/`TabData`-only member via these now fails typecheck — the whole point of doing it last. Two known deep-reach cousins survive by re-narrowing `cross.view` with the existing `isSpecoratorView` duck-type predicate (behavior-preserving: every live view IS a `SpecoratorView` in Phase 2; these guards are the exact Phase-4 seams the design flags for the feedback / work-order-commit "rebase onto the owning tab" change). `getView()` (singular) stays concrete — see "Deferred to Phase 4".

**Files:**
- Modify: `src/main.ts` (`getAllViews` ~:808, `findConversationAcrossViews` ~:813; import `ChatViewHandle`)
- Modify: `src/features/chat/SpecoratorView.ts` (work-order-bridge `findConversationTab` callback ~:617-622; import `isSpecoratorView`)
- Modify: `src/features/chat/feedback/sendFeedbackPrompt.ts` (~:30-34; import `isSpecoratorView`)
- Test: full suite is the gate; add one cross-view targeting regression for `sendFeedbackPrompt`.

Steps:

- [ ] 7.1 In `src/main.ts`, import `ChatViewHandle` (extend the existing `PluginContext` import on line 58):
  ```ts
  import type { ChatViewHandle, PluginContext } from './core/types/PluginContext';
  ```

- [ ] 7.2 Pre-narrow the two `isSpecoratorView` cousins so they still compile once the return types flip.

  In `src/features/chat/SpecoratorView.ts`, add the import:
  ```ts
  import { isSpecoratorView } from './isSpecoratorView';
  ```
  and update the bridge's `findConversationTab` callback (~:617-622). The bridge requires a concrete `TabManager` (it calls `getTab`), so recover it via the predicate:
  ```ts
        findConversationTab: (conversationId) => {
          const cross = this.plugin.findConversationAcrossViews(conversationId);
          if (!cross) return null;
          const tabManager = cross.view === this
            ? this.tabManager
            : isSpecoratorView(cross.view) ? cross.view.getTabManager() : null;
          return { tabManager, tabId: cross.tabId };
        },
  ```

  In `src/features/chat/feedback/sendFeedbackPrompt.ts`, add the import and guard the concrete `getTab` reach (~:29-34):
  ```ts
  import { isSpecoratorView } from '../isSpecoratorView';
  ```
  ```ts
    if (conversationId) {
      const cross = plugin.findConversationAcrossViews(conversationId);
      if (cross && isSpecoratorView(cross.view)) {
        targetTab = cross.view.getTabManager()?.getTab(cross.tabId) ?? targetTab;
      }
    }
  ```
  (`TabManager.ts:632-637` and `SpecoratorView.ts:753-754` need NO change: they use only `.view.leaf` (now on `ChatViewHandle`), `.view.getTabManager()?.switchToTab` (Group C), and reference-identity comparisons — see the Self-Review comparability note.)

- [ ] 7.3 **Flip the annotations** in `src/main.ts`. `getAllViews` (~:808):
  ```ts
  getAllViews(): ChatViewHandle[] {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_SPECORATOR);
    return leaves.map(leaf => leaf.view).filter(isSpecoratorView);
  }
  ```
  `findConversationAcrossViews` (~:813) — return-type `.view` only:
  ```ts
  findConversationAcrossViews(conversationId: string): { view: ChatViewHandle; tabId: string } | null {
    for (const view of this.getAllViews()) {
      const match = view.getTabManager()?.findTabByConversation(conversationId);
      if (match) return { view, tabId: match.tabId };
    }
    return null;
  }
  ```
  Leave `getView(): SpecoratorView | null` (~:803) UNCHANGED (deferred to Phase 4).

- [ ] 7.4 **Typecheck is the gate.** Expected: PASS. If it fails, the error names the exact remaining non-interface reach — fix it by adding a core-safe handle method (Group D pattern) or an `isSpecoratorView` guard, never by widening a core signature with a feature type.
  ```bash
  npm run typecheck
  ```

- [ ] 7.5 **Regression — cross-view feedback still targets the owning tab.** In `tests/unit/features/chat/feedback/` add/extend a test (create the file if absent, mirroring the existing feedback test harness) proving the `isSpecoratorView` guard preserves cross-view targeting:
  ```ts
  import { sendFeedbackPrompt } from '@/features/chat/feedback/sendFeedbackPrompt';

  it('sends the feedback turn on the cross-view tab that owns the conversation', () => {
    const sendMessage = jest.fn();
    const ownerTab = { controllers: { inputController: { sendMessage } } };
    const activeView = { getTabManager: () => ({ getActiveTab: () => null }) };
    const ownerView = { getTabManager: () => ({ getTab: (id: string) => (id === 't7' ? ownerTab : null) }) };
    const plugin = {
      getView: () => activeView,
      findConversationAcrossViews: () => ({ view: ownerView, tabId: 't7' }),
    } as any;

    sendFeedbackPrompt(plugin, {} as any, 'c-7', 'up');

    expect(sendMessage).toHaveBeenCalledWith({ content: expect.any(String) });
  });
  ```
  Note `ownerView` is a duck-typed object with `getTabManager` — `isSpecoratorView` (duck-type on `getTabManager`) passes, matching production. Run it. Expected: PASS.
  ```bash
  npx jest tests/unit/features/chat/feedback -t "cross-view tab that owns the conversation"
  ```

- [ ] 7.6 **Full gate.** Expected: all green.
  ```bash
  npm run typecheck && npm run lint && npm run test && npm run build
  ```

- [ ] 7.7 Commit:
  ```bash
  git add -A && git commit \
    -m "Phase 2 (7/7): narrow getAllViews()/findConversationAcrossViews to ChatViewHandle; isSpecoratorView guards for the two deep-reach cousins" \
    -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" \
    -m "Claude-Session: https://claude.ai/code/session_01JogyQ4pDLBAxqPLRVBt8sX"
  ```

---

## Self-Review

### Spec coverage — every `getAllViews()` consumer + cousin routed through the interface

| Consumer | Group | Interface member used post-migration | Task |
|---|---|---|---|
| `EnvironmentApplyService.refreshAffectedViews:166`, `providerWidgets:35`, `customModelsCommitHooks:31`, `CustomContextLimits:135`, `SpecoratorSettings:293`, `claudeSettingsWidgets:181`, `opencodeSettingsWidgets:38`, `OpencodeChatRuntime:1010` | A | `refreshModelSelector` / `invalidateProviderCommandCaches` (already on `ChatViewHandle`) | — (no change) |
| `main.ts:271`, `GeneralTabSections:62` | B | `refreshProviderAvailability()` | 1 |
| `GeneralTabSections:87` | B | `updateLayoutForPosition()` | 1 |
| `GeneralTabSections:120` | B | `refreshTabControls()` | 1 |
| `GeneralTabSections:144` | B | `applyEditedFilesSetting()` | 1 |
| `PluginViewActivator:98` | B/C | `areTabsRestored()` + `countTabsByKind()` | 1 |
| `PluginLifecycle.persistOpenTabStates:46` | C | `getPersistedState()` | 1 |
| `WorkOrderActivityProvider:132` | C | `listWorkOrderTabs()` | 1 |
| `WorkOrderActivityProvider:150,166` (reveal) | B/C | `leaf` + `switchToTab()` + `closeTab()` | 1, 6 |
| `PluginLifecycle.shutdownActiveRuntimes:31` | D | `disposeAllRuntimes()` | 3 |
| `main.ts quiesce/repair:718,735` | D | `quiesceTabsForConversation()` / `repairTabsForConversation()` | 4 |
| `EnvironmentApplyService.syncAffectedTabs:99` | D | `cancelStreamingTabsForProviders()` / `restartRuntimeTabsForProviders()` | 5 |
| `main.ts findConversationAcrossViews:814` | D | `findTabByConversation()` | 6 |
| `WorkOrderActivityProvider:150,166` (existence) | D→neutral | `hasTab()` | 6 |
| `findConversationAcrossViews().view` cousins: `TabManager:633`, `SpecoratorView bridge:620` + `:754`, `sendFeedbackPrompt:32` | narrowing | `leaf`/`switchToTab` on handle; `isSpecoratorView` guards for concrete reach | 7 |

Deferred (explicit, with rationale in the header): `getView()` singular retyping, `EnvSnippetManager.ts:442`.

### Placeholder scan
No `TBD` / `add appropriate…` / `similar to above`. Every interface addition, every moved method body, and every test is written in full. The moved env-resync bodies (`resyncTabRuntime` / `syncTabRuntimeState` / `resolveExternalContextPaths`) are the verbatim `EnvironmentApplyService` originals with `SyncableTab` → `TabData`.

### Type-consistency (identical names/signatures across every task)

Final `ChatTabManagerHandle` additions (assembled across Tasks 1, 3, 4, 5, 6):
```ts
// Group C (Task 1 + 6)
countTabsByKind(kind: 'chat' | 'work-order'): number;
listWorkOrderTabs(): Array<{ id: string; title: string; isStreaming: boolean }>;
getPersistedState(): AppTabManagerState;
hasTab(tabId: string): boolean;
closeTab(tabId: string, force?: boolean): Promise<boolean>;
switchToTab(tabId: string): Promise<void>;
findTabByConversation(conversationId: string): { tabId: string } | null;
// Group D (Tasks 3–5)
disposeAllRuntimes(): void;
quiesceTabsForConversation(conversationId: string): Promise<void>;
repairTabsForConversation(conversationId: string): Promise<void>;
cancelStreamingTabsForProviders(providerIds: ProviderId[]): void;
restartRuntimeTabsForProviders(providerIds: ProviderId[], changed: boolean): Promise<number>;
```
Final `ChatViewHandle` additions (Task 1): `leaf: WorkspaceLeaf`, `refreshProviderAvailability(): Promise<void>`, `updateLayoutForPosition(): void`, `refreshTabControls(): void`, `applyEditedFilesSetting(): void`, `areTabsRestored(): boolean`.

Every `TabManager` implementation returns a type assignable to its interface member: `TabId`→`string`, `TabKind`→`'chat'|'work-order'`, `PersistedTabManagerState`→`AppTabManagerState` (field-identical). `SpecoratorView.getTabManager(): TabManager` satisfies `getTabManager(): ChatTabManagerHandle` because `TabManager` structurally implements every handle member after Task 6; `implements ChatViewHandle` (Task 1) is the compile-time assertion, re-checked by the typecheck gate in Tasks 3–7 as the handle grows.

### Core-safety
No `core/` signature references `TabData`, `TabKind`, `PersistedTabManagerState`, `ChatState`, `TabControllers`, or `ui.*`. Group D bodies live in `TabManager` (`features/`). `EnvironmentApplyService` drops its `TabData` import entirely. `WorkspaceLeaf` and `AppTabManagerState` are legitimate core-visible types (obsidian API + `core/providers/types`).

### Known risks / judgment calls (flagged for review)

1. **`disposeAllRuntimes` guard (highest-attention item).** It replicates the `tab.service`-only guard — deliberately broader than `broadcastToTabs` (`tab.service && tab.serviceInitialized`). Pinned by the Task 3.1 TabManager test asserting a `serviceInitialized:false` tab is still cleaned up. If a future reader "unifies" the two guards, that test fails — intentionally.
2. **Env-resync split into two methods** (`cancelStreamingTabsForProviders` + `restartRuntimeTabsForProviders`) is a judgment call. It exactly preserves the original "cancel every affected tab across all views, THEN restart" ordering under multi-view splits. The simpler single-method-per-manager alternative (`resyncTabsForProviders`) would interleave to cancel1,restart1,cancel2,restart2 — functionally equivalent for independent runtimes but an observable ordering change a characterization test could trip. I chose fidelity; flag if you'd prefer the single method.
3. **Micro-deviation in affected-set capture.** The original captures ONE global affected-tabs list, then cancels/resyncs it. The refactor recomputes the affected set per manager (each captured before its awaits). Because the cancel pass is fully synchronous, the only difference is the theoretical case of a tab being created on a *different* view during another view's mid-restart await — not covered by any test and arguably more-correct. Documented, not tested.
4. **`TabManager.ts:633` `crossViewResult.view === this.view` comparability.** After narrowing, this compares `ChatViewHandle` (from the narrowed return) against `TabManagerViewHost` (`this.view`). They overlap on `getTabManager` and `leaf`, so TS permits the `===` (no TS2367). Contingency if a compiler version disagrees: compare `crossViewResult.view.leaf === this.view.leaf` (behavior-equivalent — each live view owns exactly one leaf). Not expected to be needed; noted so the executor isn't surprised.
5. **`isSpecoratorView` on `cross.view`** (Task 7) is behavior-preserving in Phase 2 (every view is a `SpecoratorView`; the guard always passes) but is a *lie* for a future `TeamChatView` (the predicate is a `value is SpecoratorView` duck-type on `getTabManager`). This is intentional and pre-existing; these two guards (`sendFeedbackPrompt`, the work-order-bridge callback) are precisely the sites the design §2 calls out for the Phase-4 "rebase callbacks onto the owning tab" change. They are safe now and clearly marked for then.
6. **Group D command shapes were chosen, not dictated by the research doc** (which listed candidate names). Concretely: `disposeAllRuntimes(): void` (sync fire-and-forget, matching the original), `quiesce/repairTabsForConversation(id): Promise<void>`, the two-method env split above, `findTabByConversation(id): { tabId: string } | null`, and `hasTab(id): boolean` (a boolean existence check replacing the `getTab(id)` truthiness test — the neutral "work-order tab accessor" the research doc asked for without returning `TabData`). Review these names/signatures — they are the durable public surface a second host view will build on.
