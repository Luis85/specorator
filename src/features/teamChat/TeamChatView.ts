import type { ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { ItemView } from 'obsidian';
import { type App as VueApp, createApp, markRaw } from 'vue';

import { validateTabManagerState } from '../../core/bootstrap/tabManagerState';
import type { ProviderId } from '../../core/providers/types';
import type { ChatViewHandle } from '../../core/types/PluginContext';
import { t } from '../../i18n/i18n';
import type SpecoratorPlugin from '../../main';
import { tabCountsPayload } from '../chat/events';
import { TabManager } from '../chat/tabs/TabManager';
import { refreshBoundAgentDisplayModels } from '../chat/tabs/tabShared';
import { openEditedFile } from '../chat/tabs/tabUi';
import type { PersistedTabManagerState } from '../chat/tabs/types';
import { getTeamChatDmOpenCoordinator } from './TeamChatDmOpenCoordinator';
import { applyDmEditedFilesSetting, applyDmHiddenCommands, noticeRemovedAgentDms, projectTeamChatSnapshot, reconcileRestoredDmProviders, refreshDmModelState, rotateChangedDmProviders } from './teamChatDmRefresh';
import { openResolvedTeamChatDm, ownedDisplacedDmId, reconcileRotation, restoreTeamChatDmTabs, serializeOnTail, touchDmRecency } from './teamChatDmTabs';
import { registerTeamChatDmFileEvents } from './teamChatFileEvents';
import { createDmHydrationBanner, type DmHydrationBannerController } from './teamChatHydrationBanner';
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
  /** Latest roster click made while tabs were still restoring; drained as a normal selection once
   *  restore completes (last-click-wins), so a click during restore isn't discarded (Round-48 Fix C). */
  private pendingAgentSelection: string | null = null;
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
   * Bumped at the start of every `selectAgent`; its async open yields twice (`resolveOrCreate` + the
   * serialized open). A newer select (generation bump) or an engine teardown/replace (manager identity
   * change) during those yields invalidates the in-flight open so it can't act on a detached manager (:209).
   */
  private selectionGeneration = 0;
  /** Per-leaf tail serializing selectAgent's open+reconcile so two fast different-agent clicks run one-at-a-time — no concurrent double-evict at full budget (Round-49). Holder so serializeOnTail advances it byref. */
  private readonly selectionOpenTail: { tail: Promise<unknown> } = { tail: Promise.resolve() };
  private pendingPersist: number | null = null;
  /** Unsubscribe for the cross-leaf `teamChat:presence` broadcast (Fix 3): another
   *  leaf's DM streaming re-projects this leaf's presence so busy shows everywhere. */
  private presenceUnsubscribe: (() => void) | null = null;
  /** Unsubscribe for `roster:changed` (Round-39): reconciles OPEN DM tabs on a roster edit
   *  — provider-change rotation + un-grey (reused T5 reconcile), plus read-only for deleted
   *  agents. Mirrors `presenceUnsubscribe`'s onOpen/onClose + re-entrant lifecycle. */
  private rosterChangedUnsubscribe: (() => void) | null = null;
  /** DM hydration-failure → inline banner controller (Round-62 Fix 3): owns the pending map +
   *  `conversation:hydration-failed` subscription; disposed/re-created like presence/roster. */
  private hydrationBanner: DmHydrationBannerController | null = null;
  /** Open DMs already flagged agent-removed (Round-39), so a later unrelated `roster:changed`
   *  doesn't re-notice; a re-created agent clears its entry. Owned here, mutated by the helper. */
  private readonly removedAgentDmsNotified = new Set<string>();
  /** DM conversationIds in activation order (most-recent last) — the LRU order the T7
   *  hot-DM budget evicts from. Touched whenever a DM tab becomes active. */
  private readonly dmRecency: string[] = [];
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
      // Invalidate any in-flight selectAgent open before tearing down (mirror of destroyTabRuntime's
      // Round-28 bump): this re-entrant path destroys the manager directly, so without the bump an open
      // awaiting resolveOrCreate would pass isSelectionStale and createTab into the doomed manager (:90).
      this.selectionGeneration++;
      // Re-close the restore gate: the OLD engine left tabsRestored true, but the NEW manager's
      // restoreState (initTabEngine) runs async — without this, a roster click in the rebuild window
      // passes the !tabsRestored gate and createTabs concurrently with the new restore (Round-29/31; :90).
      this.tabsRestored = false;
      this.pendingAgentSelection = null; // drop the prior mount's queued click so it can't drain post-remount (Fix C)
      // Cancel the armed pending-persist debounce: its callback calls leaf.setViewState (the very
      // re-entry onOpen avoids) and would race the newly mounting manager; this path never reaches
      // destroyTabRuntime's persistTabStateImmediate that would otherwise clear it (:109).
      if (this.pendingPersist !== null) {
        window.clearTimeout(this.pendingPersist);
        this.pendingPersist = null;
      }
      // Capture the LIVE DM layout before destroying: the initial setState layout was already consumed
      // by the first initTabEngine, so without this the rebuilt engine restores nothing and the pane
      // goes blank. This live capture supersedes it; the rebuilt initTabEngine reopens these tabs (:90).
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
    // Reconcile OPEN DM tabs on a roster edit: provider-change rotation + un-grey (the reused
    // T5 reconcile) and read-only for deleted agents. Same re-entrant-safe `?.()` shape as
    // presence (SpecoratorView's roster:changed is likewise undebounced — the rotation only
    // fires on an actual provider mismatch, so an unrelated edit is cheap).
    this.rosterChangedUnsubscribe?.();
    this.rosterChangedUnsubscribe = this.plugin.events.on('roster:changed', () => void this.reconcileDmsOnRosterChange());
    // Round-62: surface a DM hydration failure as an inline banner (Fix 3, dispose+re-create like
    // presence) + keep the active DM tab's file cache fresh on vault changes (Fix 2). Mirror SpecoratorView.
    this.hydrationBanner?.dispose();
    this.hydrationBanner = createDmHydrationBanner(this.plugin, this);
    registerTeamChatDmFileEvents(this.plugin, () => this.tabManager?.getActiveTab() ?? null, (ref) => this.registerEvent(ref));
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
    // Empty state is the roster; never auto-mint a blank unbound tab on last-DM close (:Fix1).
    this.tabManager.autoCreateOnEmpty = false;
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
    if (conversationId) touchDmRecency(this.dmRecency, conversationId); // freshen LRU recency (T7)
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
        // Project the active DM's agent — or null when nothing restored, clearing the stale hint (:30).
        this.projectSelectedAgentFromActiveTab();
        this.tabsRestored = true;
        // Capacity is readable again now that tabsRestored is true (getTabSlotUsage
        // reported FULL while it was false). Mirror SpecoratorView: fire chat:tabs-changed
        // once (shared tabCountsPayload) so the Agent Board work-order queue re-ticks and
        // drains any runnable card, instead of stalling until an unrelated tab change
        // nudges it (:171).
        this.plugin.events.emit('chat:tabs-changed', tabCountsPayload(this.tabManager));
        // Round-42: reconcile restored DMs against their agent's CURRENT provider — no startup
        // event does after a deferred/closed-leaf restore. AFTER tabsRestored so selectAgent's
        // restore gate is open; its generation + manager-identity guards drop a superseded rebuild.
        await reconcileRestoredDmProviders(this.plugin, () => this.refreshProviderAvailability());
        // Drain a roster click queued while restoring (Round-48 Fix C) through openAgentDm so a
        // rejecting drained open is caught+logged, not unhandled (Round-63); guards supersede if stale.
        const pending = this.pendingAgentSelection;
        this.pendingAgentSelection = null;
        if (pending) void this.openAgentDm(pending);
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
    this.rosterChangedUnsubscribe?.();
    this.rosterChangedUnsubscribe = null;
    this.hydrationBanner?.dispose();
    this.hydrationBanner = null;
    await this.destroyTabRuntime();
    // Streaming DMs gone; surviving leaves recompute presence (destroyTab skips the callbacks) (:261).
    this.plugin.events.emit('teamChat:presence');
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
    await refreshBoundAgentDisplayModels(this.plugin, tabs); // recompute bound-agent display models before the un-grey/rotate below: a same-provider model change doesn't rotate, so the selector would keep the old model (mirror of SpecoratorView roster:changed)
    refreshDmModelState(this.plugin, tabs);
    await rotateChangedDmProviders(this.plugin, tabs, (agentId, staleId) => this.selectAgent(agentId, { preserveFocus: true, displacedConversationId: staleId })); // background provider-sync: preserveFocus so an inactive DM's rotation doesn't yank the pane off the DM the user is reading (Round-45); displacedConversationId threads the mismatched tab's own id so a post-reload cleanup can still close it (Round-48)
    this.emitTeamChatChange();
  }

  /**
   * Reconciles OPEN DM tabs on a `roster:changed` edit: the reused T5 reconcile
   * (`refreshProviderAvailability` — un-grey each DM + rotate any whose agent was re-pointed
   * at another immutable-per-conversation provider), then the deleted-agent handling (a DM
   * whose bound agent left the roster goes read-only via a deduped notice; the send-side
   * block is `InputController`'s `teamChatDmBoundAgentId` guard). Only open DM tabs are
   * touched. Errors are logged, never left as an unhandled rejection off the event handler.
   */
  private async reconcileDmsOnRosterChange(): Promise<void> {
    try {
      await this.refreshProviderAvailability();
      await noticeRemovedAgentDms(this.plugin, this.tabManager?.getAllTabs() ?? [], this.removedAgentDmsNotified);
    } catch (error) {
      this.plugin.logger.scope('team-chat').error('roster reconcile failed', error);
    }
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
  async selectAgent(agentId: string, options: { preserveFocus?: boolean; displacedConversationId?: string | null } = {}): Promise<void> {
    // Foreground selects bump the generation so the async open detects a newer select (last-click-wins)
    // or a torn-down/replaced engine (see isSelectionStale). A BACKGROUND rotation (preserveFocus) READS
    // it WITHOUT bumping, so it can't supersede a foreground click that lands mid-batch (Round-51).
    const generation = options.preserveFocus ? this.selectionGeneration : ++this.selectionGeneration;
    const manager = this.tabManager;
    if (!manager) return; // no engine yet (defensive; clicks only fire post-mount)
    // Restore still in flight (tabsRestored false): opening now would createTab a DM restoreState is
    // about to recreate. Queue only the LATEST FOREGROUND click (drained after restore; Round-48 Fix C,
    // :274/:400). A background rotation (preserveFocus) hitting this gate is DROPPED, not stored in the foreground-only slot — reconcileRestoredDmProviders re-reconciles it after tabsRestored (:234), so it can't clobber a queued click or lose preserveFocus (Round-54, completes Round-51's rotation decouple).
    if (!this.tabsRestored) { if (!options.preserveFocus) this.pendingAgentSelection = agentId; return; }
    if (!options.preserveFocus) this.pendingAgentSelection = null; // a FOREGROUND select supersedes a queued restore-time pick (last-click-wins, Round-50); a background rotation runs during reconcile BEFORE the drain, so it must NOT wipe it (Round-51)
    const isStale = options.preserveFocus
      ? () => this.tabManager !== manager                    // rotation: manager-identity ONLY — a foreground click's generation bump must not discard an in-flight rotation (Round-51)
      : () => this.isSelectionStale(generation, manager);    // foreground: generation + manager (unchanged)
    // Snapshot the currently-mapped DM before resolveOrCreate: a provider change rotates the mapping to a
    // FRESH conversation (Round-21/26), else the old tab stays attached — its old-provider runtime streaming
    // and holding a chat slot forever (:283).
    const previousConversationId = await this.getThreadStore().get(agentId);
    const conversationId = await this.getThreadStore().resolveOrCreate(agentId);
    // Bail if the leaf closed/re-opened or a newer select superseded this while resolveOrCreate was in
    // flight — else the open mounts into a detached manager or a DM the user already left (:209).
    if (isStale()) return;
    // The tab to close/reuse: an explicit displaced id (post-reload rotation cleanup), else the
    // pre-resolve mapping — but ONLY when it is genuinely THIS agent's own DM, never a corrupt map
    // pointing at an unrelated chat/DM that reconcileRotation would then force-close (Round-48 A; Round-57).
    const displaced = options.displacedConversationId ?? ownedDisplacedDmId(this.plugin, previousConversationId, agentId);
    // Serialize this leaf's open+reconcile on a per-leaf tail (Round-49): two fast clicks on
    // DIFFERENT agents (distinct conversationIds → NOT collapsed by the per-id coordinator) must
    // run one-at-a-time, else at full budget both evict the same LRU victim (double-close → cap
    // Notice + neither opens). The per-conversationId coordinator stays INSIDE to still collapse
    // two leaves opening the SAME DM (independent generations): without it both see
    // findConversationAcrossViews == null and each createTab, double-mounting one conversation; the
    // queued second re-runs, finds the tab, switches. Open body + stale guard: openResolvedTeamChatDm.
    await serializeOnTail(this.selectionOpenTail, async () => {
      await getTeamChatDmOpenCoordinator(this.plugin).serialize(conversationId, () =>
        openResolvedTeamChatDm(this.plugin, manager, this.leaf, this.dmRecency, conversationId,
          { isStale, displacedConversationId: displaced, preserveFocus: options.preserveFocus }));
      // Reconcile a provider-change rotation: record + notify a fresh rotation, close any displaced
      // old-provider tab once its replacement is open — deferred so a cap-blocked rotation closes on
      // the retry (:361). notify only when the mapping rotated THIS pass (post-reload cleanup: displaced
      // set, mapping unchanged — Round-48). Skip if a newer selection superseded this.
      if (!isStale()) {
        await reconcileRotation(this.plugin, agentId, displaced, conversationId, { notify: previousConversationId !== conversationId });
      }
    });
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

  /** The single plugin-scoped agent-DM thread store, shared by every Team Chat
   *  leaf so their mutations serialize and reflect each other (Round-20 Fix A). */
  private getThreadStore(): TeamChatThreadStore {
    return this.plugin.getTeamChatThreadStore();
  }

  private openAgentDm(agentId: string): Promise<void> {
    return this.selectAgent(agentId).catch((error) => this.plugin.logger.scope('team-chat').error('selectAgent failed', error));
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
      onSelectAgent: (agentId) => void this.openAgentDm(agentId),
      onOpenEditedFile: (path) => openEditedFile(this.plugin.app, path),
    };
  }

  /** Delegates to the shared projection (the active DM tab drives it) so the view stays a thin host. */
  private buildSnapshot(): TeamChatSnapshot {
    return projectTeamChatSnapshot(this.plugin, this.tabManager?.getActiveTab() ?? null, this.selectedAgentId);
  }

  /** Notifies every registered store observer (mirror of emitChatShellChange). */
  private emitTeamChatChange(): void {
    const snapshot = this.buildSnapshot();
    for (const observer of this.teamChatObservers) observer(snapshot);
  }

  /**
   * Returns+clears a DM's pending hydration failure (Round-62 Fix 3), the mirror of
   * `SpecoratorView.consumePendingHydrationError`: a DM tab's `restoreConversation` reaches this off its
   * owning `component` (this view) once bound, surfacing a banner recorded while the tab was still opening.
   */
  consumePendingHydrationError(conversationId: string): { code: string; message: string } | null {
    return this.hydrationBanner?.consumePendingHydrationError(conversationId) ?? null;
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
      // Mid-restore the live manager is only PARTIALLY restored, so persist the FULL saved layout still held in pendingTabManagerState — else a teardown-during-restore overwrites the leaf with a partial layout, dropping un-restored DMs (Round-54 data-loss). :255 nulls it once restore completes → the live manager thereafter.
      tabManagerState: (this.tabsRestored ? undefined : this.pendingTabManagerState) ?? this.tabManager?.getPersistedState(),
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
