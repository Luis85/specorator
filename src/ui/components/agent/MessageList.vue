<script setup lang="ts">
/**
 * Renders the multi-turn message history for the active thread (IDEA-ASV-001,
 * agent-sidepanel-v2 Increment 2). Reads `messages.get(threadId) ?? []` from
 * the chat store. Scrolls to the bottom on every new message so the most
 * recent turn is always in view.
 *
 * Visual reference: Claudian's per-tab message list
 * (https://github.com/YishenTu/claudian) rendered with Vue 3 SFCs instead of
 * imperative DOM (ADR-003).
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useChatStore } from '@/ui/stores/chatStore';
import MarkdownBlock from '@/ui/components/agent/MarkdownBlock.vue';
import ThinkingBlock from './ThinkingBlock.vue';
import ToolCallBlock from './ToolCallBlock.vue';

const props = defineProps<{
	/** Active thread id, or `null` when no thread is selected. */
	threadId: string | null;
}>();

const store = useChatStore();
const { t } = useI18n();

const messages = computed(() => {
	if (props.threadId === null) return [];
	return store.messages.get(props.threadId) ?? [];
});

/**
 * Streaming in-flight indicator. While `chatStore.status === 'loading'` and
 * `chatStore.streamingText` is non-empty, the message list appends a
 * synthetic streaming-assistant bubble to render text deltas as they arrive
 * (PR-ASV-2-ui). The bubble does not have a stable `ChatMessage.id` because
 * it is replaced by the real `appendMessage` once the stream resolves.
 */
const streamingText = computed<string>(() => store.streamingText);
const streamingThinking = computed<string>(() => store.streamingThinking);
const streamingToolCalls = computed(() => Array.from(store.streamingToolCalls.entries()));
const isStreaming = computed<boolean>(
	() =>
		store.status === 'loading' &&
		(streamingText.value.length > 0 ||
			streamingThinking.value.length > 0 ||
			streamingToolCalls.value.length > 0),
);

const scrollContainer = ref<HTMLElement | null>(null);

// Track message-array length and streaming text/thinking/tool-call lengths.
watch(
	[
		() => messages.value.length,
		() => streamingText.value.length,
		() => streamingThinking.value.length,
		() => streamingToolCalls.value.length,
	],
	async () => {
		await nextTick();
		const el = scrollContainer.value;
		if (el === null) return;
		el.scrollTop = el.scrollHeight;
	},
);
</script>

<template>
	<div
		v-if="messages.length > 0 || isStreaming"
		ref="scrollContainer"
		class="sp-agent-messages"
		data-testid="agent-message-list"
		role="log"
		:aria-label="t('agent.messageListAriaLabel')"
		aria-live="polite"
	>
		<article
			v-for="message in messages"
			:key="message.id"
			class="sp-agent-message"
			:class="`sp-agent-message--${message.role}`"
			:data-testid="`agent-message-${message.role}`"
		>
			<header class="sp-agent-message__role" data-testid="agent-message-role">
				{{ message.role === 'user' ? t('agent.roleUser') : t('agent.roleAssistant') }}
			</header>
			<div class="sp-agent-message__body" data-testid="agent-message-body">
				<MarkdownBlock
					v-if="message.text.length > 0"
					class="sp-agent-message__text"
					:text="message.text"
				/>
				<p v-else class="sp-agent-message__empty" data-testid="agent-message-empty">
					{{ t('agent.assistantEmpty') }}
				</p>
				<p
					v-if="message.truncated === true"
					class="sp-agent-message__trim-note"
					data-testid="agent-message-trim-note"
				>
					{{ t('agent.contextTrimmed') }}
				</p>
			</div>
		</article>
		<article
			v-if="isStreaming"
			class="sp-agent-message sp-agent-message--assistant sp-agent-message--streaming"
			data-testid="agent-message-streaming"
		>
			<header class="sp-agent-message__role">
				{{ t('agent.roleAssistant') }}
			</header>
			<div class="sp-agent-message__body">
				<ThinkingBlock :text="streamingThinking" />
				<ToolCallBlock
					v-for="[blockId, call] in streamingToolCalls"
					:key="blockId"
					:tool-name="call.toolName"
					:input-json="call.inputJson"
					:done="call.done"
				/>
				<MarkdownBlock
					v-if="streamingText.length > 0"
					class="sp-agent-message__text"
					:text="streamingText"
				/>
				<span
					class="sp-agent-message__cursor"
					aria-hidden="true"
					data-testid="agent-message-streaming-cursor"
					>▍</span
				>
			</div>
		</article>
	</div>
	<div v-else class="sp-agent-messages--empty" data-testid="agent-message-list-empty">
		<p class="sp-agent-messages__empty-body">{{ t('agent.emptyHistory') }}</p>
	</div>
</template>

<style scoped>
.sp-agent-messages {
	flex: 1 1 auto;
	min-height: 0;
	overflow-y: auto;
	padding: 0.75rem 1rem;
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.sp-agent-messages--empty {
	flex: 0 0 auto;
	padding: 1.25rem 1rem 0;
	display: flex;
	align-items: center;
	justify-content: center;
}

.sp-agent-messages__empty-body {
	margin: 0;
	font-size: 0.8125rem;
	color: var(--text-muted);
	text-align: center;
	font-style: italic;
}

.sp-agent-message {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	padding: 0.625rem 0.75rem;
	border-radius: 6px;
	background: var(--background-secondary);
	border: 1px solid var(--background-modifier-border);
}

.sp-agent-message--user {
	background: var(--background-secondary-alt, var(--background-secondary));
}

.sp-agent-message__role {
	font-size: 0.6875rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--text-muted);
}

.sp-agent-message__body {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.sp-agent-message__text {
	margin: 0;
	font-family: inherit;
	font-size: 0.875rem;
	color: var(--text-normal);
	word-break: break-word;
}

.sp-agent-message__empty {
	margin: 0;
	font-size: 0.8125rem;
	color: var(--text-muted);
	font-style: italic;
}

.sp-agent-message__trim-note {
	margin: 0;
	font-size: 0.75rem;
	color: var(--text-faint);
}

.sp-agent-message--streaming {
	opacity: 0.95;
}

.sp-agent-message__cursor {
	display: inline-block;
	font-size: 0.875rem;
	color: var(--text-accent);
	animation: sp-agent-message__blink 1s steps(2, start) infinite;
}

@keyframes sp-agent-message__blink {
	to {
		visibility: hidden;
	}
}
</style>
