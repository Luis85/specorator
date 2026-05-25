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
} from '@/domain/ports';
import type { PluginSettings } from '@/domain/settings/PluginSettings';
import {
	SETTINGS_PORT,
	MENTION_DATA_PROVIDER_PORT,
	PROVIDER_COMMAND_CATALOG_PORT,
	SHELL_EXEC_PORT,
} from '@/infrastructure/bridge/ports';
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
		new GenerateTitleUseCase(createRuntime()).execute(firstUserMessage),
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

// The composer binds to one runtime for the plan/inline capability gate + the
// inline-block callback channel (SPEC-CP-002/017). Built via the same per-tab
// factory the store uses, so under a single-runtime mock the composer's runtime IS
// the streaming runtime (the inline request the runtime pulls renders here).
const composerRuntime: ChatRuntimePort | null = composerEnabled ? createRuntime() : null;

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
		refineInstruction: new RefineInstructionUseCase(runtime),
		settings: settingsPort,
		confirmInstruction,
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

const activeMessages = computed<ChatMessage[]>(() => tabs.activeTab?.messages ?? []);
const liveAssistantId = computed<string | null>(() => tabs.activeTab?.liveAssistantId ?? null);
const interruptedId = computed<string | null>(() => tabs.activeTab?.interruptedId ?? null);
const canFork = computed<boolean>(() => tabs.canForkActive());

function canRewind(message: ChatMessage): boolean {
	return tabs.canRewindMessage(message.id);
}

function onSubmit(text: string): void {
	void tabs.sendMessage(text);
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
	<div class="sp-chat-surface" data-testid="chat-surface" data-provider="claude">
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
			@submit="onSubmit"
			@cancel="onCancel"
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
