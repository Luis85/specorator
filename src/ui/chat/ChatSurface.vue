<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed, inject, ref, shallowRef } from 'vue';
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
	SELECTION_SOURCE_PORT,
	SELECTION_HIGHLIGHT_PORT,
} from '@/infrastructure/bridge/ports';
import { useOpenImagePreview } from '@/ui/chat/modalSeam';
import { useCapturedSelection } from '@/ui/composables/useCapturedSelection';
import { AddFileContextUseCase } from '@/application/chat/attachments/AddFileContextUseCase';
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
import WelcomeGreeting from './WelcomeGreeting.vue';
import MessageList from './MessageList.vue';
import UsageInfo from './UsageInfo.vue';
import ChatComposer from './ChatComposer.vue';
import TabBar from './TabBar.vue';
import ResumeSessionDropdown from './ResumeSessionDropdown.vue';

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
const createRuntime = useChatRuntimeFactory();
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
});

onMounted(() => {
	void settingsPort?.getSettings().then((settings: PluginSettings) => {
		maxTabs = clampMaxTabs(settings.maxTabs);
	});
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
	const respondUseCase = new RespondToInlineBlockUseCase(
		new EnqueueRuntime(runtime, (entry, hooks) => arbiter.enqueueInlineBlock(entry, hooks), logger),
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
const selectionSource: SelectionSourcePort | undefined = inject(SELECTION_SOURCE_PORT, undefined);
const selectionHighlight: SelectionHighlightPort | undefined = inject(
	SELECTION_HIGHLIGHT_PORT,
	undefined,
);
const openImagePreview = useOpenImagePreview();

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
	<div ref="chatRoot" class="sp-chat-surface" data-testid="chat-surface" data-provider="claude">
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
			@submit="onSubmit"
			@cancel="onCancel"
			@remove-file="onRemoveFile"
			@open-file="onOpenFile"
			@remove-image="onRemoveImage"
			@preview-image="onPreviewImage"
			@clear-selection="onClearSelection"
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
