<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useTabsStore } from '@/ui/stores/tabsStore';
import { useNotificationPort } from '@/ui/composables/useNotificationPort';
import { useLoggerPort } from '@/ui/composables/useLoggerPort';
import { useProviderHistoryPort } from '@/ui/composables/useProviderHistoryPort';
import { useChatRuntimeFactory, useChooseForkTarget } from '@/ui/chat/modalSeam';
import { RunChatTurnUseCase } from '@/application/chat/RunChatTurnUseCase';
import { GenerateTitleUseCase } from '@/application/threads/GenerateTitleUseCase';
import type { ChatMessage, ChatRuntimePort } from '@/domain/ports';
import type { PluginSettings } from '@/domain/settings/PluginSettings';
import { SETTINGS_PORT } from '@/infrastructure/bridge/ports';
import { clampMaxTabs } from '@/domain/settings/PluginSettings';
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
});

onMounted(() => {
	void settingsPort?.getSettings().then((settings: PluginSettings) => {
		maxTabs = clampMaxTabs(settings.maxTabs);
	});
});

onBeforeUnmount(() => {
	tabs.$reset();
});

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
		<ChatComposer :is-streaming="isStreaming" @submit="onSubmit" @cancel="onCancel" />
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
