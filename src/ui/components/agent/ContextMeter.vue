<script setup lang="ts">
/**
 * `ContextMeter.vue` — SVG donut surfacing the active thread's context-window
 * usage. Reads `contextUsageStore.usageFraction`, transitions stroke from
 * `--sp-brand` to `--sp-warning` once `isWarning` flips (>= 80%).
 *
 * REQ-AUX-004, SPEC-AUX-001 §1.3.4.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';

import { useContextUsageStore } from '@/ui/stores/contextUsageStore';

interface ContextMeterProps {
	size?: number;
	strokeWidth?: number;
}
const props = withDefaults(defineProps<ContextMeterProps>(), {
	size: 18,
	strokeWidth: 2,
});

const { t } = useI18n();
const store = useContextUsageStore();
const { tokensUsed, tokensCap, usageFraction, isWarning } = storeToRefs(store);

const radius = computed(() => (props.size - props.strokeWidth) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);
const center = computed(() => props.size / 2);

const dashoffset = computed<number>(() => {
	const f = usageFraction.value;
	if (f === null) return circumference.value;
	return circumference.value * (1 - f);
});

const strokeColor = computed<string>(() =>
	isWarning.value ? 'var(--sp-warning)' : 'var(--sp-brand)',
);

const tooltip = computed<string>(() =>
	t('agent.composer.contextMeter.tooltip', {
		used: String(tokensUsed.value),
		total: tokensCap.value !== null ? String(tokensCap.value) : '—',
	}),
);
</script>

<template>
	<span
		class="sp-context-meter"
		data-testid="context-meter"
		:data-warning="isWarning ? 'true' : 'false'"
		:title="tooltip"
		role="img"
		:aria-label="tooltip"
	>
		<svg
			:width="size"
			:height="size"
			:viewBox="`0 0 ${size} ${size}`"
			aria-hidden="true"
			focusable="false"
		>
			<circle
				data-testid="context-meter-track"
				class="sp-context-meter__track"
				:cx="center"
				:cy="center"
				:r="radius"
				fill="none"
				stroke="var(--sp-border-strong)"
				:stroke-width="strokeWidth"
			/>
			<circle
				data-testid="context-meter-progress"
				class="sp-context-meter__progress"
				:cx="center"
				:cy="center"
				:r="radius"
				fill="none"
				:stroke="strokeColor"
				:stroke-width="strokeWidth"
				stroke-linecap="round"
				:stroke-dasharray="circumference"
				:stroke-dashoffset="dashoffset"
				:transform="`rotate(-90 ${center} ${center})`"
			/>
		</svg>
	</span>
</template>

<style>
.sp-context-meter {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	line-height: 0;
}
.sp-context-meter__progress {
	transition:
		stroke-dashoffset var(--sp-duration-medium) var(--sp-ease),
		stroke var(--sp-duration-fast) var(--sp-ease);
}
@media (prefers-reduced-motion: reduce) {
	.sp-context-meter__progress {
		transition: none;
	}
}
</style>
