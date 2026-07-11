import type { WorkspaceLeaf } from 'obsidian';
import { ItemView, Notice, Scope } from 'obsidian';
import { type App as VueApp, createApp, markRaw } from 'vue';

import type { ChatTabReservation } from '../../core/chatTabReservations';
import { GIT_COMMIT_PROMPT } from '../../core/prompt/gitCommit';
import { getHiddenProviderCommandSet } from '../../core/providers/commands/hiddenCommands';
import { ProviderRegistry } from '../../core/providers/ProviderRegistry';
import { ProviderSettingsCoordinator } from '../../core/providers/ProviderSettingsCoordinator';
import { DEFAULT_CHAT_PROVIDER_ID, type ProviderId } from '../../core/providers/types';
import { asSettingsBag, VIEW_TYPE_SPECORATOR } from '../../core/types';
import type { TabBarPosition } from '../../core/types/settings';
import { t } from '../../i18n/i18n';
import type SpecoratorPlugin from '../../main';
import { createProviderIconSvg } from '../../shared/icons';
import { openPluginSettingsTab } from '../../utils/obsidianPrivateApi';
import { rosterAgentToPersona } from '../agents/personaRegistry';
import { openQuickActionsModal } from '../quickActions/openQuickActionsModal';
import { dispatchQuickActionToTab } from '../quickActions/runQuickActionForFile';
import { resolveModelContextWindow } from '../settings/customModels/resolveModelContextWindow';
import type { HistoryConversationOpenState } from './controllers/ConversationController';
import {
  type HydrationFailedBannerPayload,
  registerHydrationFailedSubscriber,
} from './hydration/hydrationFailedSubscriber';
import { SpecoratorViewWorkOrderBridge } from './SpecoratorViewWorkOrderBridge';
import {
  getTabProviderId,
  getTabTitle,
  onProviderAvailabilityChanged,
  sendTabInputMessageFromExplicitEnterShortcut,
  updatePlanModeUI,
} from './tabs/Tab';
import { TabManager } from './tabs/TabManager';
import { refreshBoundAgentDisplayModels } from './tabs/tabShared';
import type { TabData, TabId, TaskRunTabHandle } from './tabs/types';
import { GitActionButton } from './ui/GitActionButton';
import type { ChatShellCallbacks, ChatShellSnapshot } from './ui/vue/chatShellCallbacks';
import { CALLBACKS_KEY, CONTENT_HOST_KEY, PLUGIN_KEY } from './ui/vue/chatShellKeys';
import ChatShellRoot from './ui/vue/ChatShellRoot.vue';
import { getChatShellPinia } from './ui/vue/globalPinia';
import type { ChatBoundAgent, ChatShellHeader } from './ui/vue/stores/chatShellStore';
import { WorkOrderActivityDropdown } from './ui/WorkOrderActivityDropdown';
import { deriveEditedFilesFromMessages } from './utils/editedFiles';
import { recalculateUsageForModel } from './utils/usageInfo';

type LoadableView = {
  containerEl?: HTMLElement;
  load: () => Promise<void> | void;
};

export class SpecoratorView extends ItemView {
  private plugin: SpecoratorPlugin;
  private _workOrderBridge: SpecoratorViewWorkOrderBridge | null = null;

  // Tab management
  private tabManager: TabManager | null = null;
  // False until restoreOrCreateTabs() finishes: the tab manager is assigned
  // before the async restore runs, so the Agent Board queue must not count the
  // live tab count during that window or it can overbook the cap / drop tabs.
  private tabsRestored = false;
  // The Vue-owned tab-content host, captured via CONTENT_HOST_KEY on mount. The
  // TabManager renders each tab's DOM into this element.
  private tabContentEl: HTMLElement | null = null;
  /** History hydration failures awaiting a bound tab to render their banner. */
  private pendingHydrationErrors = new Map<string, { code: string; message: string }>();

  // DOM Elements
  private viewContainerEl: HTMLElement | null = null;
  // Imperative widgets hosted into the Vue header via the mount* callbacks; they
  // stay imperative and persist across the empty<->content transition.
  private workOrderActivitySlotEl: HTMLElement | null = null;
  private workOrderActivityDropdown: WorkOrderActivityDropdown | null = null;
  private disposeWorkOrderActivitySubscription: (() => void) | null = null;
  private gitActionButton: GitActionButton | null = null;

  // History dropdown host (the `.specorator-history-menu` element) + its trigger
  // button, both supplied by the Vue HeaderActions via mountHistoryHost.
  private historyDropdown: HTMLElement | null = null;
  private historyBtn: HTMLElement | null = null;
  // Monotonic token so concurrent refreshBoundAgentChip calls don't race a stale
  // async agent resolution into the projection.
  private boundAgentChipGen = 0;

  // The Vue chat-shell island (one app per leaf; unmounted in onClose).
  private vueApp: VueApp | null = null;
  // View-owned snapshot observers: the shell's `subscribe` seam registers here
  // and each receives a fully-projected ChatShellSnapshot on every change.
  private chatShellObservers = new Set<(snapshot: ChatShellSnapshot) => void>();
  // Cached bound-agent chip (agent resolution is async): projected synchronously,
  // refreshed by refreshBoundAgentChip, and guarded against a stale conversation.
  private cachedBoundAgent: ChatBoundAgent | null = null;
  private cachedBoundAgentConversationId: string | null = null;

  // Debouncing for tab state persistence
  private pendingPersist: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: SpecoratorPlugin) {
    super(leaf);
    this.plugin = plugin;

    // Hover Editor compatibility: Define load as an instance method that can't be
    // overwritten by prototype patching. Hover Editor patches SpecoratorView.prototype.load
    // after our class is defined, but instance methods take precedence over prototype methods.
    const prototype = Object.getPrototypeOf(this) as LoadableView;
    // Cast the bound result: `Function.prototype.bind` is typed as returning
    // `any` under the marketplace validator's older TS lib (its no-unsafe-*
    // rules would fire without the cast). Our newer lib types bind precisely and
    // reads the cast as redundant, hence the targeted disable.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- required under the marketplace validator's older TS lib where bind() returns any
    const originalLoad = prototype.load.bind(this) as () => Promise<void> | void;
    Object.defineProperty(this, 'load', {
      value: async () => {
        // Ensure containerEl exists before any patched load code tries to use it
        if (!this.containerEl) {
          (this as LoadableView).containerEl = createDiv({ cls: 'view-content' });
        }
        // Wrap in try-catch to prevent Hover Editor errors from breaking our view
        try {
          return await originalLoad();
        } catch {
          // Hover Editor may throw if its DOM setup fails - continue anyway
        }
      },
      writable: false,
      configurable: false,
    });
  }

  getViewType(): string {
    return VIEW_TYPE_SPECORATOR;
  }

  getDisplayText(): string {
    return 'Specorator';
  }

  getIcon(): string {
    return 'bot';
  }

  /** Refreshes model-dependent UI across all tabs (used after settings/env changes). */
  refreshModelSelector(): void {
    for (const tab of this.tabManager?.getAllTabs() ?? []) {
      // onProviderAvailabilityChanged detaches any stale runtime synchronously
      // and tracks its async cleanup on the tab; initializeTabService awaits that
      // pending cleanup before constructing a replacement, so this fire-and-forget
      // call can never overlap the old CLI process with a new one.
      onProviderAvailabilityChanged(tab, this.plugin).catch((error) =>
        this.plugin.logger.scope('chat').error('provider-availability runtime cleanup failed', error),
      );
      const providerId = getTabProviderId(tab, this.plugin);
      const providerSettings = ProviderSettingsCoordinator.getProviderSettingsSnapshot(
        this.plugin.settings,
        providerId,
      );
      const model = providerSettings.model;
      const uiConfig = ProviderRegistry.getChatUIConfig(providerId);
      const capabilities = ProviderRegistry.getCapabilities(providerId);
      const contextWindow = resolveModelContextWindow(
        uiConfig,
        providerSettings,
        model,
        providerSettings.customContextLimits,
      );

      if (tab.state.usage) {
        tab.state.usage = recalculateUsageForModel(tab.state.usage, model, contextWindow);
      }

      tab.ui.modelSelector?.updateDisplay();
      tab.ui.modelSelector?.renderOptions();
      tab.ui.modeSelector?.updateDisplay();
      tab.ui.modeSelector?.renderOptions();
      tab.ui.thinkingBudgetSelector?.updateDisplay();
      tab.ui.permissionToggle?.updateDisplay();
      tab.ui.planModeToggle?.updateDisplay();
      tab.ui.serviceTierToggle?.updateDisplay();
      tab.dom.inputWrapper.toggleClass(
        'specorator-input-plan-mode',
        providerSettings.permissionMode === 'plan' && capabilities.supportsPlanMode,
      );
    }

    this.gitActionButton?.updateDisplay();
    this.tabManager?.primeProviderRuntime();
  }

  /**
   * Re-applies the "show files changed by the agent" setting to open tabs so the
   * toggle takes effect immediately in the current session: clears the strip when
   * disabled, and rebuilds it from each tab's transcript when re-enabled.
   */
  applyEditedFilesSetting(): void {
    const enabled = this.plugin.settings.showAgentEditedFiles !== false;
    for (const tab of this.tabManager?.getAllTabs() ?? []) {
      if (enabled) {
        tab.state.setEditedFiles(deriveEditedFilesFromMessages(this.plugin.app, tab.state.messages));
      } else {
        tab.state.clearEditedFiles();
      }
    }
  }

  invalidateProviderCommandCaches(providerIds?: ProviderId | ProviderId[]): void {
    this.tabManager?.invalidateProviderCommandCaches(providerIds);
  }

  /** Updates provider-scoped hidden commands on all tabs after settings changes. */
  updateHiddenProviderCommands(): void {
    for (const tab of this.tabManager?.getAllTabs() ?? []) {
      tab.ui.slashCommandDropdown?.setHiddenCommands(
        getHiddenProviderCommandSet(this.plugin.settings, getTabProviderId(tab, this.plugin)),
      );
    }
  }

  async onOpen() {
    // Guard: Hover Editor and similar plugins may call onOpen before DOM is ready.
    // containerEl must exist before we can access contentEl or create elements.
    if (!this.containerEl) {
      return;
    }

    // Use contentEl (standard Obsidian API) as primary target.
    // Hover Editor and other plugins may modify the DOM structure,
    // so we need fallbacks to handle non-standard scenarios.
    let container: HTMLElement | null =
      this.contentEl ?? (this.containerEl.children[1] as HTMLElement | null);

    if (!container) {
      // Last resort: create our own container inside containerEl
      container = this.containerEl.createDiv();
    }

    this.viewContainerEl = container;

    // View-lifecycle event handlers + keyboard scope. These null-guard the tab
    // manager, so they are safe to register once per open whether or not a
    // provider is enabled (and survive empty<->content transitions).
    this.wireEventHandlers();

    // Mount the Vue shell first: TabContentHost fires CONTENT_HOST_KEY
    // synchronously during app.mount(), capturing `tabContentEl` before the
    // engine needs it. The empty-state placeholder is a projection of
    // `tabs.length === 0`, so no imperative empty-state render is needed here.
    this.mountChatShell();

    // No enabled provider means there is nothing to chat with; leave the shell
    // showing its empty-state projection and skip tab-manager creation entirely.
    const enabledProviders = ProviderRegistry.getEnabledProviderIds(
      asSettingsBag(this.plugin.settings),
    );
    if (enabledProviders.length === 0) {
      return;
    }

    await this.initTabContentEngine();
  }

  /**
   * Mounts the Vue chat-shell island. Mirrors AgentBoardView.mountVue: unmount
   * any prior app, empty the container, add the Vue baseline classes, then
   * createApp + provide the plugin, callbacks, and the content-host capture fn.
   * TabContentHost invokes CONTENT_HOST_KEY on its onMounted (synchronously
   * during mount), so `tabContentEl` is set by the time this returns.
   */
  private mountChatShell(): void {
    if (!this.viewContainerEl) return;
    this.vueApp?.unmount();
    this.viewContainerEl.empty();
    // Two calls, not one: Obsidian's addClass is variadic but the shared
    // test-lane polyfill is single-arg.
    this.viewContainerEl.addClass('specorator-vue');
    this.viewContainerEl.addClass('specorator-chat-vue-root');
    const app = createApp(ChatShellRoot);
    app.use(getChatShellPinia());
    // markRaw: Obsidian objects are large and cyclic; never deep-proxy them.
    app.provide(PLUGIN_KEY, markRaw(this.plugin));
    app.provide(CALLBACKS_KEY, markRaw(this.buildChatShellCallbacks()));
    app.provide(CONTENT_HOST_KEY, (hostEl: HTMLElement) => {
      this.tabContentEl = hostEl;
    });
    app.mount(this.viewContainerEl);
    this.vueApp = app;
  }

  /** Builds the tab manager into the Vue-provided content host. The shell must
   *  already be mounted (so `tabContentEl` is captured). */
  private async initTabContentEngine(): Promise<void> {
    if (!this.tabContentEl) {
      return;
    }

    this.tabManager = new TabManager(
      this.plugin,
      this.tabContentEl,
      this,
      {
        onTabCreated: () => {
          this.emitChatShellChange();
          this.gitActionButton?.updateDisplay();
          this.persistTabState();
        },
        onTabSwitched: () => {
          this.emitChatShellChange();
          this.updateHistoryDropdown();
          this.gitActionButton?.updateDisplay();
          this.persistTabState();
          void this.refreshBoundAgentChip();
        },
        onTabClosed: () => {
          // The just-closed tab is already deleted from the manager's map, so
          // the projection's activeTabId (derived from getActiveTab()?.id)
          // resolves to null here rather than the detached tab; the follow-up
          // switchToTab/createTab in closeTab emits again with the surviving
          // active tab, keeping resolveNavRowEl off any detached navRowEl.
          this.emitChatShellChange();
          this.persistTabState();
        },
        onTabStreamingChanged: () => this.emitChatShellChange(),
        onTabTitleChanged: () => this.emitChatShellChange(),
        onTabAttentionChanged: () => this.emitChatShellChange(),
        onTabConversationChanged: () => {
          this.emitChatShellChange();
          this.gitActionButton?.updateDisplay();
          this.persistTabState();
          void this.refreshBoundAgentChip();
        },
        onTabProviderChanged: () => {
          this.emitChatShellChange();
          this.gitActionButton?.updateDisplay();
        },
      }
    );

    await this.restoreOrCreateTabs();
    this.tabsRestored = true;
    // Notify Agent Board queue the tab budget is now readable. During
    // restoreOrCreateTabs(), each createTab() fires chat:tabs-changed but
    // areTabsRestored() was still false, so getTabSlotUsage() reported full
    // capacity via the hasSpecoratorLeaf fallback. Now that tabsRestored is true
    // the correct work-order count can be read; fire once so the queue
    // re-evaluates without waiting for the next manual tab create/close.
    this.plugin.events.emit('chat:tabs-changed', {
      openCount: this.tabManager?.getTabCount() ?? 0,
      chatCount: this.tabManager?.countTabsByKind('chat') ?? 0,
      workOrderCount: this.tabManager?.countTabsByKind('work-order') ?? 0,
    });
    this.emitChatShellChange();
    this.gitActionButton?.updateDisplay();
    void this.refreshBoundAgentChip();
    this.tabManager?.primeProviderRuntime();
  }

  /** Persists tab state and destroys the tab manager. Shared by the in-place
   * teardown and view close paths. */
  private async destroyTabRuntime(): Promise<void> {
    await this.persistTabStateImmediate();
    await this.tabManager?.destroy();
    this.tabManager = null;
  }

  /**
   * Re-evaluates provider availability. When the panel is showing the
   * configure-first empty state and a provider has since been enabled (e.g. from
   * settings), it promotes the panel to the full tab UI without requiring a
   * close/reopen. The Vue shell stays mounted across the transition; the empty
   * state is a projection of the (now empty or repopulated) tab set.
   */
  async refreshProviderAvailability(): Promise<void> {
    if (!this.viewContainerEl) {
      return;
    }
    const hasProviders = ProviderRegistry.getEnabledProviderIds(
      asSettingsBag(this.plugin.settings),
    ).length > 0;

    if (hasProviders && !this.tabManager) {
      // A provider was enabled while the empty state was showing. The content
      // host from the mounted shell is still captured, so rebuild the engine
      // into it.
      await this.initTabContentEngine();
    } else if (!hasProviders && this.tabManager) {
      // The last provider was disabled; drop the engine and let the shell's
      // empty-state projection (tabs.length === 0) take over.
      await this.destroyTabRuntime();
      this.emitChatShellChange();
    }
  }

  async onClose() {
    // Vault events registered via registerEvent are auto-released by the
    // Component lifecycle — no manual offref sweep needed.
    await this.destroyTabRuntime();
    this.disposeWorkOrderActivityDropdown();
    this.gitActionButton?.dispose();
    this.gitActionButton = null;
    // unmount() runs the shell's onUnmounted hooks (routing disposers); clearing
    // the observers drops the view-side subscription set.
    this.vueApp?.unmount();
    this.vueApp = null;
    this.chatShellObservers.clear();
    this.viewContainerEl?.removeClass('specorator-vue');
    this.viewContainerEl?.removeClass('specorator-chat-vue-root');
    this.scope = null;
  }

  // ============================================
  // Chat Shell Projection + Callbacks
  // ============================================

  /** Builds the ONE callbacks object the Vue shell holds for the life of the
   *  mount (provided markRaw'd). Every member delegates to a live view/TabManager
   *  method, so a single stable instance stays correct across projections. */
  private buildChatShellCallbacks(): ChatShellCallbacks {
    return {
      subscribe: (onChange) => {
        this.chatShellObservers.add(onChange);
        onChange(this.projectChatShell());
        return () => {
          this.chatShellObservers.delete(onChange);
        };
      },
      onTabClick: (id) => this.handleTabClick(id),
      onTabClose: (id) => {
        void this.handleTabClose(id);
      },
      onNewTab: () => {
        void this.createNewTab().catch(() => new Notice(t('chat.tab.createFailed')));
      },
      onNewConversation: () => {
        void this.newConversationInActiveTab().catch(() =>
          new Notice(t('chat.tab.createConversationFailed')),
        );
      },
      onOpenHistory: () => this.toggleHistoryDropdown(),
      // No dedicated trigger in the Vue header: the WorkOrderActivityDropdown
      // (mounted via mountWorkOrderHost) owns its own toggle. Kept to satisfy
      // the callbacks contract.
      onOpenWorkOrders: () => {},
      onQuickActions: () => this.openQuickActionsForActiveTab(),
      // Pre-warm the Skills-tab cache on hover so the Quick Actions modal opens
      // against a hot cache (old buildNavRowContent mouseenter). Idempotent:
      // VaultSkillAggregator dedupes concurrent fetches per provider.
      onQuickActionsHover: () => {
        void this.plugin.vaultSkillAggregator?.listAllStreaming(() => {});
      },
      onRename: (title) => this.renameActiveConversation(title),
      onOpenSettings: () => this.openPluginSettings(),
      mountHistoryHost: (el) => {
        this.historyDropdown = el;
        // The trigger button is the history menu's previous sibling inside
        // `.specorator-history-container` (see HeaderActions.vue); capture it so
        // toggleHistoryDropdown can sync aria-expanded.
        this.historyBtn = el.previousElementSibling as HTMLElement | null;
      },
      mountWorkOrderHost: (el) => {
        this.workOrderActivitySlotEl = el;
        this.mountWorkOrderActivityDropdown();
      },
      mountGitActionHost: (el) => {
        if (!this.plugin.gitStatusWatcher) return;
        this.gitActionButton?.dispose();
        this.gitActionButton = new GitActionButton(el, {
          subscribeGitStatus: (cb) => this.plugin.gitStatusWatcher!.subscribe(cb),
          isGitActionsEnabled: () => this.isActiveTabGitActionEnabled(),
          onGitCommit: () => this.sendGitCommitPromptToActiveTab(),
        });
      },
      resolveNavRowEl: (tabId) =>
        (tabId ? this.tabManager?.getTab(tabId)?.dom.navRowEl ?? null : null),
      renderProviderLogo: (el, providerId) => {
        // Append-only: ChatLogo clears the host before each render (mirrors the
        // old syncHeaderLogo, minus the clear).
        const icon = ProviderRegistry.getChatUIConfig(providerId).getProviderIcon?.();
        if (!icon) return;
        el.appendChild(createProviderIconSvg(icon, {
          dataProvider: providerId,
          height: 18,
          ownerDocument: el.ownerDocument,
          width: 18,
        }));
      },
    };
  }

  /** Fully-projected shell snapshot pushed to every observer. */
  private projectChatShell(): ChatShellSnapshot {
    const activeTab = this.tabManager?.getActiveTab() ?? null;
    return {
      tabs: this.tabManager?.getTabBarItems() ?? [],
      activeTabId: activeTab?.id ?? null,
      header: this.projectChatShellHeader(),
    };
  }

  /** Computes the full header chrome from the live TabManager + active tab. */
  private projectChatShellHeader(): ChatShellHeader {
    const tm = this.tabManager;
    const activeTab = tm?.getActiveTab() ?? null;
    const tabBarPosition: TabBarPosition =
      this.plugin.settings.tabBarPosition === 'header' ? 'header' : 'input';
    const activeProviderId = activeTab
      ? getTabProviderId(activeTab, this.plugin)
      : DEFAULT_CHAT_PROVIDER_ID;

    // tabBarVisible mirrors updateTabBarVisibility: show with 2+ chat tabs, or
    // when a (badge-less) work-order tab is active with a chat tab to return to.
    const chatCount = tm?.countTabsByKind('chat') ?? 0;
    const activeIsWorkOrder = activeTab?.kind === 'work-order';
    const tabBarVisible = chatCount >= 2 || (activeIsWorkOrder && chatCount >= 1);

    // logoVisible/titleVisible mirror the hideBranding rule: both the logo AND
    // the title text yield to the badges when the strip is visible in header
    // mode (old updateTabBarVisibility hid both on the same condition).
    const brandingVisible = !(tabBarVisible && tabBarPosition === 'header');
    const logoVisible = brandingVisible;
    const titleVisible = brandingVisible;

    // Bound-agent chip is resolved async; project the cache only when it still
    // matches the active conversation (else null until refreshBoundAgentChip
    // lands), so a stale chip never shows after a tab/conversation switch.
    const activeConversationId = activeTab?.conversationId ?? null;
    const boundAgent =
      this.cachedBoundAgentConversationId === activeConversationId
        ? this.cachedBoundAgent
        : null;

    // metaRowVisible mirrors updateHeaderMetaRow + updateNavRowLocation: in
    // header mode the action cluster lives in the meta row (so it always shows
    // once there are tabs); in input mode the row shows only for a bound-agent
    // chip or the git button.
    const hasTabs = (tm?.getTabCount() ?? 0) > 0;
    const hasGitAction = this.gitActionButton != null;
    const metaRowVisible =
      (tabBarPosition === 'header' && hasTabs) || boundAgent != null || hasGitAction;

    return {
      title: activeTab ? getTabTitle(activeTab, this.plugin) : 'Specorator',
      boundAgent,
      activeProviderId,
      tabBarVisible,
      metaRowVisible,
      tabBarPosition,
      logoProviderId: activeProviderId,
      logoVisible,
      titleVisible,
      // Gates the new-tab (+) button at the tab cap (old updateNewTabButtonVisibility).
      canCreateTab: tm?.canCreateTab() ?? true,
    };
  }

  /** Builds a snapshot and pushes it to every registered shell observer. */
  private emitChatShellChange(): void {
    if (this.chatShellObservers.size === 0) return;
    const snapshot = this.projectChatShell();
    for (const observer of this.chatShellObservers) {
      observer(snapshot);
    }
  }

  /** Opens the QuickActionsModal scoped to the active tab (former nav-row Quick
   *  Actions button handler). */
  private openQuickActionsForActiveTab(): void {
    const activeTab = this.tabManager?.getActiveTab();
    if (!activeTab) return;
    openQuickActionsModal(this.plugin, {
      onRun: (action) => {
        // Resolve the active tab at run time — the user may have switched tabs
        // while the modal was open.
        const targetTab = this.tabManager?.getActiveTab();
        if (!targetTab) return;
        void dispatchQuickActionToTab(this.plugin, targetTab, action);
      },
    });
  }

  /** Starts a fresh conversation in the active tab (former square-pen handler). */
  private async newConversationInActiveTab(): Promise<void> {
    await this.tabManager?.createNewConversation();
    this.updateHistoryDropdown();
  }

  /** Renames the active tab's conversation (header rename affordance). */
  private renameActiveConversation(title: string): void {
    const conversationId = this.tabManager?.getActiveTab()?.conversationId;
    if (!conversationId) return;
    void this.plugin.renameConversation(conversationId, title).catch(() => {
      // Best-effort: a rename failure surfaces through the store's own retry UI.
    });
  }

  /** Opens the Obsidian settings dialog focused on the Specorator plugin tab. */
  private openPluginSettings(): void {
    openPluginSettingsTab(this.app, this.plugin.manifest.id);
  }

  private mountWorkOrderActivityDropdown(): void {
    if (!this.workOrderActivitySlotEl || !this.plugin.workOrderActivity) return;
    this.disposeWorkOrderActivitySubscription?.();
    this.workOrderActivityDropdown?.destroy();
    this.workOrderActivityDropdown = new WorkOrderActivityDropdown(this.workOrderActivitySlotEl, {
      summary: this.plugin.workOrderActivity.getSummary(),
      onOpenItem: (id) => this.plugin.workOrderActivity?.openItem(id),
      onCloseItem: (tabId) => this.plugin.workOrderActivity?.closeTab(tabId),
    });
    this.disposeWorkOrderActivitySubscription = this.plugin.workOrderActivity.subscribe((summary) => {
      this.workOrderActivityDropdown?.update(summary);
    });
  }

  private disposeWorkOrderActivityDropdown(): void {
    this.disposeWorkOrderActivitySubscription?.();
    this.disposeWorkOrderActivitySubscription = null;
    this.workOrderActivityDropdown?.destroy();
    this.workOrderActivityDropdown = null;
    this.workOrderActivitySlotEl = null;
  }

  /**
   * Re-projects the shell after a tabBarPosition change. Called from settings
   * when the user switches the tab-bar position; the Vue header re-teleports the
   * badges/actions and toggles the container `--header-mode` class off the
   * projected `tabBarPosition`.
   */
  updateLayoutForPosition(): void {
    this.emitChatShellChange();
  }

  /** Re-projects the shell after a setting that affects tab-bar visibility. */
  refreshTabControls(): void {
    this.emitChatShellChange();
  }

  // ============================================
  // Tab Management
  // ============================================

  private isActiveTabGitActionEnabled(): boolean {
    const activeTab = this.tabManager?.getActiveTab();
    if (!activeTab) {
      return false;
    }

    const providerId = getTabProviderId(activeTab, this.plugin);
    const settings = ProviderSettingsCoordinator.getProviderSettingsSnapshot(
      this.plugin.settings,
      providerId,
    );

    return ProviderRegistry.getChatUIConfig(providerId).isGitActionsEnabled?.(settings) !== false;
  }

  private sendGitCommitPromptToActiveTab(): void {
    const inputController = this.tabManager?.getActiveTab()?.controllers.inputController;
    if (!inputController) {
      return;
    }

    void inputController.sendMessage({ content: GIT_COMMIT_PROMPT });
  }

  /** Opens a fresh chat tab pinned to the work order's provider/model and auto-sends its prompt. */
  /**
   * Opens a fresh tab for a work-order run and returns a live handle: the caller
   * (the Agent Board, via its execution surface) observes the stream, sends
   * follow-ups, and awaits the terminal result without the tab being focused.
   * Returns null when no tab could be opened (view not ready / tab cap reached).
   */
  // Lazily built so prototype-only test instances (which skip the constructor)
  // still resolve the bridge through the same callbacks the real view wires.
  private get workOrderBridge(): SpecoratorViewWorkOrderBridge {
    if (!this._workOrderBridge) {
      this._workOrderBridge = new SpecoratorViewWorkOrderBridge({
        getTabManager: () => this.tabManager,
        findConversationTab: (conversationId) => {
          const cross = this.plugin.findConversationAcrossViews(conversationId);
          if (!cross) return null;
          const tabManager = cross.view === this ? this.tabManager : cross.view.getTabManager();
          return { tabManager, tabId: cross.tabId };
        },
        openConversationInNewTab: async (conversationId) => {
          await this.tabManager?.openConversation(conversationId, { preferNewTab: true });
        },
      });
    }
    return this._workOrderBridge;
  }

  startTaskRunInFreshTab(options: {
    providerId: ProviderId;
    model: string;
    prompt: string;
    tabReservation?: ChatTabReservation;
    workOrderPath?: string;
    boundAgentId?: string;
  }): Promise<TaskRunTabHandle | null> {
    return this.workOrderBridge.startTaskRunInFreshTab(options);
  }

  /**
   * Routes a commit-and-push prompt into a work-order's chat. Delegates to
   * {@link SpecoratorViewWorkOrderBridge}; the cross-view conversation lookup is
   * supplied as a `findConversationTab` callback at construction.
   */
  injectCommitTurnForConversation(options: {
    conversationId: string | null;
    fallbackProviderId: ProviderId;
    fallbackModel: string;
    prompt: string;
  }): Promise<void> {
    return this.workOrderBridge.injectCommitTurnForConversation(options);
  }

  private handleTabClick(tabId: TabId): void {
    const switched = this.tabManager?.switchToTab(tabId);
    if (switched) {
      void switched.catch(() => new Notice(t('chat.tab.switchFailed')));
    }
  }

  private async handleTabClose(tabId: TabId): Promise<void> {
    try {
      const tab = this.tabManager?.getTab(tabId);
      // If streaming, treat close like user interrupt (force close cancels the stream)
      const force = tab?.state.isStreaming ?? false;
      // closeTab fires onTabClosed + the follow-up switchToTab/createTab, which
      // re-project the shell; no explicit visibility poke is needed.
      await this.tabManager?.closeTab(tabId, force);
    } catch {
      new Notice(t('chat.tab.closeFailed'));
    }
  }

  async createNewTab(): Promise<void> {
    const tab = await this.tabManager?.createTab();
    if (!tab) {
      const maxTabs = this.plugin.settings.maxChatTabs ?? 3;
      new Notice(t('chat.tabs.maxChatReached', { count: String(maxTabs) }));
      return;
    }
    // A successful createTab fires onTabCreated → emitChatShellChange, which
    // re-projects the strip; nothing else to poke here.
  }

  /**
   * Resolves the active conversation's bound agent (async) into the projection
   * cache, then re-emits. Guarded by a generation token so a stale resolution
   * never overwrites a newer one. Mirrors the former syncBoundAgentChip, but
   * feeds the Vue BoundAgentChip via the projection instead of touching DOM.
   */
  private async refreshBoundAgentChip(): Promise<void> {
    const gen = ++this.boundAgentChipGen;
    const conversationId = this.tabManager?.getActiveTab()?.conversationId ?? null;
    const conversation = conversationId
      ? await this.plugin.getConversationById(conversationId)
      : null;
    const agent = conversation?.boundAgentId
      ? await this.plugin.agentRosterStore?.get(conversation.boundAgentId)
      : null;
    if (gen !== this.boundAgentChipGen) return;

    this.cachedBoundAgentConversationId = conversationId;
    this.cachedBoundAgent =
      conversationId && agent
        ? { name: agent.name, persona: rosterAgentToPersona(agent) }
        : null;
    this.emitChatShellChange();
  }

  /**
   * Renders an inline error banner inside the conversation pane when history
   * hydration fails. Replaces the in-stream sentinel that Opencode used before
   * Task 4 (history-service-contract). No-op when no tab matches the id —
   * the `Notice` toast from `registerHydrationFailedSubscriber` is still shown.
   */
  /**
   * Records a history hydration failure so the conversation pane can surface it
   * as an inline banner. The failure is emitted synchronously during hydration —
   * before the target tab is bound to the conversation (`switchTo` rebinds only
   * in `restoreConversation`; `createTab` hydrates before the tab exists) — so a
   * lookup by `tab.conversationId` here would miss. Instead we stash it by
   * conversation id and let `ConversationController.restoreConversation` consume
   * it once the tab is bound. The `Notice` toast (raised by the subscriber) still
   * fires regardless, so a failure is never silent.
   */
  private renderHydrationErrorBanner(
    conversationId: string,
    payload: HydrationFailedBannerPayload,
  ): void {
    this.pendingHydrationErrors.set(conversationId, { code: payload.code, message: payload.message });
  }

  /** Returns and clears any pending hydration failure for a conversation. */
  consumePendingHydrationError(conversationId: string): { code: string; message: string } | null {
    const pending = this.pendingHydrationErrors.get(conversationId) ?? null;
    this.pendingHydrationErrors.delete(conversationId);
    return pending;
  }

  // ============================================
  // History Dropdown
  // ============================================

  private toggleHistoryDropdown(): void {
    if (!this.historyDropdown) return;

    const isVisible = this.historyDropdown.hasClass('visible');
    if (isVisible) {
      this.historyDropdown.removeClass('visible');
    } else {
      this.updateHistoryDropdown();
      this.historyDropdown.addClass('visible');
    }
    this.historyBtn?.setAttribute('aria-expanded', String(!isVisible));
  }

  /** Closes the history dropdown and syncs the trigger's aria-expanded state. */
  private closeHistoryDropdown(): void {
    this.historyDropdown?.removeClass('visible');
    this.historyBtn?.setAttribute('aria-expanded', 'false');
  }

  private updateHistoryDropdown(): void {
    if (!this.historyDropdown) return;
    this.historyDropdown.empty();

    const activeTab = this.tabManager?.getActiveTab();
    const conversationController = activeTab?.controllers.conversationController;

    if (conversationController) {
      conversationController.renderHistoryDropdown(this.historyDropdown, {
        onSelectConversation: (id) => this.openHistoryConversation(id),
        onOpenConversationInNewTab: (id, activate) =>
          this.openHistoryConversationInNewTab(id, activate),
        getConversationOpenState: (id) => this.getHistoryConversationOpenState(id),
      });
    }
  }

  private async openHistoryConversation(conversationId: string): Promise<void> {
    await this.tabManager?.openConversation(conversationId);
    this.closeHistoryDropdown();
  }

  private async openHistoryConversationInNewTab(
    conversationId: string,
    activate = true,
  ): Promise<void> {
    await this.tabManager?.openConversation(conversationId, {
      preferNewTab: true,
      activate,
    });
    this.closeHistoryDropdown();
  }

  private getHistoryConversationOpenState(conversationId: string): HistoryConversationOpenState {
    const activeTab = this.tabManager?.getActiveTab();
    if (activeTab?.conversationId === conversationId) {
      return 'current';
    }

    if (this.findTabWithConversation(conversationId)) {
      return 'open';
    }

    const crossViewResult = this.plugin.findConversationAcrossViews(conversationId);
    if (crossViewResult && crossViewResult.view !== this) {
      return 'open';
    }

    return 'closed';
  }

  private findTabWithConversation(conversationId: string): TabData | null {
    const tabs = this.tabManager?.getAllTabs() ?? [];
    return tabs.find(tab => tab.conversationId === conversationId) ?? null;
  }

  // ============================================
  // Event Wiring
  // ============================================

  private wireEventHandlers(): void {
    const activeDocument = this.containerEl.ownerDocument;

    // Document-level click to close dropdowns
    this.registerDomEvent(activeDocument, 'click', () => {
      this.closeHistoryDropdown();
    });

    // View-level Shift+Tab to toggle plan mode (works from any focused element)
    this.registerDomEvent(this.containerEl, 'keydown', (e: KeyboardEvent) => {
      if (e.key === 'Tab' && e.shiftKey && !e.isComposing) {
        e.preventDefault();
        const activeTab = this.tabManager?.getActiveTab();
        if (!activeTab) return;
        const providerId = getTabProviderId(activeTab, this.plugin);
        if (!ProviderRegistry.getCapabilities(providerId).supportsPlanMode) return;
        const current = ProviderSettingsCoordinator.getProviderSettingsSnapshot(
          this.plugin.settings,
          providerId,
        ).permissionMode as string;
        if (current === 'plan') {
          const restoreMode = activeTab.state.prePlanPermissionMode ?? 'normal';
          activeTab.state.prePlanPermissionMode = null;
          updatePlanModeUI(activeTab, this.plugin, restoreMode);
        } else {
          activeTab.state.prePlanPermissionMode = current;
          updatePlanModeUI(activeTab, this.plugin, 'plan');
        }
      }
    });

    // View scopes are the Obsidian-owned boundary for main-area tab hotkeys.
    // Returning false consumes Escape before Obsidian uses it for pane navigation.
    this.scope = new Scope(this.app.scope);
    this.scope.register([], 'Escape', (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (!e.defaultPrevented) {
        const activeTab = this.tabManager?.getActiveTab();
        if (activeTab?.state.isStreaming) {
          activeTab.controllers.inputController?.cancelStreaming();
        }
      }
      return false;
    });

    this.scope.register(['Mod'], 'Enter', (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return;
      const activeTab = this.tabManager?.getActiveTab();
      if (!activeTab) return;
      if (sendTabInputMessageFromExplicitEnterShortcut(activeTab, e, { requireInputFocus: true })) {
        return false;
      }
    });

    // Vault events - forward to active tab's file context manager.
    // registerEvent ties the ref to this Component's lifecycle so cleanup
    // happens automatically on onunload — no need to track via eventRefs[].
    const markCacheDirty = (includesFolders: boolean): void => {
      const mgr = this.tabManager?.getActiveTab()?.ui.fileContextManager;
      if (!mgr) return;
      mgr.markFileCacheDirty();
      if (includesFolders) mgr.markFolderCacheDirty();
    };
    this.registerEvent(this.plugin.app.vault.on('create', () => markCacheDirty(true)));
    this.registerEvent(this.plugin.app.vault.on('delete', () => markCacheDirty(true)));
    this.registerEvent(this.plugin.app.vault.on('rename', () => markCacheDirty(true)));
    this.registerEvent(this.plugin.app.vault.on('modify', () => markCacheDirty(false)));

    // UX-4: refresh header title + tab bar when the active tab's conversation
    // is renamed (manual rename or auto-title generation).
    this.register(this.plugin.events.on('conversation:renamed', () => {
      // The projection recomputes the header title + badge titles from the live
      // TabManager, so one emit covers both the active-tab title and the strip.
      this.emitChatShellChange();
    }));

    // A roster edit can change a bound agent's saved model while its tab stays
    // open; the conversation-keyed displayModel seed wouldn't invalidate (same
    // conversation), so recompute the seeds and refresh the selector to track it.
    this.register(this.plugin.events.on('roster:changed', () => {
      void refreshBoundAgentDisplayModels(this.plugin, this.tabManager?.getAllTabs() ?? [])
        .then(() => this.refreshModelSelector());
    }));

    // History Service Contract (Task 11): surface a Notice + inline banner when
    // `ConversationStore` reports a hydration / delete failure. Without this,
    // Opencode users with corrupt SQLite would see a blank pane (Task 4
    // removed the in-stream sentinel that used to render the error there).
    this.register(registerHydrationFailedSubscriber(this.plugin.events, (conversationId, payload) => {
      this.renderHydrationErrorBanner(conversationId, payload);
    }));

    // File open event
    this.registerEvent(
      this.plugin.app.workspace.on('file-open', (file) => {
        if (file) {
          this.tabManager?.getActiveTab()?.ui.fileContextManager?.handleFileOpen(file);
        }
      })
    );

    // Click outside to close mention dropdown
    this.registerDomEvent(activeDocument, 'click', (e) => {
      const activeTab = this.tabManager?.getActiveTab();
      if (activeTab) {
        const fcm = activeTab.ui.fileContextManager;
        if (fcm && !fcm.containsElement(e.target as Node) && e.target !== activeTab.dom.inputEl) {
          fcm.hideMentionDropdown();
        }
      }
    });
  }

  // ============================================
  // Persistence
  // ============================================

  private async restoreOrCreateTabs(): Promise<void> {
    if (!this.tabManager) return;

    // Try to restore from persisted state
    const persistedState = await this.plugin.storage.getTabManagerState();
    if (persistedState && persistedState.openTabs.length > 0) {
      await this.tabManager.restoreState(persistedState);
      return;
    }

    // Fallback: create a new empty tab
    await this.tabManager.createTab();
  }

  private persistTabState(): void {

    // Debounce persistence to avoid rapid writes (300ms delay)
    if (this.pendingPersist !== null) {
      window.clearTimeout(this.pendingPersist);
    }
    this.pendingPersist = window.setTimeout(() => {
      this.pendingPersist = null;
      if (!this.tabManager) return;
      const state = this.tabManager.getPersistedState();
      this.plugin.persistTabManagerState(state).catch(() => {
        // Silently ignore persistence errors
      });
    }, 300);
  }

  /** Force immediate persistence (for onClose/onunload). */
  private async persistTabStateImmediate(): Promise<void> {
    // Cancel any pending debounced persist
    if (this.pendingPersist !== null) {
      window.clearTimeout(this.pendingPersist);
      this.pendingPersist = null;
    }
    if (!this.tabManager) return;
    const state = this.tabManager.getPersistedState();
    await this.plugin.persistTabManagerState(state);
  }

  // ============================================
  // Public API
  // ============================================

  /** Gets the currently active tab. */
  getActiveTab(): TabData | null {
    return this.tabManager?.getActiveTab() ?? null;
  }

  /** Gets the tab manager. */
  getTabManager(): TabManager | null {
    return this.tabManager;
  }

  /** Whether the tab manager has finished restoring its persisted tabs. The
   *  Agent Board queue gates on this so it doesn't count an empty live tab set
   *  mid-restore and overbook the tab cap. */
  areTabsRestored(): boolean {
    return this.tabsRestored;
  }
}
