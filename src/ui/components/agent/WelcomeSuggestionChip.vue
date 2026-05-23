<script setup lang="ts">
/**
 * `WelcomeSuggestionChip.vue` — one chip in the welcome surface suggestion
 * grid (spec §1.3.5). Pure presentational; click bubbles via the parent's
 * `suggestion-pick` emit. QW-D adds an optional Lucide icon slot rendered
 * before the label via `<SpIcon>`. Missing icon names fall through to
 * SpIcon's empty-render fallback (silently no glyph).
 *
 * Satisfies: REQ-AUX-007.
 */
import { useI18n } from 'vue-i18n'
import SpIcon from '@/ui/components/primitives/SpIcon.vue'

interface WelcomeSuggestionChipProps {
	id: string
	label: string
	icon?: string
}
const props = defineProps<WelcomeSuggestionChipProps>()

const emit = defineEmits<{
	pick: [payload: { id: string }]
}>()

const { t } = useI18n()

function handleClick(): void {
	emit('pick', { id: props.id })
}
</script>

<template>
	<button
		type="button"
		class="sp-welcome-chip"
		:data-testid="`welcome-suggestion-${id}`"
		:aria-label="t('welcome.suggestionAriaLabel', { label })"
		@click="handleClick"
	>
		<SpIcon
			v-if="icon"
			class="sp-welcome-chip__icon"
			:name="icon"
			:size="14"
		/>
		<span
			class="sp-welcome-chip__label"
			:data-testid="`welcome-suggestion-${id}-label`"
		>{{ label }}</span>
	</button>
</template>

<style scoped>
.sp-welcome-chip {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	padding-block: 0.4rem;
	padding-inline: 0.75rem;
	border-radius: var(--sp-radius-sm, 4px);
	border: 1px solid var(--sp-border);
	background: var(--sp-bg-primary);
	color: var(--sp-text-normal);
	font-size: 0.8125rem;
	cursor: pointer;
	transition:
		background-color 0.15s,
		border-color 0.15s;
}

.sp-welcome-chip:hover {
	background: var(--sp-interactive-hover);
	border-color: var(--sp-border-strong, var(--sp-border));
}

.sp-welcome-chip:focus-visible {
	outline: 2px solid var(--sp-interactive-accent);
	outline-offset: 1px;
}

.sp-welcome-chip__icon {
	color: var(--sp-text-muted);
}
</style>