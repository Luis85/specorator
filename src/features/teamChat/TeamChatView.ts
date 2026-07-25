import type { ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { ItemView, Notice } from 'obsidian';
import { type App as VueApp, createApp, markRaw } from 'vue';

import { validateTabManagerState } from '../../core/bootstrap/tabManagerState';
import type { ProviderId } from '../../core/providers/types';
import type { ChatViewHandle } from '../../core/types/PluginContext';
import { t } from '../../i18n/i18n';
import type SpecoratorPlugin from '../../main';
import { tabCountsPayload } from '../chat/events';
import { TabManager } from '../chat/tabs/TabManager';
import { openEditedFile } from '../chat/tabs/tabUi';
import type { PersistedTabManagerState } from '../chat/tabs/types';
import type { ComposerEditedFile } from '../chat/ui/vue/composer/stores/composerStore';
import { basename, parentDir } from '../chat/utils/pathLabel';
import { getTeamChatDmOpenCoordinator } from './TeamChatDmOpenCoordinator';
import { applyDmEditedFilesSetting, applyDmHiddenCommands, refreshDmModelState, rotateChangedDmProviders } from './teamChatDmRefresh';
import { reconcileRotation, restoreTeamChatDmTabs } from './teamChatDmTabs';
import { projectCrossLeafPresence, type TeamChatPresence } from './teamChatPresence';
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
  /** Unsubscribe for the cross-leaf `teamChat:presence` broadcast (Fix 3): another
   *  leaf's DM streaming re-projects this leaf's presence so busy shows everywhere. */
  private presenceUnsubscribe: (() => void) | null = null;
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
      // Invalidate any in-flight selectAgent open before tearing down (mirror of
      // destroyTabRuntime's Round-28 bump): this re-entrant path destroys the manager
      // directly and can't call destroyTabRuntime (onOpen must not setViewState), so
      // without this bump an open awaiting resolveOrCreate would pass isSelectionStale
      // (manager not yet nulled) and createTab into the manager being destroyed (:90).
      this.selectionGeneration++;
      // Re-close the restore gate: the OLD engine left tabsRestored true, but the
      // NEW manager's restoreState (in initTabEngine) runs async. Without this, a
      // roster click in the rebuild window passes selectAgent's !tabsRestored gate
      // (Round-29) and createTabs concurrently with the new restore → duplicate.
      // initTabEngine always flips it back true after the new restore (Round-31), so
      // it never stays false forever (:90).
      this.tabsRestored = false;
      // Cancel the armed pending-persist debounce: its callback calls
      // leaf.setViewState (the very re-entry onOpen avoids) and would race the newly
      // mounting manager. destroyTabRuntime clears it via persistTabStateImmediate,
      // but this re-entrant path never calls that, so it must clear its own (:109).
      if (this.pendingPersist !== null) {
        window.clearTimeout(this.pendingPersist);
        this.pendingPersist = null;
      }
      // Capture the LIVE DM layout before destroying: the initial setState layout
      // was already consumed by the first initTabEngine, so without this the rebuilt
      // engine restores nothing and the pane goes blank while selectedAgentId still
      // references the old agent (:90). This live capture supersedes the (already
      // consumed) initial state; the rebuilt initTabEngine reopens these tabs.
      this.pendingTabManagerState = this.tabManager.getPersistedState();
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
    // Re-project presence whenever ANY leaf's DM streaming changes (re-entrant onOpen
    // drops the prior subscription first so it never double-subscribes).
    this.presenceUnsubscribe?.();
    this.presenceUnsubscribe = this.plugin.events.on('teamChat:presence', () => this.emitTeamChatChange());
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
      onTabStreamingChanged: () => { this.emitTeamChatChange(); this.plugin.events.emit('teamChat:presence'); },
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
    // Capture the manager this restore belongs to. If onOpen re-enters and swaps in a
    // replacement while we await restoreState, a superseded restore reaching its
    // finally would re-open the gate (Round-32 reset it to false) and re-emit —
    // letting a roster click createTab concurrent with the NEW restore (:185). Only
    // the current manager's restore may publish (mirrors selectAgent's identity guard).
    const manager = this.tabManager;
    try {
      await this.restoreTabs();
    } catch (error) {
      this.plugin.logger.scope('team-chat').error('team chat tab restore failed', error);
    } finally {
      if (this.tabManager === manager) {
        this.tabsRestored = true;
        // Capacity is readable again now that tabsRestored is true (getTabSlotUsage
        // reported FULL while it was false). Mirror SpecoratorView: fire chat:tabs-changed
        // once (shared tabCountsPayload) so the Agent Board work-order queue re-ticks and
        // drains any runnable card, instead of stalling until an unrelated tab change
        // nudges it (:171).
        this.plugin.events.emit('chat:tabs-changed', tabCountsPayload(this.tabManager));
      }
    }
  }

  /**
   * Restores the saved DM tabs through the Team-Chat-specific restore, which adds
   * the guards `TabManager.restoreState` lacks: cross-leaf dedup + per-conversationId
   * serialization (:225 Fix 1), team-chat-bound validation (:225 Fix 2), and no blank
   * fallback tab. The active restored tab's `onTabSwitched` drives the projection.
   */
  private async restoreTabs(): Promise<void> {
    const manager = this.tabManager;
    const persisted = this.pendingTabManagerState;
    if (manager && persisted && persisted.openTabs.length > 0) {
      await restoreTeamChatDmTabs(this.plugin, manager, persisted);
      this.pendingTabManagerState = null; // consumed once (mirror of SpecoratorView)
    }
  }

  /** Force-persists the leaf state then destroys the tab engine. Mirrors
   *  SpecoratorView.destroyTabRuntime — destroy() saves every open DM
   *  conversation and disposes all tabs/controllers/islands (NOT the
   *  runtime-only disposeAllRuntimes, which leaks controllers/listeners/islands
   *  and skips the per-conversation saves). */
  private async destroyTabRuntime(): Promise<void> {
    // Invalidate any in-flight selectAgent open BEFORE persist/destroy: teardown
    // never bumps the generation otherwise, and it doesn't null tabManager until
    // after these awaits, so an open still mid-resolve would pass isSelectionStale
    // (manager unchanged) and createTab a tab AFTER destroy() snapshotted the tab
    // set — a detached runtime that never gets disposed (:197). Do NOT null
    // tabManager first: persistTabStateImmediate → getState reads it for the final
    // layout; the generation bump is what invalidates the in-flight opens.
    this.selectionGeneration++;
    await this.persistTabStateImmediate();
    await this.tabManager?.destroy();
    this.tabManager = null;
  }

  async onClose(): Promise<void> {
    this.presenceUnsubscribe?.();
    this.presenceUnsubscribe = null;
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
  // ChatViewHandle — UI-refresh surface. DM-scoped: a settings/env broadcast fans out
  // to the open DM tabs via the shared per-tab helpers (`teamChatDmRefresh`, mirroring
  // SpecoratorView), then re-projects the store. refreshTabControls/updateLayoutForPosition
  // re-project only — no Team-Chat tab-strip / tab-bar knob (as in SpecoratorView).
  // ============================================

  refreshModelSelector(): void {
    // Per-tab model-selector + usage refresh; the view owns the emit + runtime prime.
    refreshDmModelState(this.plugin, this.tabManager?.getAllTabs() ?? []);
    this.emitTeamChatChange();
    this.tabManager?.primeProviderRuntime();
  }

  async refreshProviderAvailability(): Promise<void> {
    const tabs = this.tabManager?.getAllTabs() ?? [];
    // Un-grey each open DM (also fires standalone from deferred init), then rotate any
    // DM whose agent was re-pointed at another (immutable) provider via selectAgent.
    refreshDmModelState(this.plugin, tabs);
    await rotateChangedDmProviders(this.plugin, tabs, (agentId) => this.selectAgent(agentId));
    this.emitTeamChatChange();
  }

  updateLayoutForPosition(): void {
    this.emitTeamChatChange();
  }

  refreshTabControls(): void {
    this.emitTeamChatChange();
  }

  applyEditedFilesSetting(): void {
    // Clear (disabled) or derive (enabled) each open DM's edited files (mirror of SV).
    applyDmEditedFilesSetting(this.plugin, this.tabManager?.getAllTabs() ?? []);
    this.emitTeamChatChange();
  }

  updateHiddenProviderCommands(): void {
    // DM-scoped: repaint each open DM's persistent slash-command dropdown (mirror of
    // SpecoratorView), then re-project the store.
    applyDmHiddenCommands(this.plugin, this.tabManager?.getAllTabs() ?? []);
    this.emitTeamChatChange();
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
    // Gate on both: no engine yet (defensive; clicks only fire post-mount), AND
    // restore still in flight — during initTabEngine's restoreState the manager is
    // already non-null but tabsRestored is false, so opening now would createTab a
    // DM restoreState is about to recreate → a duplicate controller for one
    // conversation. Ignore the click; the saved layout reopens the DMs anyway (:274).
    if (!manager || !this.tabsRestored) return;
    // Snapshot the currently-mapped DM before resolveOrCreate: a provider change
    // rotates the mapping to a FRESH conversation (Round-21/26), and the old tab
    // would otherwise stay attached — its old-provider runtime streaming and holding
    // a chat slot forever (:283).
    const previousConversationId = await this.getThreadStore().get(agentId);
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
    // Reconcile a provider-change rotation: record + notify a new rotation, and close
    // any displaced old-provider tab once its replacement is open — deferred, so a
    // cap-blocked rotation's stale tab is closed on the retry that finally opens the
    // replacement (:361). Skip if a newer selection superseded this one.
    if (!this.isSelectionStale(generation, manager)) {
      await reconcileRotation(this.plugin, agentId, previousConversationId, conversationId);
    }
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
      onOpenEditedFile: (path) => openEditedFile(this.plugin.app, path),
    };
  }

  private buildSnapshot(): TeamChatSnapshot {
    return {
      selectedAgentId: this.selectedAgentId,
      editedFiles: this.buildEditedFiles(),
      presence: this.buildPresence(),
    };
  }

  /** Cross-leaf idle/busy presence for the roster dots (see projectCrossLeafPresence).
   *  Recomputed on every emitTeamChatChange — own tab callbacks + the teamChat:presence
   *  broadcast — so a stream start/stop in ANY leaf self-heals with no map to reconcile. */
  private buildPresence(): Record<string, TeamChatPresence> {
    return projectCrossLeafPresence(this.plugin);
  }

  /**
   * Projects the ACTIVE DM tab's created/edited files onto the display shape the
   * top bar's `EditedFilesStrip` renders — the same synchronous `tab.state.editedFiles`
   * → `{ path, changeKind, name, dir }` mapping the composer's `buildEditedFiles`
   * uses, so both strips read one truth. Re-projected on every `emitTeamChatChange`
   * (tab switch/create/close/conversation change + streaming stop), so a finished
   * turn's writes surface in the top bar. Empty when no DM tab is active.
   */
  private buildEditedFiles(): ComposerEditedFile[] {
    const active = this.tabManager?.getActiveTab();
    return (active?.state.editedFiles ?? []).map((entry) => ({
      path: entry.path,
      changeKind: entry.changeKind,
      name: basename(entry.path),
      dir: parentDir(entry.path),
    }));
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
