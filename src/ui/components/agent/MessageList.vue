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
import { useMessagesStore, type CompactBoundaryNoticeDto } from '@/ui/stores/messagesStore';
import { useStreamingTurnStore } from '@/ui/stores/streamingTurnStore';
import type { ChatMessage } from '@/domain/chat/ChatMessage';
import MarkdownBlock from '@/ui/components/agent/MarkdownBlock.vue';
import ThinkingBlock from './ThinkingBlock.vue';
import ToolCallBlock from './ToolCallBlock.vue';

/**
 * Discriminated union for the interleaved transcript: either a real
 * `ChatMessage` turn or a synthetic `compact-boundary` notice (Codex P2 on
 * PR #379). Ordered by `createdAt` so the divider appears at the point where
 * the SDK auto-compacted history.
 */
type TranscriptEntry =
	| { readonly kind: 'message'; readonly message: ChatMessage }
	| { readonly kind: 'compact-boundary'; readonly notice: CompactBoundaryNoticeDto };

const props = defineProps<{
	/** Active thread id, or `null` when no thread is selected. */
	threadId: string | null;
}>();

const messagesStore = useMessagesStore();
const streamingStore = useStreamingTurnStore();
const { t } = useI18n();

const messages = computed(() => {
	if (props.threadId === null) return [];
	return messagesStore.messages.get(props.threadId) ?? [];
});

/**
 * Per-thread `compact-boundary` notices for the active thread (Codex P2 on
 * PR #379). Empty when no compaction has occurred or no thread is selected.
 */
const compactBoundaries = computed<readonly CompactBoundaryNoticeDto[]>(() => {
	if (props.threadId === null) return [];
	return messagesStore.compactBoundaries.get(props.threadId) ?? [];
});

/**
 * Merged, time-ordered transcript of real messages and synthetic
 * compact-boundary notices. `createdAt` is the ordering key — notices fall
 * naturally between the turn that triggered them and the next turn.
 */
const transcript = computed<readonly TranscriptEntry[]>(() => {
	const entries: TranscriptEntry[] = [];
	for (const m of messages.value) entries.push({ kind: 'message', message: m });
	for (const n of compactBoundaries.value)
		entries.push({ kind: 'compact-boundary', notice: n });
	entries.sort((a, b) => {
		const aAt = a.kind === 'message' ? a.message.createdAt : a.notice.createdAt;
		const bAt = b.kind === 'message' ? b.message.createdAt : b.notice.createdAt;
		return aAt < bAt ? -1 : aAt > bAt ? 1 : 0;
	});
	return entries;
});

const hasContent = computed<boolean>(
	() => messages.value.length > 0 || compactBoundaries.value.length > 0,
);

/**
 * Streaming in-flight indicator. While `chatStore.status === 'loading'` and
 * `chatStore.streamingText` is non-empty, the message list appends a
 * synthetic streaming-assistant bubble to render text deltas as they arrive
 * (PR-ASV-2-ui). The bubble does not have a stable `ChatMessage.id` because
 * it is replaced by the real `appendMessage` once the stream resolves.
 */
const streamingText = computed<string>(() => streamingStore.streamingText);
const streamingThinking = computed<string>(() => streamingStore.streamingThinking);
const streamingToolCalls = computed(() => Array.from(streamingStore.streamingToolCalls.entries()));
const isStreaming = computed<boolean>(
	() =>
		messagesStore.status === 'loading' &&
		(streamingText.value.length > 0 ||
			streamingThinking.value.length > 0 ||
			streamingToolCalls.value.length > 0),
);

const scrollContainer = ref<HTMLElement | null>(null);

// Track message length, streaming text/thinking lengths, and tool-call inputJson byte-length
// (Codex P2 PR #379: observing only `streamingToolCalls.length` missed deltas to existing blocks).
const streamingToolCallsLength = computed(() => {
	let total = streamingToolCalls.value.length;
	for (const [, call] of streamingToolCalls.value) {
		total += call.inputJson.length;
	}
	return total;
});


watch(
	[
		() => messages.value.length,
		() => compactBoundaries.value.length,
		() => streamingText.value.length,
		() => streamingThinking.value.length,
		streamingToolCallsLength,
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
		v-if="hasContent || isStreaming"
		ref="scrollContainer"
		class="sp-agent-messages"
		data-testid="agent-message-list"
		role="log"
		:aria-label="t('agent.messageListAriaLabel')"
		aria-live="polite"
	>
		<template v-for="entry in transcript">
			<article
				v-if="entry.kind === 'message'"
				:key="entry.message.id"
				class="sp-agent-message"
				:class="`sp-agent-message--${entry.message.role}`"
				:data-testid="`agent-message-${entry.message.role}`"
			>
				<header class="sp-agent-message__role" data-testid="agent-message-role">
					{{ entry.message.role === 'user' ? t('agent.roleUser') : t('agent.roleAssistant') }}
				</header>
				<div class="sp-agent-message__body" data-testid="agent-message-body">
					<MarkdownBlock
						v-if="entry.message.text.length > 0"
						class="sp-agent-message__text"
						:text="entry.message.text"
					/>
					<p v-else class="sp-agent-message__empty" data-testid="agent-message-empty">
						{{ t('agent.assistantEmpty') }}
					</p>
					<p
						v-if="entry.message.truncated === true"
						class="sp-agent-message__trim-note"
						data-testid="agent-message-trim-note"
					>
						{{ t('agent.contextTrimmed') }}
					</p>
				</div>
			</article>
			<div
				v-else
				:key="entry.notice.id"
				class="sp-agent-compact-boundary"
				data-testid="compact-boundary-notice"
				role="status"
			>
				<span class="sp-agent-compact-boundary__line" aria-hidden="true"></span>
				<span class="sp-agent-compact-boundary__label">
					{{ t('chat.compactBoundary.notice') }}
				</span>
				<span class="sp-agent-compact-boundary__line" aria-hidden="true"></span>
			</div>
		</template>
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

.sp-agent-compact-boundary {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin: 0.25rem 0;
	color: var(--text-faint);
	font-size: 0.75rem;
	font-style: italic;
	text-align: center;
}

.sp-agent-compact-boundary__line {
	flex: 1 1 auto;
	height: 1px;
	background: var(--background-modifier-border);
}

.sp-agent-compact-boundary__label {
	flex: 0 0 auto;
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
