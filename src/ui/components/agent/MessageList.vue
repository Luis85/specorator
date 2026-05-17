<script setup lang="ts">
/**
 * Renders the multi-turn message history for the active thread (IDEA-ASV-001,
 * agent-sidepanel-v2 Increment 2). Reads `messages.get(threadId) ?? []` from
 * the chat store.
 *
 * WP-8 changes:
 *   - UX #8 — scroll auto-pinning is now bottom-aware. We track whether the
 *     user is "at the bottom" of the scroll container (within a small
 *     tolerance). New deltas only auto-scroll when the user is already at
 *     the bottom; otherwise a floating "↓ New messages" pill appears so the
 *     reader can jump down on demand without being yanked mid-read. The
 *     scrollTop write is coalesced through `requestAnimationFrame` so
 *     bursts of streaming-text deltas (common during PR-ASV-2-ui) don't
 *     thrash the scroll position.
 *   - UX #11 — the empty state used to be a single italic line. It now
 *     renders four starter-tile affordances; clicking a tile pre-fills the
 *     chat textarea via the `tile-action` emit so the user can edit and
 *     send.
 *
 * Visual reference: Claudian's per-tab message list
 * (https://github.com/YishenTu/claudian) rendered with Vue 3 SFCs instead of
 * imperative DOM (ADR-003).
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMessagesStore, type CompactBoundaryNoticeDto } from '@/ui/stores/messagesStore';
import { useStreamingTurnStore } from '@/ui/stores/streamingTurnStore';
import { useInjectedA11yAnnouncer } from '@/ui/composables/useA11yAnnouncer';
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

type EmptyTileKey = 'slash' | 'mention' | 'send' | 'escape';

const props = defineProps<{
	/** Active thread id, or `null` when no thread is selected. */
	threadId: string | null;
}>();

const emit = defineEmits<{
	/**
	 * UX #11 (WP-8). Fired when the user clicks a starter tile in the
	 * empty state; the host (AgentSidepanelRoot) pre-fills the textarea
	 * with the corresponding prompt fragment.
	 */
	'tile-action': [key: EmptyTileKey];
}>();

const messagesStore = useMessagesStore();
const streamingStore = useStreamingTurnStore();
const { t } = useI18n();
const announcer = useInjectedA11yAnnouncer();

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

/**
 * UX #8 (WP-8). Bottom-aware auto-scroll.
 *
 * `isAtBottom` follows the user's scroll position; we read it via a
 * passive `scroll` listener and treat anything within `BOTTOM_TOLERANCE_PX`
 * of the maximum as "at the bottom". When new content arrives:
 *   - if `isAtBottom` → coalesce a scrollTop write into the next rAF.
 *   - otherwise → flip `showNewMessagesPill` so the user can jump down.
 *
 * The rAF coalescing also keeps WP-10 perf goals happy (one DOM write per
 * frame even under streaming bursts). WP-10 docs note: this rAF lives in
 * WP-8 by agreement, NOT in WP-10.
 */
const BOTTOM_TOLERANCE_PX = 32;
const isAtBottom = ref(true);
const showNewMessagesPill = ref(false);
let scrollRafHandle: number | null = null;
let pendingScrollToBottom = false;

function measureIsAtBottom(): boolean {
	const el = scrollContainer.value;
	if (el === null) return true;
	const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
	return distanceFromBottom <= BOTTOM_TOLERANCE_PX;
}

function handleScroll(): void {
	const atBottom = measureIsAtBottom();
	isAtBottom.value = atBottom;
	if (atBottom) showNewMessagesPill.value = false;
}

function scheduleScrollToBottom(): void {
	pendingScrollToBottom = true;
	if (scrollRafHandle !== null) return;
	const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
	const runner = (): void => {
		scrollRafHandle = null;
		if (!pendingScrollToBottom) return;
		pendingScrollToBottom = false;
		const el = scrollContainer.value;
		if (el === null) return;
		el.scrollTop = el.scrollHeight;
		// Manually reset; otherwise jsdom-style envs that don't dispatch
		// `scroll` events on programmatic writes leave the pill stuck.
		isAtBottom.value = true;
		showNewMessagesPill.value = false;
	};
	if (raf !== null) {
		scrollRafHandle = raf(runner);
	} else {
		// SSR / non-browser env fallback — flush synchronously.
		runner();
	}
}

function jumpToBottom(): void {
	const el = scrollContainer.value;
	if (el === null) return;
	el.scrollTop = el.scrollHeight;
	isAtBottom.value = true;
	showNewMessagesPill.value = false;
}

/**
 * Codex P2 on PR #403: `isAtBottom` is only updated by `@scroll`, so the
 * value from one thread leaks into the next when the user switches threads
 * (this component is not remounted on threadId change). Reset to the
 * "fresh thread" default whenever threadId changes: at-bottom + pill hidden.
 * The auto-scroll watcher below then picks the at-bottom branch for the
 * first content tick of the new thread.
 */
watch(
	() => props.threadId,
	() => {
		isAtBottom.value = true;
		showNewMessagesPill.value = false;
	},
);

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
		// Recompute distance because new content may have just landed; the
		// stored `isAtBottom` reflects the user's last observed position.
		if (isAtBottom.value) {
			scheduleScrollToBottom();
		} else {
			showNewMessagesPill.value = true;
		}
	},
);

onBeforeUnmount(() => {
	if (scrollRafHandle !== null) {
		const cancel =
			typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null;
		if (cancel !== null) cancel(scrollRafHandle);
		scrollRafHandle = null;
	}
	pendingScrollToBottom = false;
});

const emptyTiles: ReadonlyArray<{ key: EmptyTileKey; labelKey: string }> = [
	{ key: 'slash', labelKey: 'agent.emptyStateTiles.slash' },
	{ key: 'mention', labelKey: 'agent.emptyStateTiles.mention' },
	{ key: 'send', labelKey: 'agent.emptyStateTiles.send' },
	{ key: 'escape', labelKey: 'agent.emptyStateTiles.escape' },
];

function handleTileClick(key: EmptyTileKey): void {
	emit('tile-action', key);
}

/**
 * A11y #1 (WP-7): announce ONCE per completed assistant turn. Previously the
 * scroll container carried `aria-live="polite"`, which made every streamed
 * token (and every per-block re-render under it) re-announce the growing
 * transcript. We watch the count of assistant messages for the active
 * thread and fire a single polite announcement whenever it increments.
 *
 * The streaming bubble itself stays `aria-busy="true"` + `aria-live="off"`
 * (template below) so an SR knows the region is updating but does not voice
 * each delta.
 *
 * Codex P2 (PR #402): a naïve `next > prev` count comparison also fires when
 * the user switches to a thread that happens to have MORE assistant turns
 * than the previous one — producing a false "Assistant replied" while just
 * browsing. Guard by requiring the threadId to be UNCHANGED across the tick,
 * and by re-seeding `prev` whenever the active thread rotates.
 */
const assistantMessageCount = computed<number>(
	() => messages.value.filter((m) => m.role === 'assistant').length,
);

watch(
	[() => props.threadId, assistantMessageCount],
	([nextThreadId, nextCount], [prevThreadId, prevCount]) => {
		if (nextThreadId === prevThreadId && nextCount > prevCount) {
			announcer.announce(t('agent.assistantReplyAnnouncement'));
		}
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
		@scroll.passive="handleScroll"
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
			aria-busy="true"
			aria-live="off"
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
		<button
			v-if="showNewMessagesPill"
			type="button"
			class="sp-agent-messages__new-pill"
			data-testid="agent-message-new-pill"
			:aria-label="t('agent.newMessagesPillAriaLabel')"
			@click="jumpToBottom"
		>
			{{ t('agent.newMessagesPill') }}
		</button>
	</div>
	<div v-else class="sp-agent-messages--empty" data-testid="agent-message-list-empty">
		<p class="sp-agent-messages__empty-body">{{ t('agent.emptyHistory') }}</p>
		<p
			class="sp-agent-messages__empty-tiles-heading"
			data-testid="agent-message-list-empty-tiles-heading"
		>
			{{ t('agent.emptyStateTiles.heading') }}
		</p>
		<ul
			class="sp-agent-messages__empty-tiles"
			data-testid="agent-message-list-empty-tiles"
			role="list"
		>
			<li v-for="tile in emptyTiles" :key="tile.key" role="listitem">
				<button
					type="button"
					class="sp-agent-messages__empty-tile"
					:data-testid="`agent-message-list-empty-tile-${tile.key}`"
					@click="handleTileClick(tile.key)"
				>
					{{ t(tile.labelKey) }}
				</button>
			</li>
		</ul>
	</div>
</template>

<style scoped>
.sp-agent-messages {
	position: relative;
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
	flex-direction: column;
	gap: 0.625rem;
	align-items: stretch;
}

.sp-agent-messages__empty-body {
	margin: 0;
	font-size: 0.8125rem;
	color: var(--text-muted);
	text-align: center;
	font-style: italic;
}

.sp-agent-messages__empty-tiles-heading {
	margin: 0;
	font-size: 0.75rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--text-faint, var(--text-muted));
	text-align: center;
}

.sp-agent-messages__empty-tiles {
	margin: 0;
	padding: 0;
	list-style: none;
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 0.375rem;
}

.sp-agent-messages__empty-tile {
	width: 100%;
	min-height: 3rem;
	padding: 0.5rem 0.625rem;
	border: 1px dashed var(--background-modifier-border);
	border-radius: 6px;
	background: var(--background-secondary);
	color: var(--text-normal);
	font-size: 0.8125rem;
	font-family: var(--font-text);
	text-align: left;
	cursor: pointer;
	transition:
		background-color 0.15s,
		border-color 0.15s;
}

.sp-agent-messages__empty-tile:hover,
.sp-agent-messages__empty-tile:focus {
	background: var(--interactive-hover);
	border-color: var(--interactive-accent);
	outline: none;
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

/*
 * UX #8 (WP-8): floating "↓ New messages" pill anchored to the bottom-
 * centre of the scroll container. Visible only when new content arrived
 * while the user was scrolled away from the bottom.
 */
.sp-agent-messages__new-pill {
	position: sticky;
	bottom: 0.5rem;
	margin: 0 auto;
	align-self: center;
	padding: 0.25rem 0.75rem;
	border-radius: 9999px;
	border: 1px solid var(--background-modifier-border);
	background: var(--background-secondary);
	color: var(--text-normal);
	font-size: 0.75rem;
	font-weight: 500;
	cursor: pointer;
	box-shadow: var(--shadow-s, 0 2px 6px rgba(0, 0, 0, 0.15));
}

.sp-agent-messages__new-pill:hover,
.sp-agent-messages__new-pill:focus {
	background: var(--interactive-hover);
	outline: none;
}
</style>
