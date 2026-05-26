<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ProviderOptionVM } from '@/application/chat/providers/buildProviderViewModel';

/**
 * One provider chooser row (SPEC-PV-016, REQ-PV-090/110/113). Presentational —
 * props in, `select` out. Shows the provider icon (accessible label) + the localised
 * display name + an explicit active/default text marker. The active provider is
 * announced via `aria-current`; the active state is conveyed by TEXT + an icon marker,
 * never colour-only (NFR-PV-009). Keyboard-operable (Enter/Space activate). No
 * `obsidian`/`v-html`. Claudian ground-truth: the provider switcher row.
 */
const props = defineProps<{ option: ProviderOptionVM }>();
const emit = defineEmits<{ select: [id: string] }>();

const { t } = useI18n();

const displayName = computed(() => t(props.option.displayNameKey));
const accessibleName = computed(() =>
	t('agent.chat.providers.chooser.select', { provider: displayName.value }),
);
const markerText = computed(() =>
	props.option.isActive
		? t('agent.chat.providers.chooser.active')
		: props.option.isDefault
			? t('agent.chat.providers.chooser.default')
			: '',
);

function onSelect(): void {
	emit('select', props.option.id);
}

function onKeydown(event: KeyboardEvent): void {
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		onSelect();
	}
}
</script>

<template>
	<button
		type="button"
		class="sp-provider-option"
		:class="{ 'sp-provider-option--active': option.isActive }"
		data-testid="provider-option"
		role="option"
		:data-provider="option.id"
		:aria-current="option.isActive ? 'true' : undefined"
		:aria-selected="option.isActive ? 'true' : 'false'"
		:aria-label="accessibleName"
		@click="onSelect"
		@keydown="onKeydown"
	>
		<span
			class="sp-provider-option__icon"
			data-testid="provider-icon"
			:aria-label="displayName"
			role="img"
			>◆</span
		>
		<span class="sp-provider-option__name" dir="auto">{{ displayName }}</span>
		<span
			v-if="option.isActive"
			class="sp-provider-option__marker"
			data-testid="provider-option-active"
			>{{ markerText }}</span
		>
		<span v-else-if="option.isDefault" class="sp-provider-option__marker">{{ markerText }}</span>
	</button>
</template>

<style scoped>
.sp-provider-option {
	display: inline-flex;
	align-items: center;
	gap: var(--sp-space-2);
	inline-size: 100%;
	block-size: var(--sp-toolbar-widget-h);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-secondary);
	color: var(--sp-text-normal);
	padding-inline: var(--sp-space-2);
	font-size: var(--sp-font-size-sm);
	cursor: pointer;
	text-align: start;
}

.sp-provider-option--active {
	border-color: var(--sp-accent);
	font-weight: var(--sp-font-weight-semibold);
}

.sp-provider-option__icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	color: var(--sp-text-muted);
}

/* Per-provider brand swatch on the row icon (SPEC-PV-021). The brand colour
   resolves from the section 4.16 provider-brand aliases by the row's data-provider. */
.sp-provider-option[data-provider='claude'] .sp-provider-option__icon {
	color: var(--sp-provider-brand-claude);
}
.sp-provider-option[data-provider='codex'] .sp-provider-option__icon {
	color: var(--sp-provider-brand-codex);
}
.sp-provider-option[data-provider='opencode'] .sp-provider-option__icon {
	color: var(--sp-provider-brand-opencode);
}

.sp-provider-option__name {
	flex: 1 1 auto;
}

.sp-provider-option__marker {
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
}
</style>
