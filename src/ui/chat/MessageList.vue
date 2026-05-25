<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import { useChatStore } from '@/ui/stores/chatStore';
import type { ChatMessage } from '@/domain/ports';
import MessageTurn from './MessageTurn.vue';

/**
 * The scrollable message region (SPEC-CC-019, extended P3 — SPEC-TS-026). Renders
 * one `MessageTurn` per message, keyed by `message.id`, and auto-scrolls as the live
 * assistant message grows (streaming feel, NFR-CC-014).
 *
 * P1 path (preserved, no regression): with NO props it reads the single-thread
 * `chatStore` directly. P3 path: `ChatSurface` drives it from the active tab by
 * passing `messages`/`liveAssistantId`/`interruptedId` + the per-user-message
 * fork/rewind gates (`canFork`/`canRewind`), forwarding the affordance events up.
 */
const props = defineProps<{
	messages?: ChatMessage[];
	liveAssistantId?: string | null;
	interruptedId?: string | null;
	canFork?: boolean;
	canRewind?: (message: ChatMessage) => boolean;
}>();

const emit = defineEmits<{
	fork: [userMessageId: string];
	'rewind-conversation': [userMessageId: string];
	'rewind-code': [userMessageId: string];
}>();

const chat = useChatStore();

/** P3 props drive the view when present; else fall back to the P1 `chatStore`. */
const driven = computed(() => props.messages !== undefined);
const messages = computed<ChatMessage[]>(() => props.messages ?? chat.messages);
const liveId = computed<string | null>(() =>
	driven.value ? (props.liveAssistantId ?? null) : chat.liveAssistantId,
);
const interruptedId = computed<string | null>(() =>
	driven.value ? (props.interruptedId ?? null) : chat.interruptedId,
);

const region = ref<HTMLElement | null>(null);

function scrollToBottom(): void {
	const el = region.value;
	if (el !== null) el.scrollTop = el.scrollHeight;
}

watch(
	() => [messages.value.length, messages.value.map((m) => m.content).join('')],
	() => {
		void nextTick(scrollToBottom);
	},
);

function rewindEligible(message: ChatMessage): boolean {
	return props.canRewind?.(message) ?? false;
}
</script>

<template>
	<div ref="region" class="sp-message-list" data-testid="message-list">
		<MessageTurn
			v-for="message in messages"
			:key="message.id"
			:message="message"
			:streaming="message.id === liveId"
			:interrupted="message.id === interruptedId"
			:can-fork="canFork ?? false"
			:can-rewind="rewindEligible(message)"
			@fork="emit('fork', $event)"
			@rewind-conversation="emit('rewind-conversation', $event)"
			@rewind-code="emit('rewind-code', $event)"
		/>
	</div>
</template>

<style scoped>
.sp-message-list {
	display: flex;
	flex-direction: column;
	flex: 1;
	gap: var(--sp-msg-gap);
	overflow-y: auto;
	padding: var(--sp-space-5) 0;
	scrollbar-width: thin;
}

.sp-message-list::-webkit-scrollbar {
	inline-size: var(--sp-scrollbar-width);
}

.sp-message-list::-webkit-scrollbar-thumb {
	background: var(--sp-border);
	border-radius: var(--sp-radius-full);
}
</style>
