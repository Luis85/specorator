<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ServiceTierWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';

/**
 * The service-tier toggle (SPEC-TC-017, REQ-TC-019/020/041). A capability-gated
 * `zap` `role="switch"`. Presentational — props in, events out. Rendered only on a
 * `visible` slice (the strip hides it on Claude where `!hasServiceTier` / no
 * descriptor — slot collapses, EC-TC-2). Toggling emits `toggle(!active)` so the
 * surface sets `controls.serviceTier` — declared-now, emitted into the turn now;
 * a capable runtime consumes it in P9. The active glow honours reduced-motion +
 * forced-colors (NFR-TC-009). No `obsidian`/`v-html`. Claudian ground-truth:
 * `ServiceTierToggle` (Codex fast-mode `zap`).
 */
const props = defineProps<{ vm: ServiceTierWidgetVm }>();
const emit = defineEmits<{ toggle: [active: boolean] }>();

const { t } = useI18n();

const visible = computed(
	() => props.vm.visibility.kind === 'visible' && props.vm.descriptor !== undefined,
);
const label = computed(
	() => props.vm.descriptor?.label ?? t('agent.chat.toolbar.serviceTier.label'),
);

function onToggle(): void {
	emit('toggle', !props.vm.active);
}
</script>

<template>
	<button
		v-if="visible"
		type="button"
		class="sp-toolbar-service-tier"
		:class="{ 'sp-toolbar-service-tier--on': vm.active }"
		data-testid="toolbar-service-tier"
		role="switch"
		:aria-checked="vm.active ? 'true' : 'false'"
		:aria-label="label"
		@click="onToggle"
	>
		<span aria-hidden="true">⚡</span>
	</button>
</template>

<style scoped>
.sp-toolbar-service-tier {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	block-size: var(--sp-toolbar-widget-h);
	inline-size: var(--sp-toolbar-widget-h);
	border: 1px solid var(--sp-toggle-track);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-secondary);
	color: var(--sp-text-muted);
	cursor: pointer;
}

.sp-toolbar-service-tier--on {
	border-color: var(--sp-toggle-active);
	color: var(--sp-toggle-active);
	box-shadow: var(--sp-service-tier-glow);
}

@media (prefers-reduced-motion: reduce) {
	.sp-toolbar-service-tier {
		transition: none;
	}
}
</style>
