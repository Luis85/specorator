<script setup lang="ts">
/**
 * `ModeIndicators.vue` — chip strip above `ChatInput` reflecting the active
 * modeline flags from `chatInputModeStore`.
 *
 * Satisfies REQ-MPS-036, REQ-MPS-038, REQ-MPS-039. Each chip is identified by
 * a `data-testid` so PageObject tests can assert visibility per mode.
 */
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useChatInputModeStore } from '@/ui/stores/chatInputModeStore';

const { t } = useI18n();
const store = useChatInputModeStore();
const { planMode, bangBashMode, instructionMode } = storeToRefs(store);
</script>

<template>
	<div class="sp-mode-indicators" data-testid="mode-indicators">
		<span
			v-if="planMode"
			class="sp-mode-indicators__chip sp-mode-indicators__chip--plan"
			data-testid="mode-indicator-plan"
		>{{ t('mode.plan') }}</span>
		<span
			v-if="bangBashMode"
			class="sp-mode-indicators__chip sp-mode-indicators__chip--bash"
			data-testid="mode-indicator-bang-bash"
		>{{ t('mode.bangBash') }}</span>
		<span
			v-if="instructionMode"
			class="sp-mode-indicators__chip sp-mode-indicators__chip--instruction"
			data-testid="mode-indicator-instruction"
		>{{ t('mode.instruction') }}</span>
	</div>
</template>

<style scoped>
.sp-mode-indicators {
	display: flex;
	gap: 0.375rem;
	min-height: 1.25rem;
	align-items: center;
	flex-wrap: wrap;
}

.sp-mode-indicators__chip {
	display: inline-flex;
	align-items: center;
	padding: 0.125rem 0.5rem;
	border-radius: 999px;
	font-size: 0.6875rem;
	font-weight: 600;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	background: var(--sp-bg-secondary);
	color: var(--sp-text-normal);
	border: 1px solid var(--sp-border);
}

.sp-mode-indicators__chip--plan {
	background: var(--sp-interactive-accent-translucent, var(--sp-interactive-hover));
	color: var(--sp-text-on-accent, var(--sp-text-normal));
	border-color: var(--sp-interactive-accent);
}

.sp-mode-indicators__chip--bash {
	font-family: var(--font-monospace);
}
</style>
