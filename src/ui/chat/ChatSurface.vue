<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed, inject, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useTabsStore } from '@/ui/stores/tabsStore';
import { useNotificationPort } from '@/ui/composables/useNotificationPort';
import { useLoggerPort } from '@/ui/composables/useLoggerPort';
import { useProviderHistoryPort } from '@/ui/composables/useProviderHistoryPort';
import {
	useChatRuntimeFactory,
	useChooseForkTarget,
	useInstructionConfirm,
	useOpenMcpServerModal,
	useOpenMcpTestModal,
	useOpenProviderConsent,
} from '@/ui/chat/modalSeam';
import { RunChatTurnUseCase } from '@/application/chat/RunChatTurnUseCase';
import { GenerateTitleUseCase } from '@/application/threads/GenerateTitleUseCase';
import type {
	ChatMessage,
	ChatRuntimePort,
	MentionDataProviderPort,
	ProviderCommandCatalogPort,
	ShellExecPort,
	WorkspacePort,
	VaultPort,
	SelectionSourcePort,
	SelectionHighlightPort,
} from '@/domain/ports';
import type { PluginSettings } from '@/domain/settings/PluginSettings';
import type { AttachedFileRef, AttachedImage } from '@/domain/chat/attachments';
import { err } from '@/domain/shared/Result';
import {
	SETTINGS_PORT,
	MENTION_DATA_PROVIDER_PORT,
	PROVIDER_COMMAND_CATALOG_PORT,
	SHELL_EXEC_PORT,
	AUX_MODEL_PORT,
	WORKSPACE_PORT,
	VAULT_PORT,
	SELECTION_SOURCE_PORT,
	SELECTION_HIGHLIGHT_PORT,
	TOOLBAR_CATALOG_PORT,
	APPROVAL_RULE_STORE_PORT,
	MCP_CONFIG_STORE_PORT,
	PROVIDER_REGISTRY_PORT,
} from '@/infrastructure/bridge/ports';
import type {
	ToolbarCatalogPort,
	ApprovalRuleStorePort,
	ApprovalRule,
	McpConfigStorePort,
	ProviderRegistryPort,
} from '@/domain/ports';
import type { ProviderId } from '@/domain/chat/ProviderId';
import { DEFAULT_CHAT_PROVIDER_ID } from '@/domain/chat/providers/ProviderDescriptor';
import { SelectProviderUseCase } from '@/application/chat/providers/SelectProviderUseCase';
import { ProviderConsentGate } from '@/application/chat/providers/ProviderConsentGate';
import {
	buildProviderViewModel,
	type ProviderViewModel,
} from '@/application/chat/providers/buildProviderViewModel';
import ProviderChooser from './providers/ProviderChooser.vue';
import type { TabControls } from '@/domain/chat/toolbar/TabControls';
import type { PermissionMode } from '@/domain/chat/PermissionMode';
import type { ReasoningChoice } from '@/domain/chat/Reasoning';
import { ApprovalManager } from '@/application/chat/approvals/ApprovalManager';
import { ApprovalGateRuntime } from '@/ui/chat/composer/ApprovalGateRuntime';
import { FeedbackService } from '@/application/shared/FeedbackService';
import {
	buildToolbarViewModel,
	type ToolbarViewModel,
} from '@/application/chat/toolbar/buildToolbarViewModel';
import { useOpenImagePreview, usePickAttachment } from '@/ui/chat/modalSeam';
import { useCapturedSelection } from '@/ui/composables/useCapturedSelection';
import { AddFileContextUseCase } from '@/application/chat/attachments/AddFileContextUseCase';
import { AddImageUseCase } from '@/application/chat/attachments/AddImageUseCase';
import { resolveImageMime } from '@/infrastructure/image/imageEncode';
import { clampMaxTabs } from '@/domain/settings/PluginSettings';
import { RunCommandUseCase } from '@/application/chat/composer/RunCommandUseCase';
import { ResolveMentionUseCase } from '@/application/chat/composer/ResolveMentionUseCase';
import {
	SubmitBangBashUseCase,
	type BangBashOutput,
} from '@/application/chat/composer/SubmitBangBashUseCase';
import { RefineInstructionUseCase } from '@/application/chat/composer/RefineInstructionUseCase';
import { RespondToInlineBlockUseCase } from '@/application/chat/composer/RespondToInlineBlockUseCase';
import { useComposerMode } from '@/ui/chat/composer/useComposerMode';
import { EnqueueRuntime } from '@/ui/chat/composer/EnqueueRuntime';
import type { BuiltInAction } from '@/application/chat/composer/builtInCommands';
import { McpServerManager, type McpServerDraft } from '@/application/chat/mcp/McpServerManager';
import {
	buildMcpViewModel,
	type McpViewModel,
} from '@/application/chat/mcp/buildMcpViewModel';
import type { ManagedMcpServer } from '@/domain/chat/mcp/McpTypes';
import WelcomeGreeting from './WelcomeGreeting.vue';
import MessageList from './MessageList.vue';
import UsageInfo from './UsageInfo.vue';
import ChatComposer from './ChatComposer.vue';
import TabBar from './TabBar.vue';
import ResumeSessionDropdown from './ResumeSessionDropdown.vue';
import ApprovalsPanel from './approvals/ApprovalsPanel.vue';
import McpSettingsManager from './mcp/McpSettingsManager.vue';

/**
 * The chat container (SPEC-CC-018, extended P3 — SPEC-TS-026). Now driven by the
 * ACTIVE tab's `TabState` (via `tabsStore.activeTab`), not a single chatStore root.
 * It composes `TabBar` ABOVE the message region; the welcome/message/busy/usage/
 * composer layout reads the active tab. A compact action (`chat-compact`) dispatches
 * `CompactConversationUseCase` (reuses the P2 `context_compacted` block). The fork/
 * rewind affordances on user messages are gated through the active runtime's
 * capabilities (REQ-TS-016/019) and routed to the store's fork/rewind actions.
 * `onBeforeUnmount` → `tabsStore.$reset()` (cancels every tab, EC-15). The root keeps
 * `data-provider="claude"`. On mount it binds the store with one runtime PER TAB
 * (the injected `CHAT_RUNTIME_FACTORY` seam) — never imports `obsidian`.
 */
const { t } = useI18n();
const tabs = useTabsStore();
const { isEmpty, isStreaming } = storeToRefs(tabs);

const notify = useNotificationPort();
const logger = useLoggerPort();
const history = useProviderHistoryPort();
// P9 (SPEC-PV-005/031): the runtime factory widened to `(providerId) => Result`.
// The store's per-tab binding stays `() => ChatRuntimePort` (the UNCHANGED P3
// contract); this adapter passes the RESOLVED active provider (default `'claude'`)
// and unwraps the `Result`. A Claude-only configuration resolves `'claude'` and the
// runtime is byte-identical to P8 (NFR-PV-001). The construct-fail path is the
// `Result.err` the `SelectProviderUseCase` surfaces as an honest notice (REQ-PV-011);
// a per-tab construct-fail at bind time degrades to the P8 Claude runtime so the
// surface always mounts (the honest notice rides the explicit select path).
const runtimeFactory = useChatRuntimeFactory();
// SPEC-PV-020/031: the resolved active provider drives the per-tab factory + the
// chooser + the toolbar catalog. A mutable holder (read by the synchronous
// `createRuntime` the store calls per tab) loaded from the registry + settings on
// mount; default `'claude'` (byte-identical P8) when no registry is provided.
const activeProviderId = ref<ProviderId>(DEFAULT_CHAT_PROVIDER_ID);
const createRuntime = (): ChatRuntimePort => {
	const result = runtimeFactory(activeProviderId.value);
	if (result.ok) return result.value;
	// A construct-fail at bind time (e.g. the active provider lost its key) must not
	// crash the surface mount; fall back to the byte-identical P8 Claude runtime so
	// the chat still renders. The honest construct-fail notice rides the explicit
	// `SelectProviderUseCase.select` path (REQ-PV-011, SPEC-PV-013).
	const claude = runtimeFactory(DEFAULT_CHAT_PROVIDER_ID);
	if (!claude.ok) throw claude.error;
	return claude.value;
};
const chooseForkTarget = useChooseForkTarget();
// SettingsPort is OPTIONAL here (the maxTabs preference): the surface degrades to
// the default ceiling when the host does not provide it (parity with the demo).
const settingsPort = inject(SETTINGS_PORT, undefined);
// AuxModelPort is OPTIONAL here (SPEC-CA-018, ADR-CA-002 §3): the unified one-shot
// cold-start aux seam driving title-gen (always) + instruction-refine (gated). The
// production `provide(AUX_MODEL_PORT, …)` lands in the wire-in batch (T-CA-033); a
// transient unwired window in the real plugin is expected — title-gen degrades to a
// best-effort err so the tab still streams (REQ-TS-025 keeps the caller's fallback).
const aux = inject(AUX_MODEL_PORT, undefined);

// ── P9 providers registry (SPEC-PV-020/031) ──────────────────────────────────────
// `PROVIDER_REGISTRY_PORT` is OPTIONAL here (parity with the P6 toolbar): when present
// (the wire-in batch) the surface resolves the active provider + the enabled list from
// the registry + settings, mounts the `ProviderChooser` (hidden at ≤ 1 enabled →
// byte-identical P8), and routes a selection through `SelectProviderUseCase`. When
// absent the surface stays pure P8 (the active provider is the default `'claude'`, no
// chooser). NEVER a `providerId` branch (NFR-PV-014, SPEC-PV-029) — the routing reads
// the registry + the widened factory, the widgets gate on the capability bag.
const providerRegistry: ProviderRegistryPort | undefined = inject(PROVIDER_REGISTRY_PORT, undefined);
const openProviderConsent = useOpenProviderConsent();
// The reactive chooser + widget view-model the surface renders. `undefined` until the
// registry + settings resolve on mount (or always, with no registry → byte-identical P8).
const providerVm = ref<ProviderViewModel | undefined>(undefined);

const selectProviderUseCase: SelectProviderUseCase | null =
	providerRegistry !== undefined && settingsPort !== undefined
		? new SelectProviderUseCase(
				providerRegistry,
				settingsPort,
				runtimeFactory,
				new FeedbackService(logger, notify),
		  )
		: null;

// The one-time beyond-vault consent gate (SPEC-PV-014/024). Built only when the
// settings port is present; consulted before activating a `readsHomeDir` provider so a
// Claude-only user (`readsHomeDir:false`) never reaches it (REQ-PV-114).
const consentGate: ProviderConsentGate | null =
	settingsPort !== undefined ? new ProviderConsentGate(settingsPort, openProviderConsent) : null;

/** Resolve the active provider + rebuild the chooser VM from the registry + settings. */
async function refreshProviderVm(): Promise<void> {
	if (providerRegistry === undefined || settingsPort === undefined) return;
	const settings = await settingsPort.getSettings();
	const active = providerRegistry.resolveActiveProvider(settings);
	activeProviderId.value = active;
	providerVm.value = buildProviderViewModel(
		providerRegistry.listEnabledProviders(settings),
		active,
		providerRegistry.getCapabilities(active),
	);
}

/**
 * On mount, resolve the active provider + build the chooser VM, then rebind the first
 * (synchronously-seeded Claude) tab's runtime to the recorded active provider when it
 * differs (SPEC-PV-020/031). A Claude-only configuration resolves `'claude'` → no
 * rebind, byte-identical P8 (NFR-PV-001).
 */
async function refreshActiveProviderRuntime(): Promise<void> {
	if (providerRegistry === undefined || settingsPort === undefined) return;
	await refreshProviderVm();
	if (activeProviderId.value === DEFAULT_CHAT_PROVIDER_ID) return;
	const constructed = runtimeFactory(activeProviderId.value);
	if (constructed.ok) tabs.rebindActiveRuntime(constructed.value);
}

/**
 * Route a chooser selection through `SelectProviderUseCase` (SPEC-PV-013/023): a
 * `readsHomeDir` provider first clears the one-time beyond-vault consent gate (a
 * decline still switches but the provider's history stays disabled honestly,
 * SPEC-PV-024); the use case tears down the prior runtime, persists the selection
 * device-local, and constructs the active one via the widened factory; the surface
 * rebinds the active tab's runtime + re-derives the chooser/toolbar VM. NEVER a
 * `providerId` branch (NFR-PV-014).
 */
async function onSelectProvider(id: string): Promise<void> {
	if (selectProviderUseCase === null || providerRegistry === undefined) return;
	const providerId = id as ProviderId;
	if (consentGate !== null && providerRegistry.getCapabilities(providerId).readsHomeDir) {
		await consentGate.ensureConsent(providerId);
	}
	const constructed = await selectProviderUseCase.select(providerId, tabs.activeRuntime() ?? null);
	if (constructed.ok) {
		tabs.rebindActiveRuntime(constructed.value);
	}
	await refreshProviderVm();
}

let maxTabs = 3;

// Bind the per-tab deps synchronously in setup so the first empty tab + its runtime
// exist on the initial render (TabBar shows one badge immediately). One runtime is
// built PER TAB (REQ-TS-006). The maxTabs preference loads async (optional port).
tabs.bindTabDeps({
	createRuntime,
	createRunner: (runtime: ChatRuntimePort) => new RunChatTurnUseCase(runtime, logger),
	notifyStartFailure: (message) => {
		notify.showError(message);
	},
	notifyInfo: (message) => {
		notify.showInfo(message);
	},
	history,
	generateTitle: (firstUserMessage) =>
		aux !== undefined
			? new GenerateTitleUseCase(aux).execute(firstUserMessage)
			: Promise.resolve(err(new Error('aux model unavailable'))),
	getMaxTabs: () => maxTabs,
	logger,
	// R-CP-001: read the persisted instruction `customSystemPrompt` from the
	// already-injected SettingsPort so each sent turn carries it to the runtime
	// (CLI `--append-system-prompt`). The SettingsPort read stays in this surface
	// layer; the store only threads the resolved string into the query options.
	getAppendSystemPrompt: async () => (await settingsPort?.getSettings())?.customSystemPrompt,
	// P8 (SPEC-MC-020, REQ-MC-052/082): the guarded enabled-MCP-servers fold. The
	// store threads the manager's `getEnabledMcpServers(∅)` into the turn's
	// `enabledMcpServers` ONLY when defined (the active set is non-empty), so a
	// no-server turn omits the field (byte-identical to P7). Absent when the MCP
	// store port is not provided. The empty mention-set is the P8 default (open item #1).
	getEnabledMcpServers: () => mcpManager?.getEnabledMcpServers(new Set()),
});

onMounted(() => {
	void settingsPort?.getSettings().then((settings: PluginSettings) => {
		maxTabs = clampMaxTabs(settings.maxTabs);
	});
	// P7 (SPEC-AS-016, REQ-AS-040/043): seed the live approvals view-model from the store.
	void refreshApprovalRules();
	// P8 (SPEC-MC-020, REQ-MC-001/002): load the managed MCP server list (the manager
	// degrades to an empty list + a non-blocking notice on a store `err`).
	void loadMcpServers();
	// P9 (SPEC-PV-020): resolve the active provider + build the chooser VM. Also
	// re-resolves the active provider into `activeProviderId` so the per-tab factory
	// builds on the recorded provider (the first tab was seeded synchronously with the
	// default `'claude'`; a recorded non-Claude active provider rebinds below).
	void refreshActiveProviderRuntime();
});

onBeforeUnmount(() => {
	tabs.$reset();
});

// ── P4 composer power (SPEC-CP-018/028/038) ─────────────────────────────────────
// The three composer ports are OPTIONAL here (parity with the P1 demo): when all
// three are provided (the wire-in batch, T-CP-049) the surface builds the live
// `useComposerMode` arbiter + the inline-block bridge and hands them to
// `ChatComposer`; when any is absent the composer stays pure P1 (no arbiter prop).
const mentions: MentionDataProviderPort | undefined = inject(MENTION_DATA_PROVIDER_PORT);
const catalog: ProviderCommandCatalogPort | undefined = inject(PROVIDER_COMMAND_CATALOG_PORT);
const shell: ShellExecPort | undefined = inject(SHELL_EXEC_PORT);
const confirmInstruction = useInstructionConfirm();

const composerRef = ref<{
	getValue: () => string;
	getCaret: () => number;
	applyInsert: (value: string, caret: number) => void;
} | null>(null);

// A completed bang-bash run is held here and rendered as the output block; the
// arbiter's `onBangBashOutput` sets it (SPEC-CP-025).
const bangBashOutput = shallowRef<BangBashOutput | null>(null);

const composerEnabled = mentions !== undefined && catalog !== undefined && shell !== undefined;

// R-CP-002: the composer binds its plan/inline capability gate + inline-block
// callback channel (SPEC-CP-002/017) to the ACTIVE TAB's runtime — the SAME per-tab
// instance the store streams `sendMessage`/`query` on (`tabs.activeRuntime()`). This
// is the streaming runtime whose reducer-emitted ask_user_question / exit_plan_mode /
// approval_request must reach the rendered queue, NOT a fresh orphan. The first tab +
// its runtime are seeded synchronously by `bindTabDeps` above, so it exists here.
const composerRuntime: ChatRuntimePort | null = composerEnabled
	? tabs.activeRuntime() ?? null
	: null;

const supportsInlineResponse = composerRuntime?.getCapabilities().supportsInlineResponse ?? false;

// ── P7 approvals & security (SPEC-AS-016/017/018) ────────────────────────────────
// `APPROVAL_RULE_STORE_PORT` is OPTIONAL here (parity with the P6 toolbar): when
// provided (the wire-in batch, T-AS-032) the surface constructs ONE per-surface
// `ApprovalManager` (per-surface session-rule scope, open item #1) and gates the active
// runtime's approval callback through it (mode-gate → match → auto OR the unchanged P4
// prompt). When absent the surface degrades to always-prompt — the byte-identical P4
// path (no rule store → `decide` is never consulted, the P4 block always renders). The
// store also backs the approvals view-model (the panel's rule list + remove). NEVER a
// `providerId` branch (SPEC-AS-023).
const approvalStore: ApprovalRuleStorePort | undefined = inject(APPROVAL_RULE_STORE_PORT, undefined);

/** The active tab's live permission mode (`controls.permissionMode ?? 'normal'`). */
const activePermissionMode = computed<PermissionMode>(
	() => tabs.activeTab?.controls.permissionMode ?? 'normal',
);

// One `ApprovalManager` per surface (resolved open item #1) — built only when the store
// is provided. It reads the active mode via the reactive getter so a per-tab mode change
// (the toggle) re-derives without re-construction.
const approvalManager: ApprovalManager | null =
	approvalStore !== undefined
		? new ApprovalManager(
				approvalStore,
				new FeedbackService(logger, notify),
				t('agent.chat.approvals.storeError'),
		  )
		: null;

/** True iff the approvals surface is wired (the store + the manager are present). */
const hasApprovals = approvalManager !== null;

// The reactive approvals view-model the panel reads (persisted ∪ session rules). It is
// refreshed on mount + after a persist/remove so the panel stays live (REQ-AS-043).
const approvalRules = ref<readonly ApprovalRule[]>([]);

async function refreshApprovalRules(): Promise<void> {
	if (approvalManager === null) return;
	const result = await approvalManager.listRules();
	if (result.ok) approvalRules.value = result.value;
}

// ── P8 MCP client (SPEC-MC-020) ──────────────────────────────────────────────────
// `MCP_CONFIG_STORE_PORT` is OPTIONAL here (parity with the P6 toolbar + P7 approvals):
// when provided (the wire-in batch) the surface constructs ONE per-surface
// `McpServerManager` (parity the per-surface `ApprovalManager`), loads it on mount, and
// drives the settings + the selector from a reactive `McpViewModel` (SPEC-MC-014). On
// turn submit it folds `getEnabledMcpServers(∅)` into `queryOptions.enabledMcpServers`
// ONLY when defined (REQ-MC-052/082) — additive alongside the P4/P6/P7 folds; a no-MCP
// turn stays byte-identical to P7. An MCP tool call (`mcp__<server>__<tool>`) routes
// through the UNCHANGED P7 `ApprovalManager` via the existing `ApprovalGateRuntime` (no
// MCP special-case, no `providerId` branch). When absent the settings/selector keep the
// P6 empty seam and the turn omits the field. A store/manager `err` degrades gracefully
// (the manager surfaces a non-blocking notice + keeps an empty list — never crashes).
const mcpStore: McpConfigStorePort | undefined = inject(MCP_CONFIG_STORE_PORT, undefined);
const openMcpServerModal = useOpenMcpServerModal();
const openMcpTestModal = useOpenMcpTestModal();

const mcpManager: McpServerManager | null =
	mcpStore !== undefined
		? new McpServerManager(mcpStore, new FeedbackService(logger, notify))
		: null;

/** True iff the MCP surface is wired (the store + the manager are present). */
const hasMcp = mcpManager !== null;

// The reactive managed-server snapshot the view-model derives from. Refreshed on mount +
// after every manager mutation so the settings + selector stay live (REQ-MC-050/051).
const mcpServers = ref<readonly ManagedMcpServer[]>([]);

/** The active runtime's `supportsMcpTools` capability — the settings + selector gate (REQ-MC-041). */
const supportsMcpTools = computed<boolean>(
	() => tabs.activeRuntime()?.getToolbarCapabilities().supportsMcpTools ?? false,
);

/** The MCP view-model (the P6 empty seam at 0 servers, the live list at ≥ 1). */
const mcpVm = computed<McpViewModel | undefined>(() =>
	mcpManager === null ? undefined : buildMcpViewModel(mcpServers.value, supportsMcpTools.value),
);

function refreshMcpServers(): void {
	if (mcpManager === null) return;
	mcpServers.value = mcpManager.getServers();
}

async function loadMcpServers(): Promise<void> {
	if (mcpManager === null) return;
	await mcpManager.load();
	refreshMcpServers();
}

/** Toggle a server's `enabled` then re-derive the view-model (REQ-MC-014/050/051). */
async function onMcpSetEnabled(name: string, enabled: boolean): Promise<void> {
	if (mcpManager === null) return;
	await mcpManager.setEnabled(name, enabled);
	refreshMcpServers();
}

/** Open the add modal via the seam; on a draft, add + re-derive (REQ-MC-010/042). */
async function onMcpAdd(): Promise<void> {
	if (mcpManager === null) return;
	const draft = await openMcpServerModal();
	if (draft === null) return;
	await mcpManager.add(draft);
	refreshMcpServers();
}

/** Open the edit modal pre-bound to the server via the seam (REQ-MC-012/042). */
async function onMcpEdit(name: string): Promise<void> {
	if (mcpManager === null) return;
	const existing = mcpServers.value.find((server) => server.name === name);
	if (existing === undefined) return;
	const draft = await openMcpServerModal({
		name: existing.name,
		config: existing.config,
		description: existing.description,
		contextSaving: existing.contextSaving,
	} satisfies McpServerDraft);
	if (draft === null) return;
	await mcpManager.edit(name, draft);
	refreshMcpServers();
}

/** Remove a server then re-derive the view-model (REQ-MC-013). */
async function onMcpRemove(name: string): Promise<void> {
	if (mcpManager === null) return;
	await mcpManager.remove(name);
	refreshMcpServers();
}

/** Open the test modal via the seam (the host owns the probe + per-tool toggle, REQ-MC-044). */
async function onMcpTest(name: string): Promise<void> {
	const server = mcpServers.value.find((entry) => entry.name === name);
	if (server === undefined) return;
	await openMcpTestModal(server);
	// The test modal may have toggled a server's `disabledTools` through its own
	// lifecycle; re-load so the surface's snapshot reflects the saved truth.
	await loadMcpServers();
}

const { composer, respond } = buildComposer();

/**
 * Build the composer-mode arbiter + the inline-block response boundary when the
 * three composer ports are present (SPEC-CP-018/028). When any port is absent the
 * surface degrades to pure P1 (no arbiter, no respond) — the P1 demo + the P1/P2/P3
 * mount tests do not provide these ports. `getValue`/`getCaret`/`onInsert` bridge to
 * the mounted `ChatComposer` textarea (the single source of truth, NFR-CP-005).
 */
function buildComposer(): {
	composer: ReturnType<typeof useComposerMode> | undefined;
	respond: RespondToInlineBlockUseCase | undefined;
} {
	if (
		mentions === undefined ||
		catalog === undefined ||
		shell === undefined ||
		composerRuntime === null
	) {
		return { composer: undefined, respond: undefined };
	}
	const runtime = composerRuntime;
	const arbiter = useComposerMode({
		runCommand: new RunCommandUseCase(),
		resolveMention: new ResolveMentionUseCase(mentions),
		submitBangBash: new SubmitBangBashUseCase(shell, logger),
		catalog,
		runtime,
		onInsert: (next: string, caretPos: number): void => {
			composerRef.value?.applyInsert(next, caretPos);
		},
		onAction: (action: BuiltInAction): void => {
			dispatchBuiltIn(action);
		},
		onBangBashOutput: (output: BangBashOutput): void => {
			bangBashOutput.value = output;
		},
		getValue: (): string => composerRef.value?.getValue() ?? '',
		getCaret: (): number => composerRef.value?.getCaret() ?? 0,
		// Refine is gated behind the composer ports AND the optional AuxModelPort
		// (SPEC-CA-018): build it only when `aux` is provided; the arbiter treats an
		// absent `refineInstruction` as "no refine affordance" (it is `?` there).
		refineInstruction: aux !== undefined ? new RefineInstructionUseCase(aux) : undefined,
		settings: settingsPort,
		confirmInstruction,
		// P5 (SPEC-CA-022, REQ-CA-001): resolving a FILE mention ALSO adds a context
		// chip via the attached-file set (additive — the token is still inserted).
		onFileMention: attachFile,
	});
	// The inline-block response boundary (SPEC-CP-017). Built over an enqueue-decorator
	// runtime so a runtime-pulled inline request both (a) RENDERS via the arbiter's
	// depth-counted queue and (b) routes the user's answer back through
	// `RespondToInlineBlockUseCase` (it captures the runtime's awaiting resolve). One
	// registration per callback (no last-wins conflict): the decorator wraps the use
	// case's capture callback with an enqueue-first side effect.
	// P7 (SPEC-AS-016): when an `ApprovalManager` is present, gate the approval callback
	// through it FIRST — the gate is the inner-most decorator so an auto-decided approval
	// (`yolo`/a matching rule) never reaches the enqueue/render path. `EnqueueRuntime`
	// wraps the gate, so a `'prompt'` outcome still enqueues the unchanged P4 block and the
	// user's answer routes through `applyDecision` then resolves. With no manager the chain
	// is the byte-identical P4 path (no gate).
	const gated: ChatRuntimePort =
		approvalManager !== null
			? new ApprovalGateRuntime(
					runtime,
					approvalManager,
					() => activePermissionMode.value,
					() => {
						void refreshApprovalRules();
					},
			  )
			: runtime;
	const respondUseCase = new RespondToInlineBlockUseCase(
		new EnqueueRuntime(gated, (entry, hooks) => arbiter.enqueueInlineBlock(entry, hooks), logger),
	);
	return { composer: arbiter, respond: respondUseCase };
}

/** Map a built-in command action to the existing tab/session flow (SPEC-CP-013). */
function dispatchBuiltIn(action: BuiltInAction): void {
	if (action === 'new') {
		tabs.openTab();
		return;
	}
	if (action === 'compact') {
		void tabs.compactActive();
		return;
	}
	// `clear`/`add-dir`/`resume`/`fork` have no P4 surface action yet (catalog rows
	// only); record without a user-facing side effect.
	logger.debug('composer: built-in action not wired in P4', { action });
}

// ── P5 context & attachments (SPEC-CA-022/025/026) ──────────────────────────────
// The four P5 ports are OPTIONAL here (parity with the P1–P4 demos + mount tests):
// the surface owns the per-mount attached-file + image sets and, when the selection
// ports are provided (the wire-in batch, T-CA-044), the captured-selection composable
// — feeding `ChatComposer`'s context-bar slot. When any is absent the composer stays
// pure P1–P4 (the context bar is hidden when all three sets are empty). The Vue
// surface never imports `obsidian`; image preview launches through the injected seam.
const workspace: WorkspacePort | undefined = inject(WORKSPACE_PORT, undefined);
// VaultPort is OPTIONAL here (parity with the P1 demo): the image gate
// (`AddImageUseCase`) is built only when a vault is provided, so a mount without
// it degrades to "no path-based image attach" rather than throwing.
const vault: VaultPort | undefined = inject(VAULT_PORT, undefined);
const addImage = vault !== undefined ? new AddImageUseCase(vault) : undefined;
const selectionSource: SelectionSourcePort | undefined = inject(SELECTION_SOURCE_PORT, undefined);
const selectionHighlight: SelectionHighlightPort | undefined = inject(
	SELECTION_HIGHLIGHT_PORT,
	undefined,
);
const openImagePreview = useOpenImagePreview();
const pickAttachment = usePickAttachment();

const chatRoot = ref<HTMLElement | null>(null);
const attachedFiles = ref<readonly AttachedFileRef[]>([]);
const images = ref<readonly AttachedImage[]>([]);
const addFileContext = new AddFileContextUseCase();

// The captured selection is reactive only when BOTH selection ports are provided
// (the production sidebar + the standalone demo). The composable subscribes the
// source, computes focus-within-chat (the EC-CA-11 retain), and paints the highlight.
const selectionApi =
	selectionSource !== undefined && selectionHighlight !== undefined
		? useCapturedSelection(selectionSource, selectionHighlight, chatRoot)
		: undefined;
const capturedSelection = computed(() => selectionApi?.current.value ?? null);
const supportsBrowserSelection = selectionSource?.supportsBrowserSelection ?? false;

/**
 * Resolve a thumbnail `:src` for an attached image (SPEC-CA-020). The turn payload
 * is the bounded base64 (`dataBase64`); the thumb binds a `data:` URI derived from
 * the captured snapshot, so a moved/deleted source file keeps the thumb stable
 * (EC-CA-15). DECLARATIVE — `ImageThumb` binds `:src`, never `v-html`/`innerHTML`.
 */
function resolveThumbSrc(path: string): string {
	const image = images.value.find((img) => img.path === path);
	return image === undefined ? '' : `data:${image.mimeType};base64,${image.dataBase64}`;
}

/**
 * Attach a vault file to the context set as a removable chip (R-CA-002, REQ-CA-001).
 * Idempotent (the use case dedupes by path, REQ-CA-002). Drives the @-mention chip
 * (and the paperclip / non-image drop in the later legs). A malformed path is a
 * quiet no-op (the use case returns `err`).
 */
function attachFile(path: string): void {
	const next = addFileContext.add(attachedFiles.value, path);
	if (next.ok) attachedFiles.value = next.value;
}

/** Add an `AttachedImage` to the set, idempotent by path (REQ-CA-002 parity, EC-CA-15). */
function addAttachedImage(image: AttachedImage): void {
	if (images.value.some((img) => img.path === image.path)) return;
	images.value = [...images.value, image];
}

/**
 * Attach a vault image BY PATH through `AddImageUseCase.execute` — reads the vault
 * bytes through the 8 MiB/MIME gate (R-CA-002, REQ-CA-007/012). On reject a
 * non-blocking warning surfaces and the set is unchanged (REQ-CA-012, EC-CA-1/2).
 * Used by the paperclip image pick.
 */
async function attachImageByPath(path: string): Promise<void> {
	if (addImage === undefined) return;
	const result = await addImage.execute(path);
	if (result.ok) addAttachedImage(result.value);
	else notify.showWarning(t('agent.chat.context.images.rejected', { name: path }));
}

/**
 * Open the vault file/image picker via the modal seam (R-CA-002, REQ-CA-001/007).
 * The picker is obsidian-specific (it lives in `src/plugin/**`); the Vue layer only
 * routes the result — an image through the gate, a file as a chip. `null` = dismiss.
 */
async function onAttach(): Promise<void> {
	const picked = await pickAttachment();
	if (picked === null) return;
	if (picked.kind === 'image') await attachImageByPath(picked.path);
	else attachFile(picked.path);
}

/**
 * Gate + attach dropped/pasted files (R-CA-002, REQ-CA-007/012). Each image runs
 * the in-hand-bytes gate (`AddImageUseCase.executeBytes` — 8 MiB/MIME); a reject
 * surfaces a non-blocking warning and is skipped (REQ-CA-012, EC-CA-1/2). Non-image
 * files are ignored on drop/paste (parity with claudian's image-only drop handler).
 */
async function onAttachFiles(files: File[]): Promise<void> {
	if (addImage === undefined) return;
	for (const file of files) {
		if (resolveImageMime(file.name) === null) continue; // non-image → skip (parity).
		const bytes = new Uint8Array(await file.arrayBuffer());
		const result = addImage.executeBytes(file.name, bytes);
		if (result.ok) addAttachedImage(result.value);
		else notify.showWarning(t('agent.chat.context.images.rejected', { name: file.name }));
	}
}

function onRemoveFile(path: string): void {
	const next = addFileContext.remove(attachedFiles.value, path);
	if (next.ok) attachedFiles.value = next.value;
}

function onOpenFile(path: string): void {
	void workspace?.openFile(path);
}

function onRemoveImage(path: string): void {
	images.value = images.value.filter((img) => img.path !== path);
}

function onPreviewImage(image: AttachedImage): void {
	void openImagePreview(image);
}

function onClearSelection(): void {
	selectionApi?.clear();
}

// ── P6 toolbar controls (SPEC-TC-022) ───────────────────────────────────────────
// The toolbar catalog port is OPTIONAL here (parity with the P1–P5 demos + mount
// tests): when provided (the wire-in batch, T-TC-031) the surface builds the toolbar
// view-model from `getCatalog('claude')` + the active runtime's
// `getToolbarCapabilities()` + the active tab's `controls` + `usage`, and passes it to
// `ChatComposer`'s additive toolbar region. When absent the composer stays pure P5 (no
// `toolbar` prop). NEVER branches on a provider id (REQ-TC-003) — it reads the catalog
// + capabilities. The fold happens in the store on submit (SPEC-TC-023), not here.
const toolbarCatalog: ToolbarCatalogPort | undefined = inject(TOOLBAR_CATALOG_PORT, undefined);

const toolbarVm = computed<ToolbarViewModel | undefined>(() => {
	if (toolbarCatalog === undefined) return undefined;
	const caps = tabs.activeRuntime()?.getToolbarCapabilities();
	if (caps === undefined) return undefined;
	// P9 (SPEC-PV-020, REQ-PV-062): read the catalog for the RESOLVED active provider
	// (default `'claude'` → byte-identical P8). Un-hardcoded from the prior `'claude'`
	// literal; never a `providerId` branch (the catalog is the data, NFR-PV-014).
	return buildToolbarViewModel(
		toolbarCatalog.getCatalog(activeProviderId.value),
		caps,
		tabs.activeTab?.controls ?? {},
		tabs.activeTab?.usage ?? null,
	);
});

/** Route a backed toolbar change to the per-tab control bag (draft input, ADR-TC-001). */
function onSetControl<K extends keyof TabControls>(field: K, value: TabControls[K]): void {
	tabs.setControl(field, value);
}

function onPickModel(id: string): void {
	onSetControl('model', id);
}

function onSetMode(value: string): void {
	onSetControl('mode', value);
}

function onSetReasoning(choice: ReasoningChoice): void {
	onSetControl('reasoning', choice);
}

function onToggleServiceTier(active: boolean): void {
	// `active` reflects the desired state; the descriptor's active/inactive token is
	// resolved by the view-model's `active` flag. The toggle emits the boolean intent;
	// we store the descriptor's active value when on, clearing it when off.
	const descriptor = toolbarVm.value?.serviceTier.descriptor;
	if (descriptor === undefined) return;
	onSetControl('serviceTier', active ? descriptor.activeValue : descriptor.inactiveValue);
}

/** P7 (SPEC-AS-016/017): route the live permission-mode toggle to the per-tab draft. */
function onSetPermission(mode: PermissionMode): void {
	onSetControl('permissionMode', mode);
}

/** P7 (SPEC-AS-016): remove a persisted rule then refresh the live panel (REQ-AS-042). */
async function onRemoveApprovalRule(id: string): Promise<void> {
	if (approvalStore === undefined) return;
	await approvalStore.removeRule(id);
	await refreshApprovalRules();
}

const activeMessages = computed<ChatMessage[]>(() => tabs.activeTab?.messages ?? []);
const liveAssistantId = computed<string | null>(() => tabs.activeTab?.liveAssistantId ?? null);
const interruptedId = computed<string | null>(() => tabs.activeTab?.interruptedId ?? null);
const canFork = computed<boolean>(() => tabs.canForkActive());

function canRewind(message: ChatMessage): boolean {
	return tabs.canRewindMessage(message.id);
}

/**
 * Submit the turn, folding the present P5 context (attached files / images / the
 * captured selection) into the request (R-CA-001, REQ-CA-004/010/019). When no
 * context is present the request stays byte-identical to P1–P4 (G2). `onConsumed`
 * fires on a successful submit → clear the per-tab sets + the captured selection
 * for the next turn (SPEC-CA-022).
 */
function onSubmit(text: string): void {
	const hasContext =
		attachedFiles.value.length > 0 ||
		images.value.length > 0 ||
		capturedSelection.value !== null;
	if (!hasContext) {
		void tabs.sendMessage(text);
		return;
	}
	void tabs.sendMessage(text, undefined, {
		attachedFiles: attachedFiles.value,
		images: images.value,
		selection: capturedSelection.value,
		onConsumed: clearContextSets,
	});
}

/** Reset the per-tab context sets + the captured selection (R-CA-001/R-CA-003, REQ-CA-006). */
function clearContextSets(): void {
	attachedFiles.value = [];
	images.value = [];
	selectionApi?.clear();
}

/**
 * R-CA-003 (REQ-CA-006, EC-CA-6): reset the context sets on a NEW or LOADED
 * conversation. The active conversation identity changes when a new tab opens
 * (`/new` + the TabBar `+`, both `tabs.openTab` → a new `activeTabId`), when a fork
 * loads into a new tab (`loadIntoNewTab`), and when a conversation is resumed into
 * the current tab (`loadIntoTab` → a new `conversationId`). Watching both keys
 * covers all three; a plain re-render does not change either, so it never clears
 * mid-draft. The initial mount runs without `immediate`, so the first empty tab does
 * not trigger a (redundant) clear.
 */
watch(
	() => `${tabs.activeTabId ?? ''}::${tabs.activeTab?.conversationId ?? ''}`,
	() => {
		clearContextSets();
	},
);

function onCancel(): void {
	tabs.cancelTurn();
}

function onCompact(): void {
	void tabs.compactActive();
}

async function onFork(userMessageId: string): Promise<void> {
	const target = await chooseForkTarget();
	if (target === null) return;
	await tabs.forkActive(target, userMessageId);
}

function onRewindConversation(userMessageId: string): void {
	void tabs.rewindActive('conversation', userMessageId);
}

function onRewindCode(userMessageId: string): void {
	void tabs.rewindActive('code-and-conversation', userMessageId);
}
</script>

<template>
	<div ref="chatRoot" class="sp-chat-surface" data-testid="chat-surface" :data-provider="activeProviderId">
		<ProviderChooser
			v-if="providerVm !== undefined"
			:options="providerVm.options"
			:show-chooser="providerVm.showChooser"
			@select="onSelectProvider"
		/>
		<TabBar />
		<div class="sp-chat-surface__region">
			<WelcomeGreeting v-if="isEmpty" />
			<MessageList
				v-else
				:messages="activeMessages"
				:live-assistant-id="liveAssistantId"
				:interrupted-id="interruptedId"
				:can-fork="canFork"
				:can-rewind="canRewind"
				@fork="onFork"
				@rewind-conversation="onRewindConversation"
				@rewind-code="onRewindCode"
			/>
			<div
				v-if="isStreaming"
				class="sp-chat-surface__busy"
				data-testid="chat-busy"
				aria-live="polite"
				role="status"
			>
				{{ t('agent.chat.busy') }}
			</div>
		</div>
		<UsageInfo class="sp-chat-surface__usage" :usage="tabs.activeTab?.usage ?? null" />
		<div class="sp-chat-surface__actions">
			<button
				v-if="!isEmpty"
				type="button"
				class="sp-chat-surface__compact"
				data-testid="chat-compact"
				:aria-label="t('agent.chat.compact')"
				@click="onCompact"
			>
				{{ t('agent.chat.compact') }}
			</button>
			<ResumeSessionDropdown />
		</div>
		<ApprovalsPanel
			v-if="hasApprovals"
			:mode="activePermissionMode"
			:rules="approvalRules"
			@remove="onRemoveApprovalRule"
		/>
		<McpSettingsManager
			v-if="hasMcp && mcpVm !== undefined"
			:vm="mcpVm"
			@add="onMcpAdd"
			@paste="onMcpAdd"
			@edit="onMcpEdit"
			@remove="onMcpRemove"
			@test="onMcpTest"
			@set-enabled="onMcpSetEnabled"
		/>
		<ChatComposer
			ref="composerRef"
			:is-streaming="isStreaming"
			:composer="composer"
			:respond="respond"
			:supports-inline-response="supportsInlineResponse"
			:notify="notify"
			:bang-bash-output="bangBashOutput"
			:attached-files="attachedFiles"
			:images="images"
			:captured-selection="capturedSelection"
			:supports-browser-selection="supportsBrowserSelection"
			:resolve-thumb-src="resolveThumbSrc"
			:toolbar="toolbarVm"
			:permission-mode="activePermissionMode"
			:mcp-vm="mcpVm"
			@submit="onSubmit"
			@cancel="onCancel"
			@set-mcp-enabled="onMcpSetEnabled"
			@remove-file="onRemoveFile"
			@open-file="onOpenFile"
			@remove-image="onRemoveImage"
			@preview-image="onPreviewImage"
			@clear-selection="onClearSelection"
			@attach-files="onAttachFiles"
			@attach="onAttach"
			@pick-model="onPickModel"
			@set-mode="onSetMode"
			@set-reasoning="onSetReasoning"
			@toggle-service-tier="onToggleServiceTier"
			@set-permission="onSetPermission"
		/>
	</div>
</template>

<style scoped>
.sp-chat-surface {
	display: flex;
	flex-direction: column;
	block-size: 100%;
	gap: var(--sp-space-3);
	padding: var(--sp-space-5);
}

.sp-chat-surface__region {
	display: flex;
	flex-direction: column;
	flex: 1;
	min-block-size: 0;
}

.sp-chat-surface__busy {
	padding-block-start: var(--sp-space-3);
	color: var(--sp-accent);
	font-size: var(--sp-font-size-sm);
	font-style: italic;
}

.sp-chat-surface__actions {
	display: flex;
	align-items: center;
	gap: var(--sp-space-2);
}

.sp-chat-surface__compact {
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: transparent;
	color: var(--sp-text-muted);
	padding: var(--sp-space-1) var(--sp-space-3);
	font-size: var(--sp-font-size-sm);
	cursor: pointer;
}
</style>
