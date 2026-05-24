<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useChatStore } from '@/ui/stores/chatStore';
import { useChatRuntimePort } from '@/ui/composables/useChatRuntimePort';
import { useNotificationPort } from '@/ui/composables/useNotificationPort';
import { useLoggerPort } from '@/ui/composables/useLoggerPort';
import { RunChatTurnUseCase } from '@/application/chat/RunChatTurnUseCase';
import WelcomeGreeting from './WelcomeGreeting.vue';
import MessageList from './MessageList.vue';
import UsageInfo from './UsageInfo.vue';
import ChatComposer from './ChatComposer.vue';

/**
 * The chat container (SPEC-CC-018). Composes the message region over the bottom
 * composer; owns the state-machine wiring. On mount it instantiates a
 * `RunChatTurnUseCase` from the injected `ChatRuntimePort` and binds it to the
 * store (start failures surface a sticky `NotificationPort.showError` — EC-7).
 * Shows `WelcomeGreeting` when the thread is empty, else `MessageList`; a busy
 * indicator (`aria-live="polite"`) announces an in-flight turn (REQ-CC-009, a11y).
 * A turn-level `UsageInfo` footer (SPEC-RR-031, REQ-RR-024) sits below the message
 * region; it reads `chatStore.usage` itself and renders NOTHING until a `usage`
 * chunk sets it (REQ-RR-024a / EC-RR-12), so the surface stays clean when absent.
 * The root carries `data-provider="claude"` so the brand accent resolves.
 */
const { t } = useI18n();
const chat = useChatStore();
const { isEmpty, isStreaming } = storeToRefs(chat);

const runtime = useChatRuntimePort();
const notify = useNotificationPort();
const logger = useLoggerPort();

onMounted(() => {
	const useCase = new RunChatTurnUseCase(runtime);
	chat.bindTurnRunner(
		useCase,
		(message) => {
			notify.showError(message);
		},
		logger,
	);
});

// EC-15: abort any in-flight turn and clear state before the surface unmounts so
// no late chunk writes to a torn-down store.
onBeforeUnmount(() => {
	chat.$reset();
});

function onSubmit(text: string): void {
	void chat.sendMessage(text);
}

function onCancel(): void {
	chat.cancelTurn();
}
</script>

<template>
	<div class="sp-chat-surface" data-testid="chat-surface" data-provider="claude">
		<div class="sp-chat-surface__region">
			<WelcomeGreeting v-if="isEmpty" />
			<MessageList v-else />
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
		<UsageInfo class="sp-chat-surface__usage" />
		<ChatComposer :is-streaming="isStreaming" @submit="onSubmit" @cancel="onCancel" />
	</div>
</template>

<style scoped>
.sp-chat-surface {
	display: flex;
	flex-direction: column;
	block-size: 100%;
	gap: var(--sp-space-5);
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
</style>
