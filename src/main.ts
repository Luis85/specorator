// Must run before any SDK imports to patch Electron/Node.js realm incompatibility
import { patchSetMaxListenersForElectron } from './utils/electronCompat';
patchSetMaxListenersForElectron();

import './providers';

import type { TFile, TFolder } from 'obsidian';
import { Notice, Plugin } from 'obsidian';

import { RosterAgentService } from './app/agents/RosterAgentService';
import { registerChatMessageActions } from './app/commands/registerChatMessageActions';
import { registerPluginCommands } from './app/commands/registerPluginCommands';
import { registerWorkspaceMenus } from './app/commands/registerWorkspaceMenus';
import { ConversationStore } from './app/conversations/ConversationStore';
import { EnvironmentApplyService } from './app/environment/EnvironmentApplyService';
import type { SpecoratorEventMap } from './app/events/specoratorEvents';
import { PluginLifecycle } from './app/lifecycle/PluginLifecycle';
import { registerWorkOrderCoordinators } from './app/registerWorkOrderCoordinators';
import { type RosterProjectionResult, type RosterRemovalResult } from './app/rosterAgentProjection';
import { DEFAULT_SPECORATOR_SETTINGS } from './app/settings/defaultSettings';
import { SharedStorageService } from './app/storage/SharedStorageService';
import { PluginViewActivator } from './app/views/PluginViewActivator';
import { registerPluginViews } from './app/views/registerPluginViews';
import type { SharedAppStorage } from './core/bootstrap/storage';
import { ChatTabReservations } from './core/chatTabReservations';
import { EventBus } from './core/events/EventBus';
import { formatLogEntries } from './core/logging/formatLogEntries';
import { Logger } from './core/logging/Logger';
import type { MissingMcpSecret } from './core/mcp/mcpSecrets';
import {
  getEnvironmentVariablesForScope as getScopedEnvironmentVariables,
  getRuntimeEnvironmentText,
  serializeEnvironmentVariables,
} from './core/providers/providerEnvironment';
import { ProviderRegistry } from './core/providers/ProviderRegistry';
import { ProviderSettingsCoordinator } from './core/providers/ProviderSettingsCoordinator';
import { ProviderWorkspaceRegistry } from './core/providers/ProviderWorkspaceRegistry';
import {
  migrateEnvSecrets,
  pruneScopeSecretRefs,
  resolveProviderEnvVars,
} from './core/providers/secretEnvVars';
import type {
  AppTabManagerState,
  ConversationSwitchResult,
  ProviderId,
} from './core/providers/types';
import { SecretStore } from './core/security/secretStore';
import { VaultFileAdapter } from './core/storage/VaultFileAdapter';
import type {
  ChatMessageAction,
  Conversation,
  ConversationMeta,
  ConversationSnapshot,
  SpecoratorSettings,
} from './core/types';
import { VIEW_TYPE_SPECORATOR } from './core/types';
import type { ChatViewHandle, PluginContext } from './core/types/PluginContext';
import { type EnvironmentScope, type SecretEnvVarRef } from './core/types/settings';
import type { UsageEventMap } from './core/usage/events';
import { UsageStorage } from './core/usage/UsageStorage';
import { UsageTracker } from './core/usage/UsageTracker';
import { AgentRosterStore } from './features/agents/roster/AgentRosterStore';
import type { BoundAgentProjection } from './features/agents/roster/boundAgentPersona';
import type { RosterAgent } from './features/agents/roster/rosterTypes';
import { isChatViewHandle, isSpecoratorView } from './features/chat/isSpecoratorView';
import type { GitStatusWatcher } from './features/chat/services/GitStatusWatcher';
import type { SpecoratorView } from './features/chat/SpecoratorView';
import { QuickActionFavoritesCache } from './features/quickActions/QuickActionFavoritesCache';
import { QuickActionLastUsedStore } from './features/quickActions/quickActionLastUsedStore';
import { QuickActionStorage } from './features/quickActions/QuickActionStorage';
import { buildProviderRecords } from './features/quickActions/skills/buildProviderRecords';
import { VaultSkillAggregator } from './features/quickActions/skills/VaultSkillAggregator';
import { SpecoratorSettingTab } from './features/settings/SpecoratorSettings';
import { ChatTabExecutionSurface } from './features/tasks/execution/ChatTabExecutionSurface';
import { ChatWorkOrderLinker } from './features/tasks/execution/ChatWorkOrderLinker';
import { createQueueControlState, type QueueControlState } from './features/tasks/execution/QueueRunner';
import { QueueSlotTracker } from './features/tasks/execution/QueueSlotTracker';
import { RunSidecarStore } from './features/tasks/storage/RunSidecarStore';
import { WorkOrderActivityProvider } from './features/tasks/ui/WorkOrderActivityProvider';
import { createTeamChatThreadStore, type TeamChatThreadStore } from './features/teamChat/teamChatThreadStoreFactory';
import { VIEW_TYPE_TEAM_CHAT } from './features/teamChat/viewType';
import { setLocale, t } from './i18n/i18n';
import type { Locale } from './i18n/types';
import type { BrowserSelectionContext } from './utils/browser';
import { getVaultPath } from './utils/path';

export default class SpecoratorPlugin extends Plugin implements PluginContext {
  settings!: SpecoratorSettings;
  /** SEC-A: keychain-backed secret store (Obsidian SecretStorage), set in onload. */
  secretStore!: SecretStore;
  /** SEC-A: secret ids already warned about as missing on this device (dedup). */
  private readonly warnedMissingSecretIds = new Set<string>();
  readonly events = new EventBus<SpecoratorEventMap>();
  readonly logger = new Logger({ enabled: false, level: 'warn' });
  /** Optional, registry-driven actions rendered in the chat user-message toolbar. */
  readonly chatMessageActions: ChatMessageAction[] = [];
  storage!: SharedAppStorage;
  gitStatusWatcher: GitStatusWatcher | null = null;
  conversationStore!: ConversationStore;
  /** Single plugin-scoped Team Chat DM thread store — one instance so every leaf
   *  shares its store-wide serialization + cache (Round-20). */
  private teamChatThreadStore: TeamChatThreadStore | null = null;
  /** Plugin-lifetime singleton. Built in onload before any consumer reads it. */
  public quickActionStorage!: QuickActionStorage;
  public quickActionFavoritesCache: QuickActionFavoritesCache | null = null;
  public quickActionLastUsedStore: QuickActionLastUsedStore | null = null;
  public vaultSkillAggregator: VaultSkillAggregator | null = null;
  public vaultFileAdapter!: VaultFileAdapter;
  /** Shared plugin-lifetime store for roster agent definitions. Constructed in onload
   * after vaultFileAdapter; consumers must not build their own instance. */
  public agentRosterStore!: AgentRosterStore;
  private rosterAgentService!: RosterAgentService;
  public usageTracker: UsageTracker | null = null;
  private lifecycle!: PluginLifecycle;
  private unloaded = true;
  private viewActivator!: PluginViewActivator;
  private envApply!: EnvironmentApplyService;
  /** Plugin-level concurrency gate shared by every Agent Board queue runner. */
  queueSlotTracker!: QueueSlotTracker;
  /** Shared sidecar store for per-run heartbeat + ledger writes under
   * `.specorator/runs/<runId>/`. Coordinators in different Agent Board panes
   * route through this single instance so cross-pane writes don't race. */
  runSidecarStore!: RunSidecarStore;
  /**
   * Identifies this plugin instance to per-run sidecars. Minted at construction
   * (NOT in onload) so a unit-test stub or restored-leaf path that reads it
   * before onload still sees a stable id. Stamped on every heartbeat write;
   * orphan recovery uses a mismatch to detect "previous plugin load" sidecars
   * immediately, without waiting for the 5-minute stale-`at` window.
   */
  readonly runtimeId: string = generateRuntimeId();
  /** Shared in-flight work-order ids, so coordinators in different Agent Board
   * panes observe the same active runs and never double-launch the same card. */
  readonly taskActiveRuns = new Set<string>();
  /** The queue's single global control state (pause/halt/failure-count), shared
   * by every board's runner. It starts paused on every plugin load; the user
   * must explicitly run the queue for this session. */
  readonly queueControl: QueueControlState = createQueueControlState(true);
  /** Chat tabs queue runs have committed to opening but not yet created. Shared
   * so concurrent Agent Board panes can't double-book the same free tabs. */
  readonly chatTabReservations = new ChatTabReservations();
  workOrderActivity: WorkOrderActivityProvider | null = null;
  lastKnownTabManagerState: AppTabManagerState | null = null;

  async onload() {
    this.unloaded = false;
    await this.loadSettings();

    this.logger.setEnabled(this.settings.loggingEnabled ?? false);
    this.logger.setLevel(this.settings.logLevel ?? 'warn');
    this.events.setErrorSink((error, event) => {
      this.logger.scope('events').error(`handler for "${event}" threw`, error);
    });

    this.lifecycle = new PluginLifecycle(this);
    // installGitWatcher is light (object construction + 4 event registrations,
    // no IO until first subscriber attaches) but view restoration reads
    // `gitStatusWatcher` synchronously in the chat shell's buildGitSlice
    // projection, so it stays here to keep the git button wired on a restored leaf.
    this.lifecycle.installGitWatcher();

    this.viewActivator = new PluginViewActivator(this);
    this.envApply = new EnvironmentApplyService(this);
    this.queueSlotTracker = new QueueSlotTracker(this.settings.agentBoardQueueCap);
    this.runSidecarStore = new RunSidecarStore(this.app.vault.adapter, '.specorator/runs');
    this.workOrderActivity = new WorkOrderActivityProvider(this);
    this.workOrderActivity.start();
    this.register(() => {
      this.workOrderActivity?.dispose();
      this.workOrderActivity = null;
    });

    const taskExecutionSurface = new ChatTabExecutionSurface(this);
    registerWorkOrderCoordinators(this, taskExecutionSurface);

    registerPluginViews({ plugin: this, taskExecutionSurface });

    const chatWorkOrderLinker = new ChatWorkOrderLinker(this);
    registerChatMessageActions({ plugin: this, chatWorkOrderLinker });
    registerPluginCommands({ plugin: this, taskExecutionSurface, chatWorkOrderLinker });

    this.quickActionStorage = new QuickActionStorage(
      new VaultFileAdapter(this.app),
      () => this.settings.quickActionsFolder ?? 'Quick Actions',
    );
    this.quickActionFavoritesCache = new QuickActionFavoritesCache(
      this.quickActionStorage,
      this.app,
      () => this.settings.quickActionsFolder ?? 'Quick Actions',
    );
    this.quickActionFavoritesCache.start();

    this.vaultFileAdapter = new VaultFileAdapter(this.app);
    const rosterLog = this.logger.scope('agents');
    this.agentRosterStore = new AgentRosterStore(this.vaultFileAdapter, this.events,
      (path, error) => rosterLog.warn('skipped malformed roster file', path, error));
    this.rosterAgentService = new RosterAgentService({
      rosterStore: this.agentRosterStore,
      vaultFileAdapter: this.vaultFileAdapter,
      logger: this.logger,
      getSettings: () => this.settings,
      getSkillAggregator: () => this.vaultSkillAggregator,
    });

    // Usage tracker must subscribe to the bus BEFORE any entry point that
    // can emit `usage.recorded` is registered. The file/folder context menu
    // (`registerWorkspaceMenus`) is the earliest such entry point — if a
    // user fires a quick action between onload and onLayoutReady, the bus
    // would silently drop the event and the leaderboard would undercount.
    // Hydration is awaited so the in-memory map reflects disk state before
    // start() subscribes; without this ordering, an event that lands
    // between subscribe and hydrate would be wiped by hydrate's clear().
    const usageStorage = new UsageStorage(new VaultFileAdapter(this.app), this.logger);
    this.usageTracker = new UsageTracker(
      this.events as unknown as EventBus<UsageEventMap>,
      usageStorage,
      () => Date.now(),
      this.logger,
    );
    await this.usageTracker.hydrate();
    this.usageTracker.start();

    registerWorkspaceMenus(this);


    this.addSettingTab(new SpecoratorSettingTab(this.app, this));

    // Heavy provider workspace initialization is deferred until the workspace
    // finishes restoring leaves. ProviderWorkspaceRegistry.initializeAll walks
    // Claude MCP/plugins/agents, Codex skills/subagents, and Cursor's model
    // catalog — running these concurrently still costs hundreds of ms of
    // sync-blocking work on cold start. onLayoutReady is Obsidian's "boot
    // finished" signal; provider services don't have to exist for view
    // restoration since runtime services are lazy-initialized per tab.
    this.app.workspace.onLayoutReady(() => {
      void this.completeDeferredOnload();
    });
  }

  private async completeDeferredOnload(): Promise<void> {
    try {
      await ProviderWorkspaceRegistry.initializeAll(this);
    } catch (error) {
      this.logger.scope('onload').error('provider workspace init failed', error);
      return;
    }
    if (this.unloaded) return;
    // Skills tab cache: hydrate persisted index, then pre-warm in background.
    const aggregator = new VaultSkillAggregator(
      () => buildProviderRecords(this),
      {
        logger: this.logger,
        eventBus: this.events,
        cacheAdapter: new VaultFileAdapter(this.app),
        ttlMs: 60_000,
      },
    );
    this.vaultSkillAggregator = aggregator;
    await aggregator.hydrate();
    if (this.unloaded || this.vaultSkillAggregator !== aggregator) {
      aggregator.dispose();
      return;
    }
    void aggregator.listAllStreaming(() => {});
    const lastUsedStore = new QuickActionLastUsedStore({
      adapter: new VaultFileAdapter(this.app),
      logger: this.logger.scope('quickActions'),
    });
    await lastUsedStore.hydrate();
    if (this.unloaded) return;
    this.quickActionLastUsedStore = lastUsedStore;
    // Restored views constructed before provider services were ready may have
    // mounted the empty-state placeholder; reprobe so they can promote to the
    // full tab UI now that providers are available.
    for (const view of this.getAllViews()) {
      try {
        await view.refreshProviderAvailability();
      } catch (error) {
        this.logger.scope('onload').error('view refresh after deferred init failed', error);
      }
    }
  }

  onunload(): void {
    this.unloaded = true;
    if (this.usageTracker) {
      void this.usageTracker.flush();
      this.usageTracker.dispose();
      this.usageTracker = null;
    }
    this.vaultSkillAggregator?.dispose();
    this.vaultSkillAggregator = null;
    this.quickActionFavoritesCache?.dispose();
    this.quickActionFavoritesCache = null;
    this.gitStatusWatcher?.stop();
    this.gitStatusWatcher = null;
    // Null the fields BEFORE the async teardown so any in-flight `set()` from a
    // still-mounted modal short-circuits instead of arming another write against
    // a store we're about to discard. Obsidian calls onunload() synchronously and
    // ignores its return, so the flush/stop run fire-and-forget (flush before
    // stop is preserved by the awaited sequence inside the IIFE).
    const store = this.quickActionLastUsedStore;
    this.quickActionLastUsedStore = null;
    void (async () => {
      if (store) await store.flush();
    })();
    this.lifecycle?.shutdownActiveRuntimes();
    void this.lifecycle?.persistOpenTabStates();
  }

  resolveBoundAgent(
    boundAgentId: string,
    providerId?: ProviderId,
  ): Promise<BoundAgentProjection | null> {
    return this.rosterAgentService.resolveBoundAgent(boundAgentId, providerId);
  }

  resolveAgentRunTarget(
    agentId: string,
  ): Promise<{ providerId: ProviderId; model: string } | null> {
    return this.rosterAgentService.resolveAgentRunTarget(agentId);
  }

  async addFileToActiveChat(file: TFile): Promise<boolean> {
    const view = await this.ensureViewOpen();
    const activeTab = view?.getActiveTab();
    const fileContextManager = activeTab?.ui.fileContextManager;

    if (!activeTab || !fileContextManager) {
      new Notice(t('chat.context.fileNoTab'));
      return false;
    }

    if (!fileContextManager.attachFileAsPill(file.path)) {
      new Notice(t('chat.context.fileAttachFailed', { path: file.path }));
      return false;
    }

    activeTab.dom.inputEl.focus();
    new Notice(t('chat.context.fileAdded', { path: file.path }));
    return true;
  }

  async addFolderToActiveChat(folder: TFolder): Promise<boolean> {
    const view = await this.ensureViewOpen();
    const activeTab = view?.getActiveTab();
    const fileContextManager = activeTab?.ui.fileContextManager;

    if (!activeTab || !fileContextManager) {
      new Notice(t('chat.context.folderNoTab'));
      return false;
    }

    if (!fileContextManager.attachFolderAsPill(folder.path)) {
      new Notice(t('chat.context.folderAttachFailed', { path: folder.path }));
      return false;
    }

    activeTab.dom.inputEl.focus();
    new Notice(t('chat.context.folderAdded', { path: folder.path }));
    return true;
  }

  async activateView(): Promise<void> {
    return this.viewActivator.activateView();
  }

  async activateAgentBoardView(): Promise<void> {
    return this.viewActivator.activateAgentBoardView();
  }

  async runNextReadyWorkOrder(): Promise<void> {
    return this.viewActivator.runNextReadyWorkOrder();
  }

  async openWorkOrderInBoard(file: TFile): Promise<void> {
    return this.viewActivator.openWorkOrderInBoard(file);
  }

  canCreateNewTab(): boolean {
    return this.viewActivator.canCreateNewTab();
  }

  getTabSlotUsage(): { used: number; max: number } {
    return this.viewActivator.getTabSlotUsage();
  }

  private async ensureViewOpen(): Promise<SpecoratorView | null> {
    return this.viewActivator.ensureViewOpen();
  }

  async openNewTab(): Promise<void> {
    return this.viewActivator.openNewTab();
  }

  async loadSettings() {
    this.storage = new SharedStorageService(this);
    this.conversationStore = new ConversationStore({
      storage: this.storage,
      getVaultPath: () => getVaultPath(this.app),
      quiesceViewsForDelete: (conversationId) => this.quiesceViewsBeforeConversationDelete(conversationId),
      repairViewsAfterDelete: (conversationId) => this.repairViewsAfterConversationDelete(conversationId),
      events: this.events,
    });
    const { specorator } = await this.storage.initialize();
    this.lastKnownTabManagerState = await this.storage.getTabManagerState();

    this.settings = {
      ...DEFAULT_SPECORATOR_SETTINGS,
      ...specorator,
    };

    // SEC-A: keychain-backed secret store. Requires Obsidian >= 1.11.5 (the
    // plugin's minAppVersion), so app.secretStorage is always present.
    this.secretStore = new SecretStore(this.app.secretStorage);
    // One-time migration of any plaintext API keys/tokens in the active env
    // blobs into SecretStorage (idempotent; cheap no-op once done).
    const didMigrateSecrets = migrateEnvSecrets(
      this.settings,
      ProviderRegistry.getRegisteredProviderIds(),
      this.secretStore,
    );

    // Plan mode is ephemeral — normalize back to normal on load so the app
    // doesn't start stuck in plan mode after a restart (prePlanPermissionMode is lost)
    if (this.settings.permissionMode === 'plan') {
      this.settings.permissionMode = 'normal';
    }
    if (
      this.settings.savedProviderPermissionMode
      && typeof this.settings.savedProviderPermissionMode === 'object'
      && !Array.isArray(this.settings.savedProviderPermissionMode)
    ) {
      for (const [providerId, mode] of Object.entries(this.settings.savedProviderPermissionMode)) {
        if (mode === 'plan') {
          this.settings.savedProviderPermissionMode[providerId] = 'normal';
        }
      }
    }
    const didNormalizeProviderSelection = ProviderSettingsCoordinator.normalizeProviderSelection(
      this.settings,
    );
    const didNormalizeModelVariants = this.normalizeModelVariantSettings();

    const backfilledConversations = await this.conversationStore.loadConversations();
    setLocale(this.settings.locale as Locale);

    const { changed, invalidatedConversations } = this.reconcileModelWithEnvironment();

    ProviderSettingsCoordinator.projectActiveProviderState(
      this.settings,
    );

    if (changed || didNormalizeModelVariants || didNormalizeProviderSelection || didMigrateSecrets) {
      await this.saveSettings();
    }

    const conversationsToSave = new Set([...backfilledConversations, ...invalidatedConversations]);
    for (const conv of conversationsToSave) {
      await this.storage.sessions.saveMetadata(
        this.storage.sessions.toSessionMetadata(conv)
      );
    }
  }

  normalizeModelVariantSettings(): boolean {
    return ProviderSettingsCoordinator.normalizeAllModelVariants(
      this.settings,
    );
  }

  async copyDiagnosticLogs(): Promise<void> {
    const entries = this.logger.snapshot();
    if (entries.length === 0) {
      new Notice(t('diagnostics.logsEmpty'));
      return;
    }
    await navigator.clipboard.writeText(formatLogEntries(entries));
    new Notice(t('diagnostics.logsCopied', { count: entries.length }));
  }

  async saveSettings() {
    ProviderSettingsCoordinator.normalizeProviderSelection(
      this.settings,
    );
    ProviderSettingsCoordinator.persistProjectedProviderState(
      this.settings,
    );

    await this.storage.saveSpecoratorSettings(this.settings);
    // The queue cap is global, shared across every board's runner, so syncing it
    // here makes a settings change take effect live without a board refresh.
    this.queueSlotTracker?.setCap(this.settings.agentBoardQueueCap);
    // Any settings change can change what the queue may launch: the concurrency
    // cap, the chat-tab limit (free execution slots), or a card's eligibility
    // (provider enabled, model availability). Wake every open board's runner so
    // it re-evaluates at once instead of stalling until an unrelated
    // chat/status/run/vault event ticks it. tick() is idempotent and cheap, so
    // an unrelated settings change is a harmless no-op re-evaluation.
    this.events.emit('task:queue-cap-changed');
    // `plugin.settings` is not reactive, so views that snapshot a setting can't
    // observe a change made on the Settings tab (a modal over their leaf). This
    // is the single persistence path for every field (registry renderer +
    // imperative sections), so one event here lets any subscriber re-read live.
    this.events.emit('settings-changed');
  }

  /** Updates and persists environment variables, restarting processes to apply changes. */
  async applyEnvironmentVariables(scope: EnvironmentScope, envText: string): Promise<void> {
    return this.envApply.apply(scope, envText);
  }

  async applyEnvironmentVariablesBatch(
    updates: Array<{ scope: EnvironmentScope; envText: string }>,
  ): Promise<void> {
    return this.envApply.applyBatch(updates);
  }

  /** SEC-A: persist secret-var refs and run the env reconcile/sync for the scope. */
  async applySecretEnvVars(refs: SecretEnvVarRef[], scope: EnvironmentScope): Promise<void> {
    return this.envApply.applySecretEnvVars(refs, scope);
  }

  /** SEC-A: migrate plaintext secrets (shared/provider/snippet blobs) into SecretStorage. */
  migrateEnvSecretsNow(): boolean {
    return migrateEnvSecrets(
      this.settings,
      ProviderRegistry.getRegisteredProviderIds(),
      this.secretStore,
    );
  }

  /** SEC-A: drop a deleted snippet's secret refs and clear values no other ref uses. */
  pruneSnippetSecrets(snippetId: string): boolean {
    return pruneScopeSecretRefs(
      this.settings,
      `snippet:${snippetId}`,
      (id) => this.secretStore.clear(id),
    );
  }

  /** Returns the runtime environment variables (fixed at plugin load). */
  getActiveEnvironmentVariables(
    providerId: ProviderId = ProviderRegistry.resolveSettingsProviderId(
      this.settings,
    ),
  ): string {
    return getRuntimeEnvironmentText(
      this.settings,
      providerId,
    );
  }

  /**
   * SEC-A: the parsed runtime env for a provider with secret values overlaid
   * from SecretStorage. This is what every child-process spawn path uses — the
   * plaintext blob (via `getActiveEnvironmentVariables`) no longer carries keys.
   * A secret that is absent on this device (e.g. synced from another machine) is
   * left unset rather than injected empty; the settings UI prompts re-entry.
   */
  getResolvedEnvironmentVariables(
    providerId: ProviderId = ProviderRegistry.resolveSettingsProviderId(
      this.settings,
    ),
  ): Record<string, string> {
    const { env, missing } = this.resolveProviderEnv(providerId);
    if (missing.length > 0) {
      this.warnMissingDeviceSecrets(missing);
    }
    return env;
  }

  /** Parse the provider env and overlay SecretStorage values; reports missing refs. */
  private resolveProviderEnv(
    providerId: ProviderId,
  ): { env: Record<string, string>; missing: SecretEnvVarRef[] } {
    return resolveProviderEnvVars(this.settings, providerId, (id) => this.secretStore.get(id));
  }

  /**
   * SEC-A: env text for env-hash reconciliation plus the names of any referenced
   * secrets missing on this device. Hashing the resolved env keeps a watched
   * key's value stable across the plaintext→keychain move; `missingKeys` lets the
   * reconciler defer invalidation only when one of ITS watched keys isn't present.
   */
  getEnvironmentHashInput(
    providerId: ProviderId = ProviderRegistry.resolveSettingsProviderId(
      this.settings,
    ),
  ): { text: string; missingKeys: string[] } {
    const { env, missing } = this.resolveProviderEnv(providerId);
    return { text: serializeEnvironmentVariables(env), missingKeys: missing.map((ref) => ref.name) };
  }

  /**
   * SEC-A: a secret referenced by settings but absent in this device's
   * SecretStorage (e.g. settings synced from another machine). It's omitted from
   * the launch env rather than injected empty; surface it once per id via a
   * user-visible Notice (not the diagnostic logger, which is off by default and
   * not yet enabled during initial load) so the user knows to re-enter it. The
   * full settings re-entry UI lands in Phase 4.
   */
  private warnMissingDeviceSecrets(missing: SecretEnvVarRef[]): void {
    for (const ref of missing) {
      if (this.warnedMissingSecretIds.has(ref.secretId)) continue;
      this.warnedMissingSecretIds.add(ref.secretId);
      this.logger.scope('secrets').debug(`Secret "${ref.name}" (${ref.scope}) missing on this device.`);
      new Notice(t('env.secretMissing', { name: ref.name }));
    }
  }

  /**
   * SEC-A Phase 3: surface MCP auth-header / stdio-env secrets that are absent on
   * this device (e.g. a vault synced from another machine) so the user re-enters
   * them in the server's settings, mirroring the provider env-secret prompt.
   * Otherwise the server launches/tests without its credential while the editor
   * still shows a masked ref. Deduped by id alongside env secrets.
   */
  warnMissingMcpSecrets(missing: MissingMcpSecret[]): void {
    for (const ref of missing) {
      if (this.warnedMissingSecretIds.has(ref.secretId)) continue;
      this.warnedMissingSecretIds.add(ref.secretId);
      this.logger
        .scope('secrets')
        .debug(`MCP secret "${ref.name}" for "${ref.serverName}" missing on this device.`);
      new Notice(t('env.secretMissing', { name: `${ref.serverName}: ${ref.name}` }));
    }
  }

  getActiveBrowserSelection(): BrowserSelectionContext | null {
    return this.getView()?.getActiveTab()?.controllers.browserSelectionController?.getContext() ?? null;
  }

  registerChatMessageAction(action: ChatMessageAction): void {
    this.chatMessageActions.push(action);
  }

  getActiveConversationSnapshot(): ConversationSnapshot | null {
    const conversationId = this.getView()?.getActiveTab()?.conversationId;
    if (!conversationId) return null;
    const title = this.getConversationSync(conversationId)?.title ?? 'Conversation';
    return { id: conversationId, title };
  }

  async openConversation(
    conversationId: string,
    options: { requireNewTab?: boolean; preferNewTab?: boolean; activate?: boolean } = {},
  ): Promise<void> {
    if (!this.getConversationSync(conversationId)) {
      new Notice(t('chat.history.linkedNotFound'));
      return;
    }
    await this.activateView();
    const view = await this.ensureViewOpen();
    await view?.getTabManager()?.openConversation(conversationId, options);
  }

  syncRosterAgentsToProviders(): Promise<RosterProjectionResult> {
    return this.rosterAgentService.syncRosterAgentsToProviders();
  }

  removeRosterAgentProjection(agent: RosterAgent): Promise<RosterRemovalResult> {
    return this.rosterAgentService.removeRosterAgentProjection(agent);
  }

  getEnvironmentVariablesForScope(scope: EnvironmentScope): string {
    return getScopedEnvironmentVariables(
      this.settings,
      scope,
    );
  }

  getResolvedProviderCliPath(providerId: ProviderId): string | null {
    const cliResolver = ProviderWorkspaceRegistry.getCliResolver(providerId);
    if (!cliResolver) {
      return null;
    }

    return cliResolver.resolveFromSettings(this.settings);
  }

  private reconcileModelWithEnvironment(providerIds: ProviderId[] = ProviderRegistry.getRegisteredProviderIds()): {
    changed: boolean;
    invalidatedConversations: Conversation[];
  } {
    return ProviderSettingsCoordinator.reconcileProviders(
      this.settings,
      this.conversationStore.getConversations(),
      providerIds,
      // SEC-A: hash the resolved env (secrets overlaid) and defer invalidation
      // when a referenced secret is missing on this device.
      (providerId) => this.getEnvironmentHashInput(providerId),
    );
  }

  private getAffectedEnvironmentProviders(scopes: EnvironmentScope[]): ProviderId[] {
    const registeredProviderIds = new Set(ProviderRegistry.getRegisteredProviderIds());
    const affectedProviderIds = new Set<ProviderId>();

    for (const scope of scopes) {
      if (scope === 'shared') {
        for (const providerId of registeredProviderIds) {
          affectedProviderIds.add(providerId);
        }
        continue;
      }

      const providerId = scope.slice('provider:'.length);
      if (registeredProviderIds.has(providerId)) {
        affectedProviderIds.add(providerId);
      }
    }

    return Array.from(affectedProviderIds);
  }

  // Cancels any active stream and resets every open tab bound to a deleted
  // conversation back to a fresh conversation. Lives on the shell because it
  // reaches concrete view/tab controllers; the store invokes it through a
  // narrow callback so it stays free of feature dependencies.
  private async quiesceViewsBeforeConversationDelete(conversationId: string): Promise<void> {
    for (const view of this.getAllViews()) {
      await view.getTabManager()?.quiesceTabsForConversation(conversationId);
    }
  }

  // Resets every open tab bound to a deleted conversation back to a fresh chat.
  private async repairViewsAfterConversationDelete(conversationId: string): Promise<void> {
    for (const view of this.getAllViews()) {
      await view.getTabManager()?.repairTabsForConversation(conversationId);
    }
  }

  createConversation(options?: {
    providerId?: ProviderId;
    sessionId?: string;
    boundAgentId?: string;
    surface?: 'chat' | 'team-chat';
  }): Promise<Conversation> {
    return this.conversationStore.createConversation(options);
  }

  async switchConversation(
    id: string,
    options?: { signal?: AbortSignal },
  ): Promise<Conversation | null> {
    const result = await this.switchConversationWithHydration(id, options);
    return result?.conversation ?? null;
  }

  switchConversationWithHydration(
    id: string,
    options?: { signal?: AbortSignal },
  ): Promise<ConversationSwitchResult | null> {
    return this.conversationStore.switchConversation(id, options);
  }

  deleteConversation(id: string): Promise<void> {
    return this.conversationStore.deleteConversation(id);
  }

  renameConversation(id: string, title: string): Promise<void> {
    return this.conversationStore.renameConversation(id, title);
  }

  updateConversation(id: string, updates: Partial<Conversation>): Promise<void> {
    return this.conversationStore.updateConversation(id, updates);
  }

  getConversationById(id: string): Promise<Conversation | null> {
    return this.conversationStore.getConversationById(id);
  }

  findTeamChatConversationForAgent(agentId: string, providerId?: ProviderId): Conversation | null {
    return this.conversationStore.findTeamChatConversationForAgent(agentId, providerId);
  }

  /** The single plugin-scoped Team Chat DM thread store (lazy; reset on reload). */
  getTeamChatThreadStore(): TeamChatThreadStore {
    return (this.teamChatThreadStore ??= createTeamChatThreadStore(this));
  }

  getConversationSync(id: string): Conversation | null {
    return this.conversationStore.getConversationSync(id);
  }

  findEmptyConversation(): Conversation | null {
    return this.conversationStore.findEmptyConversation();
  }

  getConversationList(): ConversationMeta[] {
    return this.conversationStore.getConversationList();
  }

  async persistTabManagerState(state: AppTabManagerState): Promise<void> {
    this.lastKnownTabManagerState = state;
    await this.storage.setTabManagerState(state);
  }

  // Deliberate asymmetry with getAllViews(): getView() stays sidebar-scoped
  // (VIEW_TYPE_SPECORATOR only). It backs getActiveConversationSnapshot (the
  // *sidebar's* active conversation) and PluginViewActivator slot/new-tab logic,
  // so a Team Chat leaf must never answer "the active sidebar conversation".
  // Team Chat rebases its own toolbar actions onto its owning tab instead.
  getView(): SpecoratorView | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_SPECORATOR);
    return leaves.map(leaf => leaf.view).find(isSpecoratorView) ?? null;
  }

  // Enumerates BOTH chat-engine hosts (sidebar + Team Chat), unlike getView()
  // above. Every broadcast/lifecycle site — env-var runtime restarts, provider
  // availability + settings refresh, runtime shutdown, conversation-delete
  // quiesce/repair, findConversationAcrossViews — must reach Team Chat DM
  // runtimes, so this filters through the host-agnostic isChatViewHandle rather
  // than narrowing to the concrete SpecoratorView.
  getAllViews(): ChatViewHandle[] {
    const leaves = [
      ...this.app.workspace.getLeavesOfType(VIEW_TYPE_SPECORATOR),
      ...this.app.workspace.getLeavesOfType(VIEW_TYPE_TEAM_CHAT),
    ];
    // Narrow from `unknown`: ChatViewHandle is not an Obsidian `View` subtype
    // (unlike SpecoratorView), so the type-guard filter overload needs it.
    return leaves.map(leaf => leaf.view as unknown).filter(isChatViewHandle);
  }

  findConversationAcrossViews(conversationId: string): { view: ChatViewHandle; tabId: string } | null {
    for (const view of this.getAllViews()) {
      const match = view.getTabManager()?.findTabByConversation(conversationId);
      if (match) return { view, tabId: match.tabId };
    }
    return null;
  }

}

/**
 * Mint a stable id for this plugin instance. Stamped into every sidecar
 * heartbeat so orphan recovery can detect "previous plugin load" sidecars
 * without waiting for the 5-minute stale-`at` window. Prefers Web Crypto's
 * `randomUUID`; falls back to a `time-rand` token for ancient runtimes.
 */
function generateRuntimeId(): string {
  const cryptoApi = (window as Window & { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
