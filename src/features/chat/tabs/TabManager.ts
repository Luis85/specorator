import { Notice } from 'obsidian';

import { ProviderRegistry } from '../../../core/providers/ProviderRegistry';
import { hasForkSupport } from '../../../core/providers/typeGuards';
import { DEFAULT_CHAT_PROVIDER_ID, type ProviderId } from '../../../core/providers/types';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import type { SlashCommand } from '../../../core/types';
import type { Conversation } from '../../../core/types/chat';
import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import { chooseForkTarget } from '../../../shared/modals/ForkTargetModal';
import { revealWorkspaceLeaf } from '../../../utils/obsidianCompat';
import { getTabProviderId } from './providerResolution';
import {
  activateTab,
  createTab,
  destroyTab,
  type ForkContext,
  getTabTitle,
  initializeTabControllers,
  initializeTabUI,
  wireTabInputEvents,
} from './Tab';
import { mountTabChrome } from './tabChromeMount';
import { mountTabComposer } from './tabComposerMount';
import { TabProviderCommandCoordinator } from './TabProviderCommandCoordinator';
import { activateOpenConversationTab, applyPostActivateAction, deactivatePreviousTab } from './tabSwitchHelpers';
import {
  DEFAULT_MAX_CHAT_TABS,
  MAX_TABS,
  MAX_WORK_ORDER_TABS,
  MIN_TABS,
  MIN_WORK_ORDER_TABS,
  type PersistedTabManagerState,
  type PersistedTabState,
  type TabBarItem,
  type TabData,
  type TabId,
  type TabKind,
  type TabManagerCallbacks,
  type TabManagerInterface,
  type TabManagerViewHost,
} from './types';

function isTabManagerViewHost(value: unknown): value is TabManagerViewHost {
  return !!value
    && typeof value === 'object'
    && 'getTabManager' in (value as Record<string, unknown>);
}

type CreateTabOptions = {
  activate?: boolean;
  draftModel?: string;
  /**
   * Tab-pinned model for task-run tabs. Persists through runtime init so the
   * ModelSelector keeps displaying the work-order model and `queryOptions.model`
   * applies on every turn (not just the first).
   */
  pinnedModel?: string;
  bypassTabLimit?: boolean;
  defaultProviderId?: ProviderId;
  /** Tab kind. Defaults to 'chat' when omitted. Immutable after creation. */
  kind?: TabKind;
};

type OpenConversationOptions = {
  preferNewTab?: boolean;
  /**
   * Require a fresh tab — never hijack the active tab. When the tab cap is
   * already reached, surface a Notice and abort instead of switching the
   * current tab's conversation (which would close any running session in it).
   * Used by Agent Board "Open conversation" so a click on a paused work-order
   * card can't kill an unrelated streaming chat.
   */
  requireNewTab?: boolean;
  activate?: boolean;
};

/**
 * TabManager coordinates multiple chat tabs.
 */
export class TabManager implements TabManagerInterface {
  private plugin: SpecoratorPlugin;
  private containerEl: HTMLElement;
  private view: TabManagerViewHost;

  private tabs: Map<TabId, TabData> = new Map();
  private activeTabId: TabId | null = null;
  private callbacks: TabManagerCallbacks;
  private commandCoordinatorInstance: TabProviderCommandCoordinator | null = null;
  private isRestoringState = false;

  /** False for Team Chat: closing the last chat tab won't auto-mint a blank home tab (its empty state is the roster, not an unbound composer). Also gates the future T7 LRU-eviction close. */
  autoCreateOnEmpty = true;

  /** Guard to prevent concurrent tab switches. */
  private isSwitchingTab = false;

  /** Serializes create/switch/close/open mutations across concurrent callers. */
  private tabMutationTail: Promise<void> = Promise.resolve();

  /** In-flight tab creations reserved against the per-kind cap. */
  private pendingTabReservations = new Map<TabKind, number>();

  /** Set once destroy() begins. Every PUBLIC mutation entry point (createTab / switchToTab /
   *  closeTab / openConversation) rejects/no-ops on this BEFORE it enqueues, so a click or the
   *  cross-leaf rotation-close arriving during teardown can't append work behind destroy's
   *  drain and race destroyImpl. Public mutations ALWAYS enqueue (the depth-based inline path
   *  was removed Round-42 :118) and nested follow-ups call the `*Impl` variants directly, so
   *  this flag is the sole gate keeping late external mutations out. The memoized promise makes
   *  destroy() idempotent. */
  private isDestroying = false;
  private destroyPromise: Promise<void> | null = null;

  /**
   * Serializes every PUBLIC tab mutation onto `tabMutationTail`: each op waits for the prior one
   * to settle, so an external switch/close/open can never run against the half-built state of a
   * create SUSPENDED mid-hydration. It ALWAYS enqueues — the old `if (tabMutationDepth > 0)
   * return operation()` inline path (a reentrancy signal from when nested calls went through the
   * public methods) was only ever reached by an unrelated external mutation arriving while
   * another was suspended, and ran it inline racing that op (Round-42 :118). Nested follow-ups
   * do NOT come through here — they call the `*Impl` variants directly — so joining the tail
   * unconditionally can't self-deadlock.
   */
  private runTabMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tabMutationTail.then(() => operation());
    this.tabMutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private tryReserveTabSlot(kind: TabKind, bypassTabLimit?: boolean): boolean {
    const maxTabs = this.getMaxTabsFor(kind);
    const pending = this.pendingTabReservations.get(kind) ?? 0;
    if (this.countTabsByKind(kind) + pending >= maxTabs && !bypassTabLimit) {
      return false;
    }
    this.pendingTabReservations.set(kind, pending + 1);
    return true;
  }

  private releaseTabSlot(kind: TabKind): void {
    const pending = (this.pendingTabReservations.get(kind) ?? 0) - 1;
    if (pending <= 0) {
      this.pendingTabReservations.delete(kind);
      return;
    }
    this.pendingTabReservations.set(kind, pending);
  }

  /**
   * Returns the configured cap for a given tab kind. Chat and work-order draw
   * from independent budgets:
   *   - Chat: `maxChatTabs` setting, clamped to [MIN_TABS, MAX_TABS].
   *   - Work-order: derived from `agentBoardQueueCap` (the single Agent Board
   *     queue concurrency knob), clamped to [MIN_WORK_ORDER_TABS,
   *     MAX_WORK_ORDER_TABS] so the tab cap always matches the queue cap the
   *     user sees in Agent Board settings.
   */
  private getMaxTabsFor(kind: TabKind): number {
    if (kind === 'work-order') {
      const raw = this.plugin.settings.agentBoardQueueCap ?? 1;
      return Math.max(MIN_WORK_ORDER_TABS, Math.min(MAX_WORK_ORDER_TABS, raw));
    }
    const raw = this.plugin.settings.maxChatTabs ?? DEFAULT_MAX_CHAT_TABS;
    return Math.max(MIN_TABS, Math.min(MAX_TABS, raw));
  }

  /** Counts open tabs of the given kind. */
  countTabsByKind(kind: TabKind): number {
    let n = 0;
    for (const t of this.tabs.values()) if (t.kind === kind) n++;
    return n;
  }

  constructor(
    plugin: SpecoratorPlugin,
    containerEl: HTMLElement,
    view: TabManagerViewHost,
    callbacks?: TabManagerCallbacks,
  );
  constructor(
    plugin: SpecoratorPlugin,
    legacyArg: unknown,
    containerEl: HTMLElement,
    view: TabManagerViewHost,
    callbacks?: TabManagerCallbacks,
  );
  constructor(
    plugin: SpecoratorPlugin,
    arg2: unknown,
    arg3: HTMLElement | TabManagerViewHost,
    arg4?: TabManagerViewHost | TabManagerCallbacks,
    arg5: TabManagerCallbacks = {},
  ) {
    this.plugin = plugin;

    if (isTabManagerViewHost(arg3)) {
      this.containerEl = arg2 as HTMLElement;
      this.view = arg3;
      this.callbacks = (arg4 as TabManagerCallbacks | undefined) ?? {};
      return;
    }

    this.containerEl = arg3;
    this.view = arg4 as TabManagerViewHost;
    this.callbacks = arg5;
  }

  /**
   * Lazily builds the provider command coordinator. A getter (not constructor
   * wiring) keeps it resolvable through the overloaded constructor's two init
   * paths and for prototype-only test instances; the deps are live accessors so
   * it always sees the current tab set / active tab.
   */
  private get commandCoordinator(): TabProviderCommandCoordinator {
    if (!this.commandCoordinatorInstance) {
      this.commandCoordinatorInstance = new TabProviderCommandCoordinator({
        plugin: this.plugin,
        getTabs: () => this.tabs,
        getActiveTabId: () => this.activeTabId,
        getActiveTab: () => this.getActiveTab(),
        filterTabsByProvider: (providerIds, resolve) =>
          this.filterTabsByProvider(providerIds, resolve),
      });
    }
    return this.commandCoordinatorInstance;
  }

  // ============================================
  // Tab Lifecycle
  // ============================================

  /**
   * Inherit the active tab's provider so a new blank tab picks up its model,
   * unless the caller pins an explicit provider (e.g. an Agent Board task run)
   * or the tab loads an existing conversation (which carries its own provider).
   */
  private resolveDefaultProviderId(
    options: CreateTabOptions,
    conversation: Conversation | undefined,
  ): ProviderId | undefined {
    if (options.defaultProviderId) return options.defaultProviderId;
    if (conversation) return undefined;
    const activeTab = this.getActiveTab();
    return activeTab ? getTabProviderId(activeTab, this.plugin) : undefined;
  }

  /** Split the tab's initial model: an explicit caller pin (e.g. a work-order
   * run) forces the per-turn `queryOptions.model`; a bound agent's model is a
   * display-only seed instead — shown in the ModelSelector but never a query
   * override, so the per-turn model resolves live and mid-session edits apply. */
  private async resolveInitialModels(
    options: CreateTabOptions,
    conversation: Conversation | undefined,
  ): Promise<{ pinnedModel?: string; displayModel?: string }> {
    if (options.pinnedModel) return { pinnedModel: options.pinnedModel };
    if (!conversation?.boundAgentId) return {};
    const projection = await this.plugin.resolveBoundAgent?.(
      conversation.boundAgentId,
      conversation.providerId,
    );
    return { displayModel: projection?.model?.trim() || undefined };
  }

  /**
   * Creates a new tab.
   * @param conversationId Optional conversation to load into the tab.
   * @param tabId Optional tab ID (for restoration).
   * @param options Controls whether the new tab becomes active immediately.
   * @returns The created tab, or null if max tabs reached.
   */
  async createTab(
    conversationId?: string | null,
    tabId?: TabId,
    options: CreateTabOptions = {},
  ): Promise<TabData | null> {
    // Reject creates ISSUED after teardown began so one can't enqueue behind destroy's
    // drain and mount a tab into a cleared manager. A create already enqueued BEFORE
    // destroy still completes and is disposed by destroy (:1095). Unconditional on
    // isDestroying — nested creates use createTabImpl directly, not this path (:120).
    if (this.isDestroying) return null;
    return this.runTabMutation(() => this.createTabImpl(conversationId, tabId, options));
  }

  private async createTabImpl(
    conversationId?: string | null,
    tabId?: TabId,
    options: CreateTabOptions = {},
  ): Promise<TabData | null> {
    const kind: TabKind = options.kind ?? 'chat';
    if (!this.tryReserveTabSlot(kind, options.bypassTabLimit)) {
      return null;
    }

    try {
      const { activate = true, draftModel } = options;

      const conversation = conversationId
        ? await this.plugin.getConversationById(conversationId)
        : undefined;

      const defaultProviderId = this.resolveDefaultProviderId(options, conversation ?? undefined);
      const { pinnedModel, displayModel } = await this.resolveInitialModels(options, conversation ?? undefined);

      const tab = createTab({
        plugin: this.plugin,
        containerEl: this.containerEl,
        conversation: conversation ?? undefined,
        tabId,
        ...(typeof draftModel === 'string' ? { draftModel } : {}),
        ...(typeof pinnedModel === 'string' ? { pinnedModel } : {}),
        ...(typeof displayModel === 'string' ? { displayModel } : {}),
        defaultProviderId,
        kind,
        onStreamingChanged: (isStreaming) => this.callbacks.onTabStreamingChanged?.(tab.id, isStreaming),
        onTitleChanged: (title) => this.callbacks.onTabTitleChanged?.(tab.id, title),
        onAttentionChanged: (needsAttention) => this.callbacks.onTabAttentionChanged?.(tab.id, needsAttention),
        onConversationIdChanged: (changedConversationId) => {
          // Sync tab.conversationId when conversation is lazily created
          tab.conversationId = changedConversationId;
          this.callbacks.onTabConversationChanged?.(tab.id, changedConversationId);
        },
      });

      // Provider-switch wiring shared by the Vue toolbar model picker and the
      // slash-command catalog refresh.
      const getProviderCatalogConfig = () => this.commandCoordinator.getProviderCatalogConfig(tab);
      const onProviderChanged = (providerId: ProviderId) => {
        this.callbacks.onTabProviderChanged?.(tab.id, providerId);
        void this.commandCoordinator.prewarmProviderTab(tab).catch(() => {});
      };

      // Mount the Vue composer island so its element handles are registered to
      // tab.dom.* BEFORE initializeTabUI builds the context managers into them.
      mountTabComposer(tab, this.plugin, this.view, { getProviderCatalogConfig, onProviderChanged });
      mountTabChrome(tab, this.plugin, this.view);
      initializeTabUI(tab, this.plugin, { getProviderCatalogConfig });

      initializeTabControllers(
        tab,
        this.plugin,
        this.view,
        (forkContext) => this.handleForkRequest(forkContext),
        (conversationId) => this.openConversation(conversationId),
        () => this.commandCoordinator.getProviderCatalogConfig(tab),
      );

      // Wire input event handlers
      wireTabInputEvents(tab, this.plugin);

      this.tabs.set(tab.id, tab);
      this.callbacks.onTabCreated?.(tab);

      if (!this.isRestoringState && (activate || !this.activeTabId)) {
        await this.switchToTabImpl(tab.id); // nested in this createTab mutation — not the guarded public path (:120)
      } else if (!this.isRestoringState) {
        this.commandCoordinator.maybePrimeProviderRuntime(tab);
      }

      this.plugin.events.emit('chat:tabs-changed', {
        openCount: this.tabs.size,
        chatCount: this.countTabsByKind('chat'),
        workOrderCount: this.countTabsByKind('work-order'),
      });
      return tab;
    } finally {
      this.releaseTabSlot(kind);
    }
  }

  /** Creates a background (non-activated) tab pinned to a provider/model for an Agent Board task run. */
  async createTaskRunTab(options: {
    providerId: ProviderId;
    model: string;
    conversationId?: string | null;
    workOrderPath?: string | null;
    /** Roster agent id to bind to the lazily-created conversation. */
    boundAgentId?: string | null;
  }): Promise<TabData | null> {
    // Do not steal focus: the work order run streams in a background tab so the
    // user stays on whatever tab/view they were on. They can switch to it manually.
    // pinnedModel persists past runtime init so the ModelSelector keeps showing
    // the work-order model and queryOptions.model applies on every turn.
    const tab = await this.createTab(options.conversationId ?? undefined, undefined, {
      activate: false,
      draftModel: options.model,
      pinnedModel: options.model,
      defaultProviderId: options.providerId,
      kind: 'work-order',
    });
    if (tab) {
      tab.workOrderPath = options.workOrderPath ?? null;
      tab.boundAgentId = options.boundAgentId ?? null;
    }
    return tab;
  }

  /**
   * Switches to a different tab.
   * @param tabId The tab to switch to.
   */
  async switchToTab(tabId: TabId): Promise<void> {
    if (this.isDestroying) return; // no-op an external switch issued after teardown began (:120)
    return this.runTabMutation(() => this.switchToTabImpl(tabId));
  }

  private async switchToTabImpl(tabId: TabId): Promise<void> {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      return;
    }

    this.isSwitchingTab = true;
    const previousTabId = this.activeTabId;

    try {
      deactivatePreviousTab(this.tabs, previousTabId, tabId);

      // Activate new tab
      this.activeTabId = tabId;
      activateTab(tab);

      await applyPostActivateAction(this.plugin, tab);

      this.callbacks.onTabSwitched?.(previousTabId, tabId);
      this.commandCoordinator.maybePrimeProviderRuntime(tab);
    } finally {
      this.isSwitchingTab = false;
    }
  }

  /**
   * Closes a tab.
   * @param tabId The tab to close.
   * @param force If true, close even if streaming.
   * @returns True if the tab was closed.
   */
  async closeTab(tabId: TabId, force = false): Promise<boolean> {
    if (this.isDestroying) return false; // no-op an external close issued after teardown began (:120)
    return this.runTabMutation(() => this.closeTabImpl(tabId, force));
  }

  private async closeTabImpl(tabId: TabId, force = false): Promise<boolean> {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      return false;
    }

    // Don't close if streaming unless forced
    if (tab.state.isStreaming && !force) {
      return false;
    }

    // If this is the last tab and it's already empty (no conversation),
    // don't close it - it's already a blank draft container.
    if (this.tabs.size === 1 && !tab.conversationId && tab.state.messages.length === 0) {
      return false;
    }

    // Save conversation before closing
    await tab.controllers.conversationController?.save();

    // Capture tab order BEFORE deletion for fallback calculation
    const tabIdsBefore = Array.from(this.tabs.keys());
    const closingIndex = tabIdsBefore.indexOf(tabId);

    // Destroy tab resources (async for proper cleanup)
    await destroyTab(tab);
    this.commandCoordinator.forgetTab(tabId);
    this.tabs.delete(tabId);
    this.callbacks.onTabClosed?.(tabId);
    this.plugin.events.emit('chat:tabs-changed', {
      openCount: this.tabs.size,
      chatCount: this.countTabsByKind('chat'),
      workOrderCount: this.countTabsByKind('work-order'),
    });

    const closedActiveTab = this.activeTabId === tabId;
    if (closedActiveTab) {
      this.activeTabId = null;
    }

    // Closing the last chat tab must never strand the user. A hidden work-order
    // tab keeps `tabs.size > 0`, so the blank-replacement path would not fire and
    // the user would be left on a hidden work-order tab with no chat tab to
    // return to (the tab bar renders chat badges only, and a terminal work order
    // drops out of the activity dropdown). Recreate a blank chat home tab
    // whenever none remain — activate it only when we just closed the active tab,
    // otherwise keep focus put and let the tab bar surface the new chat badge as
    // the escape route. Skipped when autoCreateOnEmpty is off (Team Chat): its empty
    // state is the roster, so a blank unbound tab would be a stray ordinary chat.
    if (this.autoCreateOnEmpty && this.countTabsByKind('chat') === 0) {
      await this.createTabImpl(undefined, undefined, { activate: closedActiveTab });
      return true;
    }

    // If we closed the active tab, switch to another
    if (closedActiveTab && this.tabs.size > 0) {
      // Fallback strategy: prefer previous tab, except for first tab (go to next)
      const fallbackTabId = closingIndex === 0
        ? tabIdsBefore[1]  // First tab: go to next
        : tabIdsBefore[closingIndex - 1];  // Others: go to previous

      if (fallbackTabId && this.tabs.has(fallbackTabId)) {
        await this.switchToTabImpl(fallbackTabId); // nested in this close mutation — not the guarded public path (:120)
      }
    }

    return true;
  }

  // ============================================
  // Tab Queries
  // ============================================

  /** Gets the currently active tab. */
  getActiveTab(): TabData | null {
    return this.activeTabId ? this.tabs.get(this.activeTabId) ?? null : null;
  }

  /** Gets the active tab ID. */
  getActiveTabId(): TabId | null {
    return this.activeTabId;
  }

  /** Gets a tab by ID. */
  getTab(tabId: TabId): TabData | null {
    return this.tabs.get(tabId) ?? null;
  }

  /** Gets all tabs. */
  getAllTabs(): TabData[] {
    return Array.from(this.tabs.values());
  }

  /** Gets the number of tabs. */
  getTabCount(): number {
    return this.tabs.size;
  }

  /** Checks if more tabs of a given kind can be created. Defaults to chat. */
  canCreateTab(kind: TabKind = 'chat'): boolean {
    return this.countTabsByKind(kind) < this.getMaxTabsFor(kind);
  }

  /**
   * Returns tabs ordered chat-first then work-order, preserving insertion order
   * within each group. The tab bar renderer and prev/next navigation consume
   * this ordered view so cycling goes chat → chat → … → WO → WO → chat.
   */
  getOrderedTabs(): TabData[] {
    const chat: TabData[] = [];
    const wo: TabData[] = [];
    for (const t of this.tabs.values()) {
      (t.kind === 'work-order' ? wo : chat).push(t);
    }
    return [...chat, ...wo];
  }

  // ============================================
  // Tab Bar Data
  // ============================================

  /** Gets data for rendering the tab bar. */
  /**
   * Open work-order tabs with their display titles. Work-order badges are hidden
   * from the visible tab bar, so the Work Orders dropdown uses this to offer a
   * close affordance for finished/orphaned work-order tabs that would otherwise
   * be invisible and keep consuming the work-order slot budget. `isStreaming`
   * lets the dropdown skip a live run whose note hasn't persisted its active
   * status yet, so an in-flight run is never offered a "finished" close.
   */
  listWorkOrderTabs(): Array<{ id: string; title: string; isStreaming: boolean }> {
    const out: Array<{ id: string; title: string; isStreaming: boolean }> = [];
    for (const tab of this.getOrderedTabs()) {
      if (tab.kind !== 'work-order') continue;
      out.push({ id: tab.id, title: getTabTitle(tab, this.plugin), isStreaming: tab.state.isStreaming });
    }
    return out;
  }

  getTabBarItems(): TabBarItem[] {
    const items: TabBarItem[] = [];
    let index = 1;

    for (const tab of this.getOrderedTabs()) {
      if (tab.kind === 'work-order') continue;
      items.push({
        id: tab.id,
        index: index++,
        title: getTabTitle(tab, this.plugin),
        providerId: getTabProviderId(tab, this.plugin),
        isActive: tab.id === this.activeTabId,
        isStreaming: tab.state.isStreaming,
        needsAttention: tab.state.needsAttention,
        canClose: this.tabs.size > 1 || !tab.state.isStreaming,
        kind: tab.kind,
        isAgentBound: Boolean(
          tab.conversationId && this.plugin.getConversationSync(tab.conversationId)?.boundAgentId,
        ),
      });
    }

    return items;
  }

  // ============================================
  // Conversation Management
  // ============================================

  /**
   * Opens a conversation in a new tab or existing tab.
   * @param conversationId The conversation to open.
   * @param options Controls tab creation behavior (backward-compatible with boolean).
   */
  async openConversation(
    conversationId: string,
    options: boolean | OpenConversationOptions = false,
  ): Promise<void> {
    if (this.isDestroying) return; // no-op an external open issued after teardown began (:120)
    return this.runTabMutation(() => this.openConversationImpl(conversationId, options));
  }

  private async openConversationImpl(
    conversationId: string,
    options: boolean | OpenConversationOptions = false,
  ): Promise<void> {
    const requireNewTab = typeof options === 'boolean'
      ? false
      : options.requireNewTab ?? false;
    const preferNewTab = typeof options === 'boolean'
      ? options
      : (options.preferNewTab ?? false) || requireNewTab;
    const activate = typeof options === 'boolean'
      ? true
      : options.activate ?? true;

    // Check if conversation is already open in this view's tabs
    for (const tab of this.tabs.values()) {
      if (tab.conversationId === conversationId) {
        await activateOpenConversationTab((id) => this.switchToTabImpl(id), tab, conversationId); // nested in this open mutation (:120)
        return;
      }
    }

    // Check if conversation is open in another view (split workspace scenario).
    // Compare owning leaves: each live view owns exactly one workspace leaf, so
    // this is reference-equivalent to comparing the views themselves, and it
    // stays valid now that findConversationAcrossViews returns the narrowed
    // ChatViewHandle (which no longer overlaps the concrete TabManagerViewHost).
    const crossViewResult = this.plugin.findConversationAcrossViews(conversationId);
    const isSameView = crossViewResult?.view.leaf === this.view.leaf;
    if (crossViewResult && !isSameView) {
      // Focus the other view and switch to its tab instead of opening duplicate
      await revealWorkspaceLeaf(this.plugin.app.workspace, crossViewResult.view.leaf);
      await crossViewResult.view.getTabManager()?.switchToTab(crossViewResult.tabId);
      return;
    }

    // Open in current tab or new tab
    if (preferNewTab && this.canCreateTab()) {
      await this.createTabImpl(conversationId, undefined, { activate });
      return;
    }
    // requireNewTab refuses to hijack the active tab: surface a Notice so the
    // user knows why nothing happened (vs silently closing their streaming
    // session) and abort. preferNewTab without the require flag still falls
    // through to the legacy in-place switch for backward compatibility.
    if (requireNewTab) {
      new Notice(t('chat.history.linkedNoFreeTab'));
      return;
    }
    // Open in current tab
    // Note: Don't set tab.conversationId here - the onConversationIdChanged callback
    // will sync it after successful switch. Setting it before switchTo() would cause
    // incorrect tab metadata if switchTo() returns early (streaming/switching/creating).
    const activeTab = this.getActiveTab();
    if (activeTab) {
      await activeTab.controllers.conversationController?.switchTo(conversationId);
    }
  }

  async createNewConversation(): Promise<void> {
    if (this.isDestroying) return; // no-op a new-conversation reset issued after teardown began (:120)
    return this.runTabMutation(() => this.createNewConversationImpl());
  }

  private async createNewConversationImpl(): Promise<void> {
    const activeTab = this.getActiveTab();
    if (activeTab) {
      await activeTab.controllers.conversationController?.createNew();
      activeTab.conversationId = activeTab.state.currentConversationId;
      this.commandCoordinator.maybePrimeProviderRuntime(activeTab);
    }
  }

  invalidateProviderCommandCaches(providerIds?: ProviderId | ProviderId[]): void {
    this.commandCoordinator.invalidateProviderCommandCaches(providerIds);
  }

  primeProviderRuntime(providerIds?: ProviderId | ProviderId[]): void {
    this.commandCoordinator.primeProviderRuntime(providerIds);
  }

  private *filterTabsByProvider(
    providerIds: ProviderId | ProviderId[] | undefined,
    resolve: (tab: TabData) => ProviderId,
  ): Iterable<TabData> {
    const filter = providerIds
      ? new Set(Array.isArray(providerIds) ? providerIds : [providerIds])
      : null;

    for (const tab of this.tabs.values()) {
      if (filter && !filter.has(resolve(tab))) {
        continue;
      }
      yield tab;
    }
  }

  // ============================================
  // Fork
  // ============================================

  private async handleForkRequest(context: ForkContext): Promise<void> {
    const target = await chooseForkTarget(this.plugin.app);
    if (!target) return;

    if (target === 'new-tab') {
      const tab = await this.forkToNewTab(context);
      if (!tab) {
        const maxTabs = this.getMaxTabsFor('chat');
        new Notice(t('chat.tabs.maxChatReached', { count: String(maxTabs) }));
        return;
      }
      new Notice(t('chat.fork.notice'));
    } else {
      const success = await this.forkInCurrentTab(context);
      if (!success) {
        new Notice(t('chat.fork.failed', { error: t('chat.fork.errorNoActiveTab') }));
        return;
      }
      new Notice(t('chat.fork.noticeCurrentTab'));
    }
  }

  async forkToNewTab(context: ForkContext): Promise<TabData | null> {
    const maxTabs = this.getMaxTabsFor('chat');
    if (this.countTabsByKind('chat') >= maxTabs) {
      return null;
    }

    const conversationId = await this.createForkConversation(context);
    try {
      return await this.createTab(conversationId, undefined, { kind: 'chat' });
    } catch (error) {
      await this.plugin.deleteConversation(conversationId).catch(() => {});
      throw error;
    }
  }

  async forkInCurrentTab(context: ForkContext): Promise<boolean> {
    const activeTab = this.getActiveTab();
    if (!activeTab?.controllers.conversationController) return false;

    const conversationId = await this.createForkConversation(context);
    try {
      await activeTab.controllers.conversationController.switchTo(conversationId);
    } catch (error) {
      await this.plugin.deleteConversation(conversationId).catch(() => {});
      throw error;
    }
    return true;
  }

  private async createForkConversation(context: ForkContext): Promise<string> {
    const conversation = await this.plugin.createConversation({
      providerId: context.providerId,
    });

    const title = context.sourceTitle
      ? this.buildForkTitle(context.sourceTitle, context.forkAtUserMessage)
      : undefined;

    // Capability invariant (forkSupportInvariant.test.ts): the `forkSupport`
    // slot is present iff `capabilities.supportsFork === true`. The fork
    // affordance is hidden upstream when supportsFork is false, so an absent
    // slot here means no provider state to build — emit empty.
    const historyService = ProviderRegistry.getConversationHistoryService(conversation.providerId);
    const forkProviderState = hasForkSupport(historyService)
      ? historyService.forkSupport.buildForkProviderState(
        context.sourceSessionId,
        context.resumeAt,
        context.sourceProviderState,
      )
      : {};

    await this.plugin.updateConversation(conversation.id, {
      messages: context.messages,
      providerState: forkProviderState,
      ...(title && { title }),
      ...(context.currentNote && { currentNote: context.currentNote }),
    });

    return conversation.id;
  }

  private buildForkTitle(sourceTitle: string, forkAtUserMessage?: number): string {
    const MAX_TITLE_LENGTH = 50;
    const forkSuffix = forkAtUserMessage ? ` (#${forkAtUserMessage})` : '';
    const forkPrefix = 'Fork: ';
    const maxSourceLength = MAX_TITLE_LENGTH - forkPrefix.length - forkSuffix.length;
    const truncatedSource = sourceTitle.length > maxSourceLength
      ? sourceTitle.slice(0, maxSourceLength - 1) + '…'
      : sourceTitle;
    let title = forkPrefix + truncatedSource + forkSuffix;

    const existingTitles = new Set(this.plugin.getConversationList().map(c => c.title));
    if (existingTitles.has(title)) {
      let n = 2;
      while (existingTitles.has(`${title} ${n}`)) n++;
      title = `${title} ${n}`;
    }

    return title;
  }

  // ============================================
  // Persistence
  // ============================================

  /** Gets the state to persist. */
  getPersistedState(): PersistedTabManagerState {
    const openTabs: PersistedTabState[] = [];

    for (const tab of this.tabs.values()) {
      openTabs.push({
        ...(tab.lifecycleState === 'blank' && tab.draftModel
          ? { draftModel: tab.draftModel }
          : {}),
        tabId: tab.id,
        conversationId: tab.conversationId,
        kind: tab.kind,
      });
    }

    return {
      openTabs,
      activeTabId: this.activeTabId,
    };
  }

  /** Restores state from persisted data. */
  async restoreState(state: PersistedTabManagerState): Promise<void> {
    this.isRestoringState = true;
    try {
      // Pre-warm conversation hydration in parallel. createTab below will call
      // getConversationById again, but BaseHistoryService dedupes concurrent
      // hydrations through its `inflight` map and short-circuits resolved
      // hydrations through the cache, so the second call returns the prior
      // outcome without re-reading the transcript. Without this the UI
      // freezes for the sum of every tab's transcript load.
      await Promise.all(
        state.openTabs
          .map((tabState) => tabState.conversationId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
          .map((id) => this.plugin.getConversationById(id).catch(() => null)),
      );

      // Create tabs from persisted state with error handling. createTab is
      // kept sequential because it mutates shared `this.tabs` and `TabBar`
      // ordering, but the slow await (conversation hydration) is already
      // resolved above so each iteration is now bound by sync DOM work only.
      for (const tabState of state.openTabs) {
        try {
          await this.createTab(tabState.conversationId, tabState.tabId, {
            activate: false,
            ...(typeof tabState.draftModel === 'string' ? { draftModel: tabState.draftModel } : {}),
            kind: tabState.kind ?? 'chat',
          });
        } catch {
          // Continue restoring other tabs
        }
      }
    } finally {
      this.isRestoringState = false;
    }

    const fallbackTabId = state.openTabs.find((tabState) => this.tabs.has(tabState.tabId))?.tabId
      ?? Array.from(this.tabs.keys())[0]
      ?? null;
    const targetTabId = state.activeTabId && this.tabs.has(state.activeTabId)
      ? state.activeTabId
      : fallbackTabId;

    // Switch to the previously active tab after all tabs are restored so background
    // restore does not warm the first restored tab by accident.
    if (targetTabId) {
      try {
        await this.switchToTab(targetTabId);
      } catch {
        // Ignore switch errors
      }
    }

    // If no tabs were restored, create a default one
    if (this.tabs.size === 0) {
      await this.createTab();
    }
  }

  // ============================================
  // SDK Commands (Shared)
  // ============================================

  /**
   * Gets provider-scoped SDK supported commands for a tab.
   * Reuses a ready runtime from the same provider when available to avoid
   * leaking commands across providers in mixed-provider workspaces.
   * @returns Array of SDK commands, or empty array if no service is ready.
   */
  getSdkCommands(tabId?: TabId): Promise<SlashCommand[]> {
    return this.commandCoordinator.getSdkCommands(tabId);
  }

  // ============================================
  // Broadcast
  // ============================================

  /**
   * Broadcasts a function call to all initialized tab runtimes.
   * Used by settings managers to apply configuration changes to all tabs.
   * @param fn Function to call on each runtime.
   */
  async broadcastToAllTabs(fn: (service: ChatRuntime) => Promise<void>): Promise<void> {
    await this.broadcastToTabs(this.tabs.values(), fn);
  }

  async broadcastToProviderTabs(
    providerIds: ProviderId | ProviderId[],
    fn: (service: ChatRuntime) => Promise<void>,
  ): Promise<void> {
    await this.broadcastToTabs(
      this.filterTabsByProvider(providerIds, (tab) => tab.service?.providerId ?? tab.providerId),
      fn,
    );
  }

  private async broadcastToTabs(
    tabs: Iterable<TabData>,
    fn: (service: ChatRuntime) => Promise<void>,
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const tab of tabs) {
      if (tab.service && tab.serviceInitialized) {
        promises.push(
          fn(tab.service).catch(() => {
            // Silently ignore broadcast errors
          })
        );
      }
    }

    await Promise.all(promises);
  }

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

  /**
   * Cancel in-flight streams on every tab whose active provider is in `providerIds`,
   * and return the ids of ALL affected tabs (streaming or not) as the frozen set to
   * restart. Split from the restart pass so the env-apply flow can cancel across ALL
   * views before restarting any — no view keeps streaming on a stale runtime during
   * another view's restart — and so restart operates on this frozen id set rather than
   * a live re-enumeration (a tab created afterwards has a new id and is left untouched).
   */
  cancelStreamingTabsForProviders(providerIds: ProviderId[]): string[] {
    const affectedIds: string[] = [];
    for (const [id, tab] of this.tabs) {
      if (!providerIds.includes(tab.providerId ?? DEFAULT_CHAT_PROVIDER_ID)) continue;
      affectedIds.push(id);
      if (tab.state.isStreaming) tab.controllers.inputController?.cancelStreaming();
    }
    return affectedIds;
  }

  /**
   * Re-sync + force-restart the runtimes of the given (already-cancelled) tab ids;
   * when `changed`, drop the session first. Skips ids whose tab was closed between the
   * cancel pass and here. Returns the count of restarts that threw; uninitialized tabs
   * count as success.
   */
  async restartRuntimeTabs(tabIds: string[], changed: boolean): Promise<number> {
    let failed = 0;
    for (const id of tabIds) {
      const tab = this.tabs.get(id);
      if (!tab) continue;
      if (!(await this.resyncTabRuntime(tab, changed))) failed++;
    }
    return failed;
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

  // ============================================
  // Cleanup
  // ============================================

  /** Destroys all tabs and cleans up resources. Drains any in-flight/queued tab
   *  mutation FIRST (a createTab suspended mid-hydration must insert its tab before
   *  teardown, not into a cleared map as a leaked runtime — :197). NOT via
   *  runTabMutation: destroy must DRAIN the existing tail then run destroyImpl exactly
   *  once, while `isDestroying` blocks any new public mutation from enqueueing after it
   *  (routing destroy through the tail could interleave it with a late external op —
   *  :1095). Memoized for idempotent concurrent teardown. */
  destroy(): Promise<void> {
    if (this.destroyPromise) return this.destroyPromise;
    this.isDestroying = true; // synchronously block creates issued after this point (createTab)
    this.destroyPromise = this.drainThenDestroy();
    return this.destroyPromise;
  }

  private async drainThenDestroy(): Promise<void> {
    // Drain in-flight/queued mutations (swallow rejections so one can't wedge
    // teardown), then destroy exactly once.
    await this.tabMutationTail.catch(() => undefined);
    await this.destroyImpl();
  }

  private async destroyImpl(): Promise<void> {
    // Save all conversations in parallel (independent per-tab)
    await Promise.all(
      Array.from(this.tabs.values()).map(
        tab => tab.controllers.conversationController?.save() ?? Promise.resolve()
      )
    );

    // Destroy all tabs in parallel (independent per-tab, must run after saves complete)
    await Promise.all(Array.from(this.tabs.values()).map(tab => destroyTab(tab)));

    this.tabs.clear();
    this.activeTabId = null;
  }
}
