<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useChatStore } from '@/ui/stores/chatStore';
import MessageTurn from './MessageTurn.vue';

/**
 * The scrollable message region (SPEC-CC-019). Renders one `MessageTurn` per
 * `chatStore.messages` entry, keyed by `message.id` so Vue keys stay stable across
 * re-renders. Auto-scrolls to the bottom as the live assistant message grows
 * (streaming feel, NFR-CC-014). Reads the store directly (a UI component).
 */
const chat = useChatStore();

const region = ref<HTMLElement | null>(null);

function scrollToBottom(): void {
	const el = region.value;
	if (el !== null) el.scrollTop = el.scrollHeight;
}

// Re-pin to the bottom whenever the live message grows or a turn is added.
watch(
	() => [chat.messages.length, chat.messages.map((m) => m.content).join('')],
	() => {
		void nextTick(scrollToBottom);
	},
);
</script>

<template>
	<div ref="region" class="sp-message-list" data-testid="message-list">
		<MessageTurn
			v-for="message in chat.messages"
			:key="message.id"
			:message="message"
			:streaming="message.id === chat.liveAssistantId"
			:interrupted="message.id === chat.interruptedId"
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
