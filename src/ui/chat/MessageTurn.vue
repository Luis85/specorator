<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ChatMessage } from '@/domain/ports';
import MarkdownBlock from './MarkdownBlock.vue';

/**
 * A single role-distinct chat turn (SPEC-CC-019). The user turn is a right-aligned
 * bubble (`message-user`); the assistant turn is transparent, full-width,
 * left-aligned (`message-assistant`) — the parity-critical asymmetry. The live
 * assistant message carries `data-streaming="true"`; an interrupted one shows the
 * Interrupted badge (`--sp-interrupt`, REQ-CC-010). Content renders via
 * `MarkdownBlock` (no `v-html`). `dir="auto"` handles mixed RTL/LTR.
 */
const props = defineProps<{
	message: ChatMessage;
	streaming: boolean;
	interrupted: boolean;
}>();

const { t } = useI18n();

const isUser = (): boolean => props.message.role === 'user';
</script>

<template>
	<div v-if="isUser()" class="sp-message sp-message--user" data-testid="message-user" dir="auto">
		<MarkdownBlock :content="message.content" />
	</div>
	<div
		v-else
		class="sp-message sp-message--assistant"
		data-testid="message-assistant"
		:data-streaming="streaming ? 'true' : undefined"
		dir="auto"
	>
		<MarkdownBlock :content="message.content" />
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
</style>
