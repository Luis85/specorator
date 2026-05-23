<script setup lang="ts">
/**
 * MessageBubble — role-aware bubble shell for chat transcript turns
 * (REQ-AUX-005, REQ-AUX-010, spec §1.4).
 *
 * Role semantics:
 *   - 'user'      Right-aligned chip; asymmetric `border-end-end-radius`
 *                 mirrors the tail toward the inline-end.
 *   - 'assistant' Transparent full-width region; no bubble chrome.
 *   - 'system'    Subtle outline, neutral background, full width.
 *
 * Content node sets `unicode-bidi: plaintext` + `dir="auto"` so mixed-script
 * markdown (RTL chunks embedded inside an LTR conversation) is laid out per
 * its own directional run instead of inheriting the page direction.
 *
 * Wraps the per-message rendering decision-tree (markdown + nested blocks
 * + streaming cursor) inside its default slot. MessageList owns mounting
 * MessageActions and StreamingCursor as siblings of the slotted content.
 */
type MessageRole = 'user' | 'assistant' | 'system';

interface MessageBubbleProps {
	role: MessageRole;
}

defineProps<MessageBubbleProps>();
defineOptions({ name: 'MessageBubble' });
</script>

<template>
	<div
		class="sp-message-bubble sp-hover-host"
		:class="`sp-message-bubble--${role}`"
		:data-role="role"
		:data-testid="'message-bubble'"
	>
		<div class="sp-message-bubble__body" data-testid="message-bubble-body" dir="auto">
			<slot />
		</div>
		<slot name="actions" />
	</div>
</template>

<style scoped>
.sp-message-bubble {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-2);
}

.sp-message-bubble[data-role='user'] {
	align-self: flex-end;
	max-inline-size: 80%;
	padding-block: var(--sp-space-3);
	padding-inline: var(--sp-space-5);
	background-color: var(--sp-bg-secondary-alt);
	color: var(--sp-text-normal);
	border-radius: var(--sp-radius-md);
	/* Asymmetric mirror corner toward the inline-end tail (REQ-AUX-005). */
	border-end-end-radius: var(--sp-radius-bubble-tail-user);
}

.sp-message-bubble[data-role='assistant'] {
	align-self: stretch;
	background-color: transparent;
	color: var(--sp-text-normal);
	padding: 0;
}

.sp-message-bubble[data-role='system'] {
	align-self: stretch;
	background-color: transparent;
	color: var(--sp-text-muted);
	border-inline-start: 2px solid var(--sp-border);
	padding-inline-start: var(--sp-space-5);
}

.sp-message-bubble__body {
	unicode-bidi: plaintext;
	word-break: break-word;
}
</style>
