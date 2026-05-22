<script setup lang="ts">
/**
 * SpIconButton — icon-only button primitive (spec §1.3.12, REQ-AUX-001 + REQ-AUX-018).
 *
 * Composes `<SpIcon>` so every icon ride still flows through `IconPort`
 * (ADR-AUX-001). `ariaLabel` is required because icon-only controls have
 * no accessible name otherwise; Vue's runtime + the TS compiler both
 * enforce it.
 *
 * `loading` swaps the icon to `loader-circle` and marks `aria-busy`,
 * matching the SpButton contract.
 */
import { computed } from 'vue'
import SpIcon from '@/ui/components/primitives/SpIcon.vue'

type Variant = 'primary' | 'secondary' | 'ghost'

interface SpIconButtonProps {
	icon: string
	ariaLabel: string
	variant?: Variant
	disabled?: boolean
	loading?: boolean
	size?: number
}

const props = withDefaults(defineProps<SpIconButtonProps>(), {
	variant: 'ghost',
	disabled: false,
	loading: false,
	size: 16,
})

const emit = defineEmits<{
	click: [ev: MouseEvent]
}>()

defineOptions({ name: 'SpIconButton', inheritAttrs: false })

const isBlocked = computed(() => props.disabled || props.loading)
const renderedIcon = computed(() => (props.loading ? 'loader-circle' : props.icon))

function onClick(ev: MouseEvent): void {
	if (isBlocked.value) return
	emit('click', ev)
}
</script>

<template>
	<button
		type="button"
		class="sp-icon-button"
		:class="{ 'is-loading': loading }"
		:data-variant="variant"
		:data-testid="'sp-icon-button'"
		:aria-label="ariaLabel"
		:disabled="isBlocked"
		:aria-busy="loading ? 'true' : 'false'"
		v-bind="$attrs"
		@click="onClick"
	>
		<SpIcon :name="renderedIcon" :size="size" />
	</button>
</template>

<style>
.sp-icon-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: 0 0 auto;
	padding: var(--sp-space-3);
	border: 1px solid transparent;
	border-radius: var(--sp-radius-md);
	background: transparent;
	color: var(--sp-text-muted);
	cursor: pointer;
	line-height: 0;
	transition: background-color var(--sp-duration-fast) var(--sp-ease),
		color var(--sp-duration-fast) var(--sp-ease),
		border-color var(--sp-duration-fast) var(--sp-ease);
}
.sp-icon-button:hover:not([disabled]) {
	background: var(--sp-interactive-hover);
	color: var(--sp-text-normal);
}
.sp-icon-button:focus-visible {
	outline: none;
	box-shadow: var(--sp-shadow-focus-ring);
}
.sp-icon-button[disabled] {
	cursor: not-allowed;
	opacity: 0.55;
}
.sp-icon-button[aria-busy='true'] {
	cursor: progress;
}
.sp-icon-button.is-loading > .sp-icon {
	animation: spin 1s linear infinite;
}
.sp-icon-button[data-variant='primary'] {
	background: var(--sp-brand);
	border-color: var(--sp-brand);
	color: var(--sp-text-normal);
}
.sp-icon-button[data-variant='primary']:hover:not([disabled]) {
	background: var(--sp-brand-translucent);
}
.sp-icon-button[data-variant='secondary'] {
	background: var(--sp-bg-secondary);
	border-color: var(--sp-border);
	color: var(--sp-text-normal);
}
.sp-icon-button[data-variant='secondary']:hover:not([disabled]) {
	background: var(--sp-interactive-hover);
	border-color: var(--sp-border-strong);
}
</style>
