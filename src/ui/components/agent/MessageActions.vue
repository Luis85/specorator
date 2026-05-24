<script setup lang="ts">
/**
 * Per-message action row (REQ-MPS-026 / REQ-MPS-027 / REQ-MPS-028 / REQ-MPS-029,
 * NFR-MPS-008). Rendered inline beneath each rendered `ChatMessage` in
 * `MessageList.vue`.
 *
 * WS-AUX-5 refresh (REQ-AUX-001 / REQ-AUX-002 / REQ-AUX-016):
 *
 *   - Wrapped in `<HoverActions>` so the row is hidden until the parent
 *     `.sp-hover-host` is hovered or one of its descendants is focused.
 *   - Each action is an `<SpIconButton>` (icon-only) instead of a text
 *     button. Icons: copy / rotate-ccw / pencil / git-fork.
 *   - Copy success swaps the icon's aria-label to `copyConfirm` for 1.5 s.
 *
 * CQ-AUX-06 — the Fork action is gated behind a `showFork` prop defaulting
 * to false until PM + architect confirm it ships in this feature.
 *
 * Three controls:
 *   - **Copy** — emits `copy` with the `messageId`. Always enabled, including
 *     mid-stream (REQ-MPS-029).
 *   - **Regenerate** — visible only when the message is the *latest* assistant
 *     turn. Disabled while streaming.
 *   - **Edit** — visible only for user messages. Disabled while streaming.
 *   - **Fork** (CQ-AUX-06, opt-in) — escalation pending; stubbed icon-only.
 *
 * Spec contract: `specs/multi-provider-agent-sidepanel/spec.md` §8.3,
 * `specs/agent-ux-parity/spec.md` §1.4.
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStreamingTurnStore } from '@/ui/stores/streamingTurnStore';
import HoverActions from '@/ui/components/primitives/HoverActions.vue';
import SpIconButton from '@/ui/components/primitives/SpIconButton.vue';

const props = withDefaults(
	defineProps<{
		messageId: string;
		role: 'user' | 'assistant';
		isLatest: boolean;
		/**
		 * CQ-AUX-06 — Fork action is escalated. Default `false`; flip when PM
		 * confirms the Fork action ships in this feature.
		 */
		showFork?: boolean;
	}>(),
	{ showFork: false },
);

const emit = defineEmits<{
	copy: [payload: { messageId: string }];
	regenerate: [payload: { messageId: string }];
	edit: [payload: { messageId: string }];
	fork: [payload: { messageId: string }];
}>();

const streaming = useStreamingTurnStore();
const { t } = useI18n();

const isStreaming = computed<boolean>(() => streaming.isStreaming);

const showRegenerate = computed<boolean>(() => props.role === 'assistant' && props.isLatest);
const showEdit = computed<boolean>(() => props.role === 'user');

/**
 * REQ-AUX-016 — Copy confirmation. After a successful click, swap the
 * Copy icon's aria-label to `copyConfirm` for 1.5 s, then revert. The
 * timeout is cleared on unmount to avoid leaking handles when the host
 * unmounts mid-confirm.
 */
const copyConfirmActive = ref<boolean>(false);
let confirmHandle: number | null = null;

function clearConfirm(): void {
	if (confirmHandle !== null) {
		clearTimeout(confirmHandle);
		confirmHandle = null;
	}
}

onBeforeUnmount(() => {
	clearConfirm();
});

const copyAriaLabel = computed<string>(() =>
	copyConfirmActive.value
		? t('agent.messageActions.copyConfirm')
		: t('agent.messageActions.copyAriaLabel'),
);

function handleCopy(): void {
	emit('copy', { messageId: props.messageId });
	clearConfirm();
	copyConfirmActive.value = true;
	confirmHandle = window.setTimeout(() => {
		copyConfirmActive.value = false;
		confirmHandle = null;
	}, 1500);
}

function handleRegenerate(): void {
	if (isStreaming.value) return;
	emit('regenerate', { messageId: props.messageId });
}

function handleEdit(): void {
	if (isStreaming.value) return;
	emit('edit', { messageId: props.messageId });
}

// CQ-AUX-06 — pending PM/architect confirmation; only fires when showFork=true.
function handleFork(): void {
	if (isStreaming.value) return;
	emit('fork', { messageId: props.messageId });
}
</script>

<template>
	<HoverActions
		class="sp-message-actions"
		data-testid="message-actions"
		placement="block-end-inline-end"
	>
		<SpIconButton
			:icon="copyConfirmActive ? 'check' : 'copy'"
			:aria-label="copyAriaLabel"
			data-testid="message-action-copy"
			:size="14"
			@click="handleCopy"
		/>
		<SpIconButton
			v-if="showRegenerate"
			icon="rotate-ccw"
			:aria-label="t('agent.messageActions.regenerateAriaLabel')"
			data-testid="message-action-regenerate"
			:size="14"
			:disabled="isStreaming"
			:aria-disabled="isStreaming ? 'true' : 'false'"
			@click="handleRegenerate"
		/>
		<SpIconButton
			v-if="showEdit"
			icon="pencil"
			:aria-label="t('agent.messageActions.editAriaLabel')"
			data-testid="message-action-edit"
			:size="14"
			:disabled="isStreaming"
			:aria-disabled="isStreaming ? 'true' : 'false'"
			@click="handleEdit"
		/>
		<SpIconButton
			v-if="showFork"
			icon="git-fork"
			:aria-label="t('agent.messageActions.forkAriaLabel')"
			data-testid="message-action-fork"
			:size="14"
			:disabled="isStreaming"
			:aria-disabled="isStreaming ? 'true' : 'false'"
			@click="handleFork"
		/>
	</HoverActions>
</template>

<style scoped>
.sp-message-actions {
	gap: var(--sp-space-2);
}
</style>
