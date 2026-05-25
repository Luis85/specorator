<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ChatMessage } from '@/domain/ports';
import MarkdownBlock from './MarkdownBlock.vue';
import MessageBlocks from './MessageBlocks.vue';
import SpIcon from './SpIcon.vue';

/**
 * A single role-distinct chat turn (SPEC-CC-019, forked for P2 — SPEC-RR-023). The
 * user turn is a right-aligned bubble (`message-user`); the assistant turn is
 * transparent, full-width, left-aligned (`message-assistant`) — the
 * parity-critical asymmetry. The live assistant message carries
 * `data-streaming="true"`; an interrupted one shows the Interrupted badge
 * (`--sp-interrupt`, REQ-CC-010). `dir="auto"` handles mixed RTL/LTR.
 *
 * P2 fork (SPEC-RR-023): when `message.contentBlocks` is present the turn renders
 * the ordered `MessageBlocks` dispatcher; otherwise it falls back to the P1
 * `MarkdownBlock` over `message.content` (stored-vs-live parity, collapsed by
 * default — EC-RR-13). All other P1 behaviour is unchanged. No `v-html`.
 *
 * P3 fork/rewind (SPEC-TS-024/025): a USER message's hover toolbar gains a fork
 * control (shown iff `canFork`) and a rewind control (shown iff `canRewind`). Both
 * gates are computed by the parent THROUGH the runtime port (capability +
 * eligibility), never a provider branch (REQ-TS-026). Fork emits `fork`; rewind
 * opens an in-surface two-mode menu (no `window.*`, no `obsidian`) → `rewind-
 * conversation` (REQ-TS-021) or `rewind-code` (REQ-TS-022, the caller gates fs).
 */
const props = withDefaults(
	defineProps<{
		message: ChatMessage;
		streaming: boolean;
		interrupted: boolean;
		canFork?: boolean;
		canRewind?: boolean;
	}>(),
	{ canFork: false, canRewind: false },
);

const emit = defineEmits<{
	fork: [userMessageId: string];
	'rewind-conversation': [userMessageId: string];
	'rewind-code': [userMessageId: string];
}>();

const { t } = useI18n();

const isUser = (): boolean => props.message.role === 'user';

/** Render via the block dispatcher when the message carries ordered content blocks. */
const hasBlocks = computed(
	() => props.message.contentBlocks !== undefined && props.message.contentBlocks.length > 0,
);

const showFork = computed(() => isUser() && props.canFork);
const showRewind = computed(() => isUser() && props.canRewind);
const rewindMenuOpen = ref(false);

function onFork(): void {
	emit('fork', props.message.id);
}

function onRewind(): void {
	rewindMenuOpen.value = !rewindMenuOpen.value;
}

function onRewindConversation(): void {
	rewindMenuOpen.value = false;
	emit('rewind-conversation', props.message.id);
}

function onRewindCode(): void {
	rewindMenuOpen.value = false;
	emit('rewind-code', props.message.id);
}
</script>

<template>
	<div v-if="isUser()" class="sp-message sp-message--user" data-testid="message-user" dir="auto">
		<MessageBlocks v-if="hasBlocks" :message="message" :streaming="streaming" />
		<MarkdownBlock v-else :content="message.content" />
		<div v-if="showFork || showRewind" class="sp-message__toolbar">
			<button
				v-if="showFork"
				type="button"
				class="sp-message__action"
				data-testid="msg-fork"
				:aria-label="t('agent.chat.fork')"
				@click="onFork"
			>
				<SpIcon name="git-fork" />
			</button>
			<button
				v-if="showRewind"
				type="button"
				class="sp-message__action"
				data-testid="msg-rewind"
				:aria-label="t('agent.chat.rewind')"
				:aria-expanded="rewindMenuOpen ? 'true' : 'false'"
				@click="onRewind"
			>
				<SpIcon name="rotate-ccw" />
			</button>
			<div v-if="rewindMenuOpen" class="sp-message__rewind-menu" data-testid="rewind-menu" role="menu">
				<button
					type="button"
					class="sp-message__rewind-option"
					data-testid="rewind-conversation"
					role="menuitem"
					@click="onRewindConversation"
				>
					<SpIcon name="message-square" />
					<span>{{ t('agent.chat.rewindConversation') }}</span>
				</button>
				<button
					type="button"
					class="sp-message__rewind-option"
					data-testid="rewind-code"
					role="menuitem"
					@click="onRewindCode"
				>
					<SpIcon name="rotate-ccw" />
					<span>{{ t('agent.chat.rewindCode') }}</span>
				</button>
			</div>
		</div>
	</div>
	<div
		v-else
		class="sp-message sp-message--assistant"
		data-testid="message-assistant"
		:data-streaming="streaming ? 'true' : undefined"
		dir="auto"
	>
		<MessageBlocks v-if="hasBlocks" :message="message" :streaming="streaming" />
		<MarkdownBlock v-else :content="message.content" />
		<span v-if="interrupted" class="sp-message__interrupted" data-testid="message-interrupted">
			{{ t('agent.chat.interrupted') }}
		</span>
	</div>
</template>

<style scoped>
.sp-message {
	max-inline-size: var(--sp-msg-user-max-width);
}

.sp-message--user {
	align-self: flex-end;
	background: var(--sp-msg-user-bg);
	border-radius: var(--sp-radius-lg);
	border-end-end-radius: var(--sp-radius-bubble-tail-user);
	padding: var(--sp-space-4) var(--sp-space-5);
	unicode-bidi: plaintext;
}

.sp-message--assistant {
	align-self: flex-start;
	max-inline-size: 100%;
	inline-size: 100%;
	background: transparent;
	border-end-start-radius: var(--sp-radius-bubble-tail-assistant);
	unicode-bidi: plaintext;
}

.sp-message__interrupted {
	display: inline-block;
	margin-block-start: var(--sp-space-2);
	color: var(--sp-interrupt);
	font-size: var(--sp-font-size-sm);
	font-weight: var(--sp-font-weight-medium);
}

.sp-message__toolbar {
	position: relative;
	display: flex;
	justify-content: flex-end;
	gap: var(--sp-space-1);
	margin-block-start: var(--sp-space-2);
	opacity: 0;
	transition: opacity var(--sp-history-spin-duration, 0.15s) ease;
}

.sp-message--user:hover .sp-message__toolbar,
.sp-message--user:focus-within .sp-message__toolbar {
	opacity: 1;
}

.sp-message__action {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	inline-size: 22px;
	block-size: 22px;
	border: none;
	border-radius: var(--sp-radius-sm);
	background: transparent;
	color: var(--sp-text-muted);
	cursor: pointer;
}

.sp-message__action:hover {
	color: var(--sp-text-normal);
}

.sp-message__rewind-menu {
	position: absolute;
	inset-block-start: calc(100% + var(--sp-space-1));
	inset-inline-end: 0;
	z-index: 1;
	display: flex;
	flex-direction: column;
	min-inline-size: 180px;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-primary);
	padding: var(--sp-space-1);
}

.sp-message__rewind-option {
	display: flex;
	align-items: center;
	gap: var(--sp-space-2);
	padding: var(--sp-space-2) var(--sp-space-3);
	border: none;
	border-radius: var(--sp-radius-sm);
	background: transparent;
	color: var(--sp-text-normal);
	cursor: pointer;
	text-align: start;
}

.sp-message__rewind-option:hover {
	background: var(--sp-bg-secondary);
}

@media (prefers-reduced-motion: reduce) {
	.sp-message__toolbar {
		transition: none;
	}
}
</style>
