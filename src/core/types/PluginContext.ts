import type { Plugin, WorkspaceLeaf } from 'obsidian';

import type { SpecoratorEventMap } from '../../app/events/specoratorEvents';
import type { BrowserSelectionContext } from '../../utils/browser';
import type { SharedAppStorage } from '../bootstrap/storage';
import type { EventBus } from '../events/EventBus';
import type { Logger } from '../logging/Logger';
import type { MissingMcpSecret } from '../mcp/mcpSecrets';
import type { AppTabManagerState, ConversationSwitchResult } from '../providers/types';
import type { ChatRuntime } from '../runtime/ChatRuntime';
import type { SecretStore } from '../security/secretStore';
import type {
  ChatMessageAction,
  Conversation,
  ConversationMeta,
  ConversationSnapshot,
  SpecoratorSettings,
} from './index';
import type { ProviderId } from './provider';
import type { EnvironmentScope, SecretEnvVarRef } from './settings';

/**
 * Narrow chat-tab manager surface consumed by the provider boundary.
 *
 * Providers broadcast runtime lifecycle work across open tabs without
 * importing the concrete `TabManager` from `features/`, keeping the core
 * contracts free of feature dependencies.
 */
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
  /** First open tab bound to a conversation, or null (neutral id shape). */
  findTabByConversation(conversationId: string): { tabId: string } | null;
  /** Whether a tab id is currently open. */
  hasTab(tabId: string): boolean;

  // --- Group D: purpose-built commands that keep TabData reach inside TabManager ---
  /** Best-effort cleanup of every tab's runtime (guards `tab.service` only). */
  disposeAllRuntimes(): void;
  /** Quiesce tabs bound to a conversation before its metadata is deleted. */
  quiesceTabsForConversation(conversationId: string): Promise<void>;
  /** Reset tabs bound to a deleted conversation back to a fresh chat. */
  repairTabsForConversation(conversationId: string): Promise<void>;
  /** Cancel affected in-flight streams; returns the affected tab ids as the frozen restart set. */
  cancelStreamingTabsForProviders(providerIds: ProviderId[]): string[];
  /** Force-restart the runtimes of the given (already-cancelled) tab ids; returns the count that threw. */
  restartRuntimeTabs(tabIds: string[], changed: boolean): Promise<number>;
}

/**
 * Narrow chat-view surface consumed by the provider boundary. The concrete
 * `SpecoratorView` implements this so provider settings tabs and runtimes can
 * refresh UI and reach the tab manager without `core/` depending on the view.
 */
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

/**
 * Narrow plugin surface the provider-neutral core and provider adaptors depend
 * on, replacing the concrete `SpecoratorPlugin` at the chat-facing boundary.
 *
 * `SpecoratorPlugin implements PluginContext`, so real plugins pass everywhere
 * this is required. Members mirror the concrete implementation exactly; the
 * interface adapts to `SpecoratorPlugin`, never the reverse. Inverting the
 * dependency here keeps `core/` and `providers/` independent of `src/main`.
 */
export interface PluginContext
  extends Pick<Plugin, 'app' | 'manifest' | 'loadData' | 'saveData'> {
  settings: SpecoratorSettings;
  storage: SharedAppStorage;
  readonly events: EventBus<SpecoratorEventMap>;
  readonly logger: Logger;
  readonly chatMessageActions: ChatMessageAction[];
  gitStatusWatcher: { refresh(): Promise<void> } | null;

  saveSettings(): Promise<void>;
  normalizeModelVariantSettings(): boolean;
  copyDiagnosticLogs(): Promise<void>;

  applyEnvironmentVariables(scope: EnvironmentScope, envText: string): Promise<void>;
  applyEnvironmentVariablesBatch(
    updates: Array<{ scope: EnvironmentScope; envText: string }>,
  ): Promise<void>;
  /** SEC-A: persist secret-var refs and reconcile/sync the affected provider scope. */
  applySecretEnvVars(refs: SecretEnvVarRef[], scope: EnvironmentScope): Promise<void>;
  /** SEC-A: keychain-backed secret value store (get/set/has/list/clear). */
  readonly secretStore: SecretStore;
  /** SEC-A: migrate plaintext secrets (shared/provider/snippet blobs) into SecretStorage; returns whether settings changed. */
  migrateEnvSecretsNow(): boolean;
  /** SEC-A: drop a deleted snippet's `snippet:<id>` secret refs and clear unreferenced values. */
  pruneSnippetSecrets(snippetId: string): boolean;
  /** SEC-A: warn (once per id) that an MCP server's migrated secret is absent on this device. */
  warnMissingMcpSecrets(missing: MissingMcpSecret[]): void;
  getActiveEnvironmentVariables(providerId?: ProviderId): string;
  /** SEC-A: parsed runtime env with SecretStorage values overlaid (for child-process spawns). */
  getResolvedEnvironmentVariables(providerId?: ProviderId): Record<string, string>;
  getEnvironmentVariablesForScope(scope: EnvironmentScope): string;
  getResolvedProviderCliPath(providerId: ProviderId): string | null;

  getActiveBrowserSelection(): BrowserSelectionContext | null;
  getActiveConversationSnapshot(): ConversationSnapshot | null;
  openConversation(
    conversationId: string,
    options?: { requireNewTab?: boolean; preferNewTab?: boolean; activate?: boolean },
  ): Promise<void>;
  activateView(): Promise<void>;

  createConversation(options?: {
    providerId?: ProviderId;
    sessionId?: string;
    boundAgentId?: string;
    surface?: 'chat' | 'team-chat';
  }): Promise<Conversation>;
  switchConversation(
    id: string,
    options?: { signal?: AbortSignal },
  ): Promise<Conversation | null>;
  switchConversationWithHydration(
    id: string,
    options?: { signal?: AbortSignal },
  ): Promise<ConversationSwitchResult | null>;
  deleteConversation(id: string): Promise<void>;
  renameConversation(id: string, title: string): Promise<void>;
  updateConversation(id: string, updates: Partial<Conversation>): Promise<void>;
  getConversationById(id: string): Promise<Conversation | null>;
  getConversationSync(id: string): Conversation | null;
  getConversationList(): ConversationMeta[];

  persistTabManagerState(state: AppTabManagerState): Promise<void>;

  /**
   * Resolves a bound roster agent's chat projection (system prompt + model) by
   * id, or `null` when unknown. The return shape is core-local so this contract
   * needs no `core/` → `features/` import; the plugin implements it via its
   * roster store. When `providerId` is supplied (the conversation's provider),
   * the projected `model` is only the agent's saved model if that model targets
   * the same provider — otherwise it is dropped so a cross-provider model id
   * never reaches a runtime it doesn't belong to.
   */
  resolveBoundAgent?(
    boundAgentId: string,
    providerId?: ProviderId,
  ): Promise<{ prompt?: string; model?: string } | null>;

  getView(): ChatViewHandle | null;
  getAllViews(): ChatViewHandle[];
  findConversationAcrossViews(
    conversationId: string,
  ): { view: ChatViewHandle; tabId: string } | null;
}
