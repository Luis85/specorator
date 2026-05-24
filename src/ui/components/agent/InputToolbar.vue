<script setup lang="ts">
/**
 * `InputToolbar.vue` — composes the chat composer's secondary controls in the
 * REQ-AUX-004 normative source order:
 *
 *   model · mode · permission · thinking · context-meter · send
 *
 * The send button doubles as stop while `messagesStore.status === 'loading'`
 * (the streaming state) — clicks emit `stop` instead of `send`. The button
 * sits at `inset-inline-end` so logical-property RTL stays correct.
 *
 * `narrow` is set by the parent's `ResizeObserver` when the agent surface
 * drops below 360 px; CSS flips the toolbar to two rows.
 *
 * REQ-AUX-004, SPEC-AUX-001 §1.3.3.
 */
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';

import { useMessagesStore } from '@/ui/stores/messagesStore';
import { useChatInputModeStore } from '@/ui/stores/chatInputModeStore';
import SpIconButton from '@/ui/components/primitives/SpIconButton.vue';
import SpToggleSwitch from '@/ui/components/primitives/SpToggleSwitch.vue';
import ModelSelector from './ModelSelector.vue';
import ContextMeter from './ContextMeter.vue';

interface InputToolbarProps {
	/** True when the agent surface is narrower than 360px — wraps to two rows. */
	narrow?: boolean;
	/** Disable the send action (parent: empty draft / non-sendable state). */
	disabled?: boolean;
}

const props = withDefaults(defineProps<InputToolbarProps>(), {
	narrow: false,
	disabled: false,
});

const emit = defineEmits<{
	send: [];
	stop: [];
	attach: [];
}>();

const { t } = useI18n({ useScope: 'global' });
const messages = useMessagesStore();
const modeStore = useChatInputModeStore();
const { planMode } = storeToRefs(modeStore);

// Local toggle state for permission / thinking — backed by chatInputModeStore's
// planMode for `permission` (Plan label) and a local ref for thinking until a
// dedicated store lands.
const thinking = ref<boolean>(false);

const isStreaming = computed<boolean>(() => messages.status === 'loading');

const sendIcon = computed<string>(() => (isStreaming.value ? 'square' : 'send'));
const sendAriaLabel = computed<string>(() =>
	isStreaming.value
		? t('agent.composer.send.streamingTooltip')
		: t('agent.composer.send.tooltip'),
);

/**
 * G4.4 — Send button is "primed" (brand fill) only when there is something
 * to send: not streaming and not disabled. While streaming the stop icon
 * stays in a muted secondary variant; the disabled state falls back to
 * secondary so the brand splash does not lie about readiness.
 */
const sendVariant = computed<'primary' | 'secondary'>(() =>
	!isStreaming.value && !props.disabled ? 'primary' : 'secondary',
);

const sendButtonEl = ref<HTMLElement | null>(null);

function onTrailingClick(): void {
	if (isStreaming.value) {
		emit('stop');
		return;
	}
	if (!props.disabled) emit('send');
}

function toggleMode(value: boolean): void {
	// Plan/Normal binary toggle — mirrors chatInputModeStore.planMode.
	modeStore.planMode = value;
}

function togglePermission(value: boolean): void {
	// Permission toggle is wired to plan-mode for now (REQ-AUX-004 Plan label).
	modeStore.planMode = value;
}

defineExpose({ sendButtonEl });
</script>

<template>
	<div
		class="sp-input-toolbar"
		data-testid="input-toolbar"
		role="toolbar"
		:aria-label="t('agent.composer.send.tooltip')"
		:data-narrow="narrow ? 'true' : 'false'"
		:data-streaming="isStreaming ? 'true' : 'false'"
	>
		<span class="sp-input-toolbar__slot" data-testid="input-toolbar-model">
			<ModelSelector />
		</span>
		<span class="sp-input-toolbar__slot" data-testid="input-toolbar-mode">
			<SpToggleSwitch
				:model-value="planMode"
				:label="t('agent.composer.mode.plan')"
				@update:model-value="toggleMode"
			/>
		</span>
		<span class="sp-input-toolbar__slot" data-testid="input-toolbar-permission">
			<SpToggleSwitch
				:model-value="planMode"
				:label="t('agent.composer.permission.label')"
				@update:model-value="togglePermission"
			/>
		</span>
		<span class="sp-input-toolbar__slot" data-testid="input-toolbar-thinking">
			<SpToggleSwitch
				v-model="thinking"
				:label="t('agent.composer.thinking.label')"
			/>
		</span>
		<span class="sp-input-toolbar__slot" data-testid="input-toolbar-context-meter">
			<ContextMeter />
		</span>
		<span
			class="sp-input-toolbar__slot sp-input-toolbar__send"
			data-testid="input-toolbar-send"
			:data-icon-name="sendIcon"
			:data-send-variant="sendVariant"
		>
			<SpIconButton
				ref="sendButtonEl"
				:icon="sendIcon"
				:ariaLabel="sendAriaLabel"
				:variant="sendVariant"
				:disabled="disabled && !isStreaming"
				data-testid="chat-send-button"
				@click="onTrailingClick"
			/>
		</span>
	</div>
</template>

<style>
.sp-input-toolbar {
	display: flex;
	align-items: center;
	gap: var(--sp-space-2);
	padding-block: var(--sp-space-2);
	padding-inline: var(--sp-space-3);
	flex-wrap: nowrap;
}

.sp-input-toolbar[data-narrow='true'] {
	flex-wrap: wrap;
}

.sp-input-toolbar__slot {
	display: inline-flex;
	align-items: center;
}

.sp-input-toolbar__send {
	margin-inline-start: auto;
	order: 999;
}

.sp-input-toolbar[data-narrow='true'] .sp-input-toolbar__send {
	order: 1;
}

@media (max-width: 360px) {
	.sp-input-toolbar {
		flex-wrap: wrap;
	}
}
</style>
