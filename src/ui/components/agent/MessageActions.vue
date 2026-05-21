<script setup lang="ts">
/**
 * Per-message action row (REQ-MPS-026 / REQ-MPS-027 / REQ-MPS-028 / REQ-MPS-029,
 * NFR-MPS-008). Rendered inline beneath each rendered `ChatMessage` in
 * `MessageList.vue`. Three controls:
 *
 *   - **Copy** — emits `copy` with the `messageId` so the host can read the
 *     message body and call `navigator.clipboard.writeText`. Always enabled,
 *     including mid-stream (REQ-MPS-029).
 *   - **Regenerate** — visible only when the message is the *latest* assistant
 *     turn (`role === 'assistant' && isLatest === true`). Disabled while
 *     `streamingTurnStore.isStreaming === true` (REQ-MPS-029).
 *   - **Edit** — visible only for user messages (`role === 'user'`). Disabled
 *     while streaming.
 *
 * The component emits intent-only — it does NOT call `navigator.clipboard` or
 * mutate stores. The host (`MessageList` → `ChatSidebar`) owns the side
 * effects so the action surface stays trivially testable.
 *
 * Spec contract: `specs/multi-provider-agent-sidepanel/spec.md` §8.3.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStreamingTurnStore } from '@/ui/stores/streamingTurnStore';

const props = defineProps<{
	messageId: string;
	role: 'user' | 'assistant';
	isLatest: boolean;
}>();

const emit = defineEmits<{
	copy: [payload: { messageId: string }];
	regenerate: [payload: { messageId: string }];
	edit: [payload: { messageId: string }];
}>();

const streaming = useStreamingTurnStore();
const { t } = useI18n();

const isStreaming = computed<boolean>(() => streaming.isStreaming);

const showRegenerate = computed<boolean>(
	() => props.role === 'assistant' && props.isLatest,
);
const showEdit = computed<boolean>(() => props.role === 'user');

function handleCopy(): void {
	emit('copy', { messageId: props.messageId });
}

function handleRegenerate(): void {
	if (isStreaming.value) return;
	emit('regenerate', { messageId: props.messageId });
}

function handleEdit(): void {
	if (isStreaming.value) return;
	emit('edit', { messageId: props.messageId });
}
</script>

<template>
	<div class="sp-message-actions" data-testid="message-actions">
		<button
			type="button"
			class="sp-message-actions__btn"
			data-testid="message-action-copy"
			:aria-label="t('agent.messageActions.copyAriaLabel')"
			@click="handleCopy"
		>
			{{ t('agent.messageActions.copy') }}
		</button>
		<button
			v-if="showRegenerate"
			type="button"
			class="sp-message-actions__btn"
			data-testid="message-action-regenerate"
			:aria-label="t('agent.messageActions.regenerateAriaLabel')"
			:aria-disabled="isStreaming ? 'true' : 'false'"
			:disabled="isStreaming"
			@click="handleRegenerate"
		>
			{{ t('agent.messageActions.regenerate') }}
		</button>
		<button
			v-if="showEdit"
			type="button"
			class="sp-message-actions__btn"
			data-testid="message-action-edit"
			:aria-label="t('agent.messageActions.editAriaLabel')"
			:aria-disabled="isStreaming ? 'true' : 'false'"
			:disabled="isStreaming"
			@click="handleEdit"
		>
			{{ t('agent.messageActions.edit') }}
		</button>
	</div>
</template>

<style scoped>
.sp-message-actions {
	display: flex;
	gap: 0.375rem;
	margin-top: 0.25rem;
}

.sp-message-actions__btn {
	font-size: 0.6875rem;
	font-weight: 500;
	padding: 0.125rem 0.5rem;
	border-radius: 4px;
	border: 1px solid var(--background-modifier-border);
	background: var(--background-secondary);
	color: var(--text-muted);
	cursor: pointer;
	transition:
		background-color 0.15s,
		border-color 0.15s,
		color 0.15s;
}

.sp-message-actions__btn:hover:not(:disabled) {
	background: var(--interactive-hover);
	color: var(--text-normal);
}

.sp-message-actions__btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}
</style>
