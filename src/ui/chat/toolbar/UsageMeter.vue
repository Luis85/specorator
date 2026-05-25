<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { UsageWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';

/**
 * The context-usage meter (SPEC-TC-020, REQ-TC-024/025/026/027). A declarative
 * 240° SVG arc gauge whose fill `stroke-dasharray` is computed IN-REPO from
 * `vm.percentage` (no chart lib, NFR-TC-012; no `v-html`/`innerHTML`, NFR-TC-004).
 * Rendered only on a `visible` slice (hidden when usage null — no zero-state
 * gauge, EC-TC-7). The "{n}%" label + the `role="img"` `aria-label` carry the
 * value so colour is never the sole signal (NFR-TC-009); `vm.warning`
 * (`percentage > 80`) switches to the warning style and exposes a `/compact`
 * tooltip. Distinct from the unchanged P2 `UsageInfo.vue`. Claudian ground-truth:
 * `ContextUsageMeter`.
 */
const props = defineProps<{ vm: UsageWidgetVm }>();

const { t } = useI18n();

// Gauge geometry — a 240° arc of a unit circle, centred in a 36×36 box. The arc
// sweeps from 150° to 30° (clockwise across the bottom-open gap), i.e. 240° of
// fill. The track + the fill share the same path `d`; only the fill's dash
// changes with the percentage.
const SIZE = 36;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const ARC_DEGREES = 240;
const CENTER = SIZE / 2;
const ARC_LENGTH = (ARC_DEGREES / 360) * 2 * Math.PI * RADIUS;

const visible = computed(() => props.vm.visibility.kind === 'visible');
const clamped = computed(() => Math.min(100, Math.max(0, props.vm.percentage)));
const filled = computed(() => (clamped.value / 100) * ARC_LENGTH);
/** `filled gap` — the gap is the remainder of the FULL circle so only the arc shows. */
const dashArray = computed(() => `${filled.value.toFixed(2)} ${(2 * Math.PI * RADIUS).toFixed(2)}`);

/** A point on the gauge circle at `degrees` (0° = 3 o'clock, growing clockwise). */
function pointAt(degrees: number): { x: number; y: number } {
	const rad = (degrees * Math.PI) / 180;
	return { x: CENTER + RADIUS * Math.cos(rad), y: CENTER + RADIUS * Math.sin(rad) };
}

// Sweep 240°: start bottom-left (150°) clockwise to bottom-right (30°) the long way.
const arcPath = computed(() => {
	const start = pointAt(150);
	const end = pointAt(150 + ARC_DEGREES);
	// The 240° sweep is always the long way round → the large-arc flag is 1.
	const largeArc = 1;
	return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${String(RADIUS)} ${String(RADIUS)} 0 ${String(largeArc)} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
});

const percentLabel = computed(() => `${String(Math.round(clamped.value))}%`);
const ariaLabel = computed(() =>
	t('agent.chat.toolbar.usage.label', { percent: Math.round(clamped.value) }),
);
const compactHint = computed(() =>
	props.vm.warning ? t('agent.chat.toolbar.usage.compactHint') : undefined,
);
const viewBox = `0 0 ${String(SIZE)} ${String(SIZE)}`;
</script>

<template>
	<div
		v-if="visible"
		class="sp-toolbar-usage"
		:class="{ 'sp-toolbar-usage--warning': vm.warning }"
		data-testid="toolbar-usage"
		role="img"
		:aria-label="ariaLabel"
		:title="compactHint"
	>
		<svg
			class="sp-toolbar-usage__svg"
			:viewBox="viewBox"
			:width="SIZE"
			:height="SIZE"
			aria-hidden="true"
			focusable="false"
		>
			<path
				class="sp-toolbar-usage__track"
				:d="arcPath"
				fill="none"
				:stroke-width="STROKE"
				stroke-linecap="round"
			/>
			<path
				class="sp-toolbar-usage__fill"
				data-testid="toolbar-usage-arc"
				:d="arcPath"
				fill="none"
				:stroke-width="STROKE"
				stroke-linecap="round"
				:stroke-dasharray="dashArray"
			/>
		</svg>
		<span class="sp-toolbar-usage__label" data-testid="toolbar-usage-label">{{ percentLabel }}</span>
	</div>
</template>

<style scoped>
.sp-toolbar-usage {
	display: inline-flex;
	align-items: center;
	gap: var(--sp-space-1);
	inline-size: var(--sp-usage-arc-size);
}

.sp-toolbar-usage__svg {
	display: block;
}

.sp-toolbar-usage__track {
	stroke: var(--sp-usage-arc-track);
}

.sp-toolbar-usage__fill {
	stroke: var(--sp-usage-arc-fill);
	transition: stroke-dasharray var(--sp-duration-fast) ease;
}

.sp-toolbar-usage--warning .sp-toolbar-usage__fill {
	stroke: var(--sp-usage-arc-warn);
}

.sp-toolbar-usage__label {
	font-size: var(--sp-font-size-sm);
	color: var(--sp-text-muted);
}

.sp-toolbar-usage--warning .sp-toolbar-usage__label {
	color: var(--sp-warning);
	font-weight: var(--sp-font-weight-semibold);
}

@media (prefers-reduced-motion: reduce) {
	.sp-toolbar-usage__fill {
		transition: none;
	}
}
</style>
