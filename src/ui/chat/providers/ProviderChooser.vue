<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ProviderOptionVM } from '@/application/chat/providers/buildProviderViewModel';
import ProviderOption from './ProviderOption.vue';

/**
 * The minimal provider-selection surface (SPEC-PV-016, REQ-PV-001/002/006/090/110/114).
 * Presentational — props in, `select(id)` out. Renders NOTHING when `showChooser` is
 * false (a single-Claude registry → byte-identical P8, EC-PV-1); when true, lists the
 * enabled providers in blank-tab order as a `role="listbox"` of `ProviderOption` rows,
 * re-emitting each row's `select` up. A11y: an accessible name, each option keyboard-
 * operable + announced active (NFR-PV-009). No `obsidian`/`v-html`. Claudian
 * ground-truth: the provider switcher.
 */
defineProps<{ options: readonly ProviderOptionVM[]; showChooser: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();

const { t } = useI18n();

function onSelect(id: string): void {
	emit('select', id);
}
</script>

<template>
	<div
		v-if="showChooser"
		class="sp-provider-chooser"
		data-testid="provider-chooser"
		role="listbox"
		:aria-label="t('agent.chat.providers.chooser.title')"
	>
		<ProviderOption
			v-for="option in options"
			:key="option.id"
			:option="option"
			@select="onSelect"
		/>
	</div>
</template>

<style scoped>
.sp-provider-chooser {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-1);
	padding: var(--sp-space-1);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-surface-overlay);
}
</style>
