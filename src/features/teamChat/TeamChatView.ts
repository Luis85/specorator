import type { ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { ItemView, Notice } from 'obsidian';
import { type App as VueApp, createApp, markRaw } from 'vue';

import { validateTabManagerState } from '../../core/bootstrap/tabManagerState';
import type { ProviderId } from '../../core/providers/types';
import type { ChatViewHandle } from '../../core/types/PluginContext';
import { t } from '../../i18n/i18n';
import type SpecoratorPlugin from '../../main';
import { TabManager } from '../chat/tabs/TabManager';
import type { PersistedTabManagerState } from '../chat/tabs/types';
import { getTeamChatDmOpenCoordinator } from './TeamChatDmOpenCoordinator';
import type { TeamChatThreadStore } from './TeamChatThreadStore';
import { createTeamChatPinia } from './ui/vue/globalPinia';
import { CALLBACKS_KEY, CONTENT_HOST_KEY, PLUGIN_KEY, VIEW_KEY } from './ui/vue/keys';
import type { TeamChatCallbacks, TeamChatSnapshot } from './ui/vue/teamChatCallbacks';
import TeamChatRoot from './ui/vue/TeamChatRoot.vue';
import { VIEW_TYPE_TEAM_CHAT } from './viewType';

const TAB_STATE_PERSIST_DEBOUNCE_MS = 300;

/**
 * Main-area Team Chat island. Reuses the chat tab engine wholesale (the engine
 * reaches only `TabManagerViewHost` = `{ leaf, getTabManager() }`, so a second
 * host is reuse, not a fork) and `implements ChatViewHandle` so the ~18
 * broadcast/lifecycle sites can enumerate it through `getAllViews()` (T4).
 *
 * Phase 4a stands up the load-bearing plumbing (registered, openable,
 * enumerable, persistable) and renders the roster READ-ONLY; the interactive DM
 * surface (roster-click → live DM, top bar, presence liveness, fork-disable) is
 * Phase 4b.
 */
export class TeamChatView extends ItemView implements ChatViewHandle {
  /** One Vue app per leaf (the plugin can open several Team Chat leaves). */
  private vueApp: VueApp | null = null;
  // Public: mirrors SpecoratorView so cross-view code can read the manager off `this`.
  tabManager: TabManager | null = null;
  // The Vue-owned tab-content host, captured via CONTENT_HOST_KEY on mount.
  private tabContentEl: HTMLElement | null = null;
  // False until the engine has restored its tabs; the Agent Board tab-budget gate
  // reads it, so (like SpecoratorView) it flips only AFTER restore completes.
  private tabsRestored = false;
  /**
   * Agent whose DM is the active thread. A pure PROJECTION of the active tab's
   * bound agent (see `projectSelectedAgentFromActiveTab`) — never set
   * optimistically — so cross-leaf switches, failed opens, and the tab cap all
   * leave it tracking the actually-visible DM. Recorded in `getState` as a
   * restore hint (the projection reconfirms it once tabs restore).
   */
  private selectedAgentId: string | null = null;
  /** Persisted tab layout stashed by `setState`, consumed once by the restore in
   *  `initTabEngine` (mirror of SpecoratorView's `viewTabManagerState`). */
  private pendingTabManagerState: PersistedTabManagerState | null = null;
  /**
   * Bumped at the start of every `selectAgent`. Its async open yields twice
   * (`resolveOrCreate` + the serialized open); a newer select (generation bump) or
   * a teardown/replace of the engine (manager identity change) during those yields
   * must invalidate the in-flight open so it can't `createTab`/reveal/switch after
   * being superseded or into a detached manager (:209).
   */
  private selectionGeneration = 0;
  private pendingPersist: number | null = null;
  // Store-reprojection observers (mirror of chat's chatShellObservers). The
  // routing composable subscribes here and fans each snapshot into the Pinia
  // store; the ChatViewHandle refresh methods re-project through the same seam.
  private readonly teamChatObservers = new Set<(snapshot: TeamChatSnapshot) => void>();

  constructor(leaf: WorkspaceLeaf, private readonly plugin: SpecoratorPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_TEAM_CHAT;
  }

  getDisplayText(): string {
    return t('teamChat.viewTitle');
  }

  getIcon(): string {
    return 'users';
  }

  async onOpen(): Promise<void> {
    // Re-entrant onOpen (popout/move without an interleaved onClose): drop the
    // prior engine so it can't leak pointing at the about-to-be-emptied host. No
    // leaf persist here — setViewState during onOpen would re-enter.
    if (this.tabManager) {
      await this.tabManager.destroy();
      this.tabManager = null;
    }
    this.vueApp?.unmount();
    this.vueApp = null;
    this.tabContentEl = null;
    this.contentEl.empty();
    // Two calls, not one: Obsidian's addClass is variadic but the shared
    // test-lane polyfill is single-arg.
    this.contentEl.addClass('specorator-vue');
    this.contentEl.addClass('specorator-team-chat-vue-root');

    const app = createApp(TeamChatRoot);
    app.use(createTeamChatPinia()); // fresh per-leaf Pinia — see createTeamChatPinia
    // markRaw: Obsidian objects are large and cyclic; never deep-proxy them.
    app.provide(PLUGIN_KEY, markRaw(this.plugin));
    app.provide(VIEW_KEY, markRaw(this));
    app.provide(CALLBACKS_KEY, markRaw(this.buildCallbacks()));
    // Engine construction happens AFTER the host element exists: the root
    // captures it synchronously during mount and calls back here.
    app.provide(CONTENT_HOST_KEY, (hostEl: HTMLElement) => {
      this.tabContentEl = hostEl;
      this.initTabEngine();
    });
    app.mount(this.contentEl);
    this.vueApp = app;
  }

  /** Builds the tab engine into the Vue-provided content host, then restores the
   *  persisted DM tabs. The engine is enumerable immediately via getTabManager()
   *  (so getAllViews / T4 reaches it); `tabsRestored` flips only after restore. */
  private initTabEngine(): void {
    const containerEl = this.tabContentEl;
    if (!containerEl || this.tabManager) return;
    this.tabManager = new TabManager(this.plugin, containerEl, this, {
      // The four tab-set-changing callbacks re-derive selectedAgentId from the
      // now-active tab (the projection) and persist; the rest only re-emit.
      onTabCreated: () => { this.projectSelectedAgentFromActiveTab(); this.persistTabState(); },
      onTabSwitched: () => { this.projectSelectedAgentFromActiveTab(); this.persistTabState(); },
      onTabClosed: () => { this.projectSelectedAgentFromActiveTab(); this.persistTabState(); },
      onTabStreamingChanged: () => this.emitTeamChatChange(),
      onTabTitleChanged: () => this.emitTeamChatChange(),
      onTabAttentionChanged: () => this.emitTeamChatChange(),
      onTabConversationChanged: () => { this.projectSelectedAgentFromActiveTab(); this.persistTabState(); },
      onTabProviderChanged: () => this.emitTeamChatChange(),
    });
    // Fire-and-forget from this synchronous Vue mount seam: restore the saved DM
    // tabs, then mark the budget gate ready. A rejected restore is logged, never
    // an unhandled rejection.
    void this.restoreTabsThenMarkReady();
  }

  /**
   * Derives `selectedAgentId` from the ACTIVE tab's bound agent (its
   * conversation's `boundAgentId`), or null when no DM tab is active, then emits.
   * This is the single writer of `selectedAgentId` at runtime, so the roster
   * highlight and the right-pane empty state (`!selectedAgentId`) always match the
   * tab the pane is actually showing — no optimistic set to reconcile.
   */
  private projectSelectedAgentFromActiveTab(): void {
    const conversationId = this.tabManager?.getActiveTab()?.conversationId ?? null;
    const boundAgentId = conversationId
      ? this.plugin.getConversationSync(conversationId)?.boundAgentId ?? null
      : null;
    this.selectedAgentId = boundAgentId;
    this.emitTeamChatChange();
  }

  /** Restores persisted DM tabs, then flips `tabsRestored` (mirror of
   *  SpecoratorView: the budget gate must not read a half-built tab set). */
  private async restoreTabsThenMarkReady(): Promise<void> {
    try {
      await this.restoreTabs();
    } catch (error) {
      this.plugin.logger.scope('team-chat').error('team chat tab restore failed', error);
    } finally {
      this.tabsRestored = true;
    }
  }

  /**
   * Round-trips the saved DM tabs through the engine's restore path. `restoreState`
   * recreates every hidden roster-driven tab and switches to the persisted active
   * one, whose `onTabSwitched` drives the `selectedAgentId` projection. No separate
   * selectedAgentId reopen: a non-null selection always corresponds to an active DM
   * tab that `tabManagerState` already carries, so restoring the layout reopens it.
   */
  private async restoreTabs(): Promise<void> {
    const manager = this.tabManager;
    const persisted = this.pendingTabManagerState;
    if (manager && persisted && persisted.openTabs.length > 0) {
      await manager.restoreState(persisted);
      this.pendingTabManagerState = null; // consumed once (mirror of SpecoratorView)
    }
  }

  /** Force-persists the leaf state then destroys the tab engine. Mirrors
   *  SpecoratorView.destroyTabRuntime — destroy() saves every open DM
   *  conversation and disposes all tabs/controllers/islands (NOT the
   *  runtime-only disposeAllRuntimes, which leaks controllers/listeners/islands
   *  and skips the per-conversation saves). */
  private async destroyTabRuntime(): Promise<void> {
    await this.persistTabStateImmediate();
    await this.tabManager?.destroy();
    this.tabManager = null;
  }

  async onClose(): Promise<void> {
    await this.destroyTabRuntime();
    // unmount() runs the islands' onUnmounted disposers; empty() drops detached
    // DOM + listeners.
    this.vueApp?.unmount();
    this.vueApp = null;
    this.teamChatObservers.clear();
    this.contentEl.removeClass('specorator-vue');
    this.contentEl.removeClass('specorator-team-chat-vue-root');
    this.contentEl.empty();
  }

  // ============================================
  // ChatViewHandle — engine access (T4 duck-type target)
  // ============================================

  /** Concrete return type (like SpecoratorView) satisfies BOTH `ChatViewHandle`
   *  (TabManager <: ChatTabManagerHandle) and the engine's `TabManagerViewHost`
   *  (TabManager <: TabManagerInterface). */
  getTabManager(): TabManager | null {
    return this.tabManager;
  }

  invalidateProviderCommandCaches(providerIds?: ProviderId | ProviderId[]): void {
    this.tabManager?.invalidateProviderCommandCaches(providerIds);
  }

  areTabsRestored(): boolean {
    return this.tabsRestored;
  }

  // ============================================
  // ChatViewHandle — UI-refresh surface
  //
  // Minimal-but-correct in 4a: with no composer/header island mounted yet,
  // re-projecting the store is all there is to refresh. Each gains its DM-scoped
  // body in 4b.
  // ============================================

  refreshModelSelector(): void {
    this.emitTeamChatChange(); // Phase 4b: DM-scoped refresh
  }

  async refreshProviderAvailability(): Promise<void> {
    this.emitTeamChatChange(); // Phase 4b: DM-scoped refresh
  }

  updateLayoutForPosition(): void {
    this.emitTeamChatChange(); // Phase 4b: DM-scoped refresh
  }

  refreshTabControls(): void {
    this.emitTeamChatChange(); // Phase 4b: DM-scoped refresh
  }

  applyEditedFilesSetting(): void {
    this.emitTeamChatChange(); // Phase 4b: DM-scoped refresh
  }

  updateHiddenProviderCommands(): void {
    this.emitTeamChatChange(); // Phase 4b: DM-scoped refresh
  }

  /**
   * Opens or resumes the agent's single persistent DM: resolve the DM's
   * conversation, then reuse any already-open tab for it, else create one.
   * `selectedAgentId` is NOT set here — it projects off whichever tab this open
   * ends up activating (`onTabCreated`/`onTabSwitched`), so a cross-leaf reveal or
   * a failed open never leaves the roster highlighting a DM this pane isn't
   * showing. Idempotent per agent — a repeat select of an already-open DM switches
   * to it rather than creating a duplicate.
   */
  async selectAgent(agentId: string): Promise<void> {
    // Stamp this selection + capture the current engine, so the async open below
    // can detect being superseded by a newer select or the engine being torn down
    // / replaced (see isSelectionStale) and bail before any stale side effect.
    const generation = ++this.selectionGeneration;
    const manager = this.tabManager;
    if (!manager) return; // engine not built yet (defensive; clicks only fire post-mount)
    const conversationId = await this.getThreadStore().resolveOrCreate(agentId);
    // Bail if the leaf closed/re-opened or a newer agent was selected while
    // resolveOrCreate was in flight — otherwise the open would mount into a
    // detached manager or open a DM the user already navigated away from (:209).
    if (this.isSelectionStale(generation, manager)) return;
    // Serialize the find→open plugin-wide, keyed by conversationId, so two
    // overlapping selects of the SAME DM (simultaneous clicks in two Team Chat
    // leaves — each leaf has its own generation, so neither supersedes the other)
    // collapse into ONE open. resolveOrCreate serializes only the roomKey→id
    // mapping; without this both callers would see findConversationAcrossViews ==
    // null (neither tab created yet) and each createTab, double-mounting one
    // conversation (concurrent streams/saves corrupt it). The queued second caller
    // re-runs openResolvedDm, now finds the tab, and switches.
    await getTeamChatDmOpenCoordinator(this.plugin).serialize(conversationId, () =>
      this.openResolvedDm(conversationId, manager, generation));
  }

  /**
   * True once this selection was superseded by a newer select (generation bump) OR
   * the engine was torn down / replaced (manager identity changed — catches
   * `onClose` nulling `tabManager` and a re-entrant `onOpen` swapping it). Every
   * post-await side effect in the open path guards on this so a superseded/detached
   * open is a silent no-op instead of mounting a runtime into a dead manager (:209).
   */
  private isSelectionStale(generation: number, manager: TabManager): boolean {
    return this.selectionGeneration !== generation || this.tabManager !== manager;
  }

  /**
   * Body of the serialized DM open: reuse an already-open tab (this leaf or
   * another), else create one here. Re-run safe — a queued second caller for the
   * same conversation re-enters after the first created the tab, finds it, and
   * switches instead of double-mounting. Touches no selection state: the activated
   * tab's `onTabSwitched`/`onTabCreated` drives the `selectedAgentId` projection.
   */
  private async openResolvedDm(
    conversationId: string,
    manager: TabManager,
    generation: number,
  ): Promise<void> {
    // The serialized body may have queued behind another open (or the leaf may have
    // been torn down since it was enqueued); re-check before touching anything.
    if (this.isSelectionStale(generation, manager)) return;
    // Span every Specorator leaf (sidebar + all Team Chat views): a DM already
    // open in another leaf must be revealed, never double-mounted.
    const existing = this.plugin.findConversationAcrossViews(conversationId);
    if (existing) {
      if (existing.view.leaf === this.leaf) {
        await manager.switchToTab(existing.tabId);
      } else {
        // Owned by ANOTHER leaf — reveal + switch it there. This leaf's
        // selectedAgentId projects off its OWN active tab, so it correctly stays
        // put; the destination leaf's onTabSwitched projects ITS selection.
        await this.plugin.app.workspace.revealLeaf(existing.view.leaf);
        // revealLeaf awaited — re-check before the cross-leaf switch.
        if (this.isSelectionStale(generation, manager)) return;
        await existing.view.getTabManager()?.switchToTab(existing.tabId);
      }
      return;
    }
    const created = await manager.createTab(conversationId, undefined, { activate: true, kind: 'chat' });
    // Surface the cap Notice only for a genuine, still-current cap hit — a stale
    // open that lost the race isn't a user-facing error. No selection to revert
    // either; it already reflects the real active tab. (LRU eviction is later.)
    if (!created && !this.isSelectionStale(generation, manager)) {
      new Notice(t('teamChat.tabCapReached'));
    }
  }

  /** Fire-and-forget DM open with error logging — the Vue roster-click seam
   *  delegates here so a rejected resolve/open is logged, never an unhandled
   *  rejection. It no longer touches selectedAgentId; the activated tab's
   *  projection does. */
  private openAgentDm(agentId: string): void {
    void this.selectAgent(agentId).catch((error) =>
      this.plugin.logger.scope('team-chat').error('selectAgent failed', error));
  }

  /** The single plugin-scoped agent-DM thread store, shared by every Team Chat
   *  leaf so their mutations serialize and reflect each other (Round-20 Fix A). */
  private getThreadStore(): TeamChatThreadStore {
    return this.plugin.getTeamChatThreadStore();
  }

  // ============================================
  // Vue → engine seam
  // ============================================

  private buildCallbacks(): TeamChatCallbacks {
    return {
      subscribe: (onChange) => {
        this.teamChatObservers.add(onChange);
        return () => {
          this.teamChatObservers.delete(onChange);
        };
      },
      onSelectAgent: (agentId) => this.openAgentDm(agentId),
    };
  }

  private buildSnapshot(): TeamChatSnapshot {
    return { selectedAgentId: this.selectedAgentId };
  }

  /** Notifies every registered store observer (mirror of emitChatShellChange). */
  private emitTeamChatChange(): void {
    const snapshot = this.buildSnapshot();
    for (const observer of this.teamChatObservers) observer(snapshot);
  }

  // ============================================
  // Leaf-owned persistence (T5)
  //
  // Team Chat NEVER writes the global persistTabManagerState() slot (the
  // sidebar's fallback); its DM layout round-trips through Obsidian view state.
  // ============================================

  getState(): Record<string, unknown> {
    return {
      ...super.getState(),
      selectedAgentId: this.selectedAgentId ?? undefined,
      tabManagerState: this.tabManager?.getPersistedState(),
    };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const raw = state as { selectedAgentId?: unknown; tabManagerState?: unknown } | null;
    // selectedAgentId is a restore hint for the roster highlight until the tabs
    // restore and the projection reconfirms it off the active tab.
    if (typeof raw?.selectedAgentId === 'string') this.selectedAgentId = raw.selectedAgentId;
    // Stash the validated DM layout for initTabEngine's restore (mirror of
    // SpecoratorView) so every saved DM tab round-trips on reload, not just the
    // selected one. setState runs before onOpen, so it's ready when the engine builds.
    const validated = validateTabManagerState(raw?.tabManagerState);
    if (validated) this.pendingTabManagerState = validated;
    await super.setState(state, result);
  }

  private persistTabState(): void {
    if (this.pendingPersist !== null) window.clearTimeout(this.pendingPersist);
    this.pendingPersist = window.setTimeout(() => {
      this.pendingPersist = null;
      void this.leaf.setViewState({ type: VIEW_TYPE_TEAM_CHAT, state: this.getState() });
    }, TAB_STATE_PERSIST_DEBOUNCE_MS);
  }

  private async persistTabStateImmediate(): Promise<void> {
    if (this.pendingPersist !== null) {
      window.clearTimeout(this.pendingPersist);
      this.pendingPersist = null;
    }
    await this.leaf.setViewState({ type: VIEW_TYPE_TEAM_CHAT, state: this.getState() });
  }
}
