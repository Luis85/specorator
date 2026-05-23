<script setup lang="ts">
/**
 * SpButton — label button primitive (spec §1.3.12, REQ-AUX-017).
 *
 * Three variants (`primary` / `secondary` / `ghost`) surface through the
 * `data-variant` attribute so tests and consumer CSS can target each one
 * without rewriting prop trees. `loading` sets `aria-busy="true"` and
 * blocks the click event — callers do not need to track a separate
 * disabled flag during async work.
 *
 * All styling resolves through `--sp-*` design tokens (ADR-AUX-002); no
 * Obsidian variables are read directly.
 */
import { computed } from 'vue'

type Variant = 'primary' | 'secondary' | 'ghost'

interface SpButtonProps {
	variant?: Variant
	disabled?: boolean
	loading?: boolean
	type?: 'button' | 'submit'
}

const props = withDefaults(defineProps<SpButtonProps>(), {
	variant: 'secondary',
	disabled: false,
	loading: false,
	type: 'button',
})

const emit = defineEmits<{
	click: [ev: MouseEvent]
}>()

defineOptions({ name: 'SpButton', inheritAttrs: false })

const isBlocked = computed(() => props.disabled || props.loading)

function onClick(ev: MouseEvent): void {
	if (isBlocked.value) return
	emit('click', ev)
}
</script>

<template>
	<button
		:type="type"
		class="sp-button"
		:data-variant="variant"
		:data-testid="'sp-button'"
		:disabled="isBlocked"
		:aria-busy="loading ? 'true' : 'false'"
		v-bind="$attrs"
		@click="onClick"
	>
		<slot />
	</button>
</template>

<style>
.sp-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: var(--sp-space-3);
	padding-block: var(--sp-space-3);
	padding-inline: var(--sp-space-5);
	border: 1px solid transparent;
	border-radius: var(--sp-radius-md);
	background: transparent;
	color: var(--sp-text-normal);
	font-family: var(--sp-font-text);
	font-size: var(--sp-font-size-md);
	font-weight: var(--sp-font-weight-medium);
	line-height: var(--sp-line-height-tight);
	cursor: pointer;
	transition: background-color var(--sp-duration-fast) var(--sp-ease),
		color var(--sp-duration-fast) var(--sp-ease),
		border-color var(--sp-duration-fast) var(--sp-ease);
}
.sp-button:focus-visible {
	outline: none;
	box-shadow: var(--sp-shadow-focus-ring);
}
.sp-button[disabled] {
	cursor: not-allowed;
	opacity: 0.55;
}
.sp-button[aria-busy='true'] {
	cursor: progress;
}
.sp-button[data-variant='primary'] {
	background: var(--sp-brand);
	border-color: var(--sp-brand);
	color: var(--sp-text-normal);
}
.sp-button[data-variant='primary']:hover:not([disabled]) {
	background: var(--sp-brand-translucent);
}
.sp-button[data-variant='secondary'] {
	background: var(--sp-bg-secondary);
	border-color: var(--sp-border);
	color: var(--sp-text-normal);
}
.sp-button[data-variant='secondary']:hover:not([disabled]) {
	background: var(--sp-interactive-hover);
	border-color: var(--sp-border-strong);
}
.sp-button[data-variant='ghost'] {
	background: transparent;
	border-color: transparent;
	color: var(--sp-text-muted);
}
.sp-button[data-variant='ghost']:hover:not([disabled]) {
	background: var(--sp-interactive-hover);
	color: var(--sp-text-normal);
}
</style>
