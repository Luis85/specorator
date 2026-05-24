<script setup lang="ts">
import { computed } from 'vue';
import { useCollapsible } from '@/ui/composables/useCollapsible';

/**
 * The one reusable collapsible primitive (SPEC-RR-024) every rich block reuses.
 * WCAG 2.2 AA (NFR-RR-008): collapsed by default (REQ-RR-018); a focusable
 * `role="button"` header that toggles on click / Enter / Space (the keyboard
 * paths `preventDefault`, REQ-RR-015); `aria-expanded` reflects state; a dynamic
 * accessible label `"<label> - click to expand"` / `"… - click to collapse"`
 * (parity `collapsible.ts:40`). The expanded body draws the 2px tree-branch rail
 * via logical-property `--sp-tool-rail*` tokens (24px `--sp-thinking-rail-indent`
 * variant) — no raw hex, no physical-direction leak (NFR-RR-007). Reduced-motion
 * / forced-colors are honoured in CSS. Mirrors claudian-main `setupCollapsible`/
 * `collapseElement` declaratively. `header` + `default` slots; no `v-html`.
 */
const props = withDefaults(
	defineProps<{
		/** Base accessible label the dynamic suffix is appended to. */
		label: string;
		initiallyExpanded?: boolean;
		/** `'thinking'` widens the rail indent to `--sp-thinking-rail-indent` (24px). */
		variant?: 'tool' | 'thinking';
	}>(),
	{ initiallyExpanded: false, variant: 'tool' },
);

const { isExpanded, toggle, collapse } = useCollapsible({
	initiallyExpanded: props.initiallyExpanded,
});

/** Programmatic collapse — exposed so a parent (ThinkingBlock finalise) can call it. */
defineExpose({ isExpanded, collapse });

const ariaLabel = computed(() =>
	isExpanded.value
		? `${props.label} - click to collapse`
		: `${props.label} - click to expand`,
);

function onKeydown(event: KeyboardEvent): void {
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		toggle();
	}
}
</script>

<template>
	<div class="sp-collapsible" :class="{ 'sp-collapsible--expanded': isExpanded }" data-testid="sp-collapsible">
		<div
			class="sp-collapsible__header"
			data-testid="sp-collapsible-header"
			role="button"
			tabindex="0"
			:aria-expanded="isExpanded ? 'true' : 'false'"
			:aria-label="ariaLabel"
			@click="toggle"
			@keydown="onKeydown"
		>
			<slot name="header" />
		</div>
		<div
			v-if="isExpanded"
			class="sp-collapsible__body"
			:class="`sp-collapsible__body--${variant}`"
			data-testid="sp-collapsible-body"
		>
			<slot />
		</div>
	</div>
</template>

<style scoped>
.sp-collapsible__header {
	display: flex;
	align-items: center;
	gap: var(--sp-space-2);
	cursor: pointer;
	border-radius: var(--sp-radius-sm);
}

.sp-collapsible__header:focus-visible {
	outline: 2px solid var(--sp-accent);
	outline-offset: 2px;
}

.sp-collapsible__body {
	margin-block-start: var(--sp-space-2);
	margin-inline-start: var(--sp-tool-rail-margin);
	padding-inline-start: var(--sp-tool-rail-indent);
	border-inline-start: var(--sp-tool-rail-width) solid var(--sp-tool-rail);
}

.sp-collapsible__body--thinking {
	padding-inline-start: var(--sp-thinking-rail-indent);
}

@media (prefers-reduced-motion: reduce) {
	.sp-collapsible__header {
		transition: none;
	}
}

@media (forced-colors: active) {
	.sp-collapsible__header:focus-visible {
		outline-color: CanvasText;
	}
}
</style>
