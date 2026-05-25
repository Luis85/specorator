<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ModeWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';

/**
 * The mode toggle (SPEC-TC-014, REQ-TC-013/014/041). A descriptor-driven
 * two-option `role="switch"`: the toggle is "on" at `descriptor.activeValue`,
 * "off" at `descriptor.inactiveValue`. Presentational — props in, events out: the
 * parent (ChatSurface) owns the per-tab control state (ADR-TC-001). Returns
 * nothing on a `hidden` slice as a guard (the strip already gates it). Toggling
 * flips to the OTHER option value → `set` emit. No `obsidian`/`v-html`. Claudian
 * ground-truth: `ModeSelector` (`SpToggleSwitch` + activeValue/inactiveValue).
 */
const props = defineProps<{ vm: ModeWidgetVm }>();
const emit = defineEmits<{ set: [value: string] }>();

const { t } = useI18n();

const visible = computed(
	() => props.vm.visibility.kind === 'visible' && props.vm.descriptor !== undefined,
);
const isActive = computed(() => props.vm.activeValue === props.vm.descriptor?.activeValue);
const currentLabel = computed(() =>
	isActive.value ? (props.vm.descriptor?.activeLabel ?? '') : (props.vm.descriptor?.inactiveLabel ?? ''),
);

/** Flip to the other option value and emit it (REQ-TC-014). */
function onToggle(): void {
	const descriptor = props.vm.descriptor;
	if (descriptor === undefined) return;
	emit('set', isActive.value ? descriptor.inactiveValue : descriptor.activeValue);
}
</script>

<template>
	<button
		v-if="visible"
		type="button"
		class="sp-toolbar-mode"
		:class="{ 'sp-toolbar-mode--on': isActive }"
		data-testid="toolbar-mode"
		role="switch"
		:aria-checked="isActive ? 'true' : 'false'"
		:aria-label="t('agent.chat.toolbar.mode.label')"
		@click="onToggle"
	>
		<span class="sp-toolbar-mode__label" dir="auto">{{ currentLabel }}</span>
	</button>
</template>

<style scoped>
.sp-toolbar-mode {
	display: inline-flex;
	align-items: center;
	gap: var(--sp-space-1);
	block-size: var(--sp-toolbar-widget-h);
	border: 1px solid var(--sp-toggle-track);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-secondary);
	color: var(--sp-text-muted);
	padding-inline: var(--sp-space-2);
	font-size: var(--sp-font-size-sm);
	cursor: pointer;
}

.sp-toolbar-mode--on {
	border-color: var(--sp-toggle-active);
	color: var(--sp-text-normal);
}
</style>
