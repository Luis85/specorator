<script setup lang="ts">
/**
 * SpToggleSwitch — pill toggle primitive (spec §1.3.13, REQ-AUX-017).
 *
 * Two-state control that emits the standard v-model pair
 * (`update:modelValue`). Implemented as a `<button role="switch">` with
 * `aria-pressed` so assistive tech announces the state correctly. The
 * visible inline `label` is the canonical name; `ariaLabel` overrides
 * only when the announced name needs to differ.
 */
interface SpToggleSwitchProps {
	modelValue: boolean
	label: string
	ariaLabel?: string
	disabled?: boolean
}

const props = withDefaults(defineProps<SpToggleSwitchProps>(), {
	disabled: false,
	ariaLabel: undefined,
})

const emit = defineEmits<{
	'update:modelValue': [value: boolean]
}>()

defineOptions({ name: 'SpToggleSwitch', inheritAttrs: false })

function toggle(): void {
	if (props.disabled) return
	emit('update:modelValue', !props.modelValue)
}

function onKeydown(ev: KeyboardEvent): void {
	if (ev.key === 'Enter' || ev.key === ' ') {
		ev.preventDefault()
		toggle()
	}
}
</script>

<template>
	<button
		type="button"
		role="switch"
		class="sp-toggle-switch"
		:class="{ 'is-on': modelValue, 'is-disabled': disabled }"
		:data-testid="'sp-toggle-switch'"
		:aria-pressed="modelValue ? 'true' : 'false'"
		:aria-checked="modelValue ? 'true' : 'false'"
		:aria-label="ariaLabel ?? label"
		:disabled="disabled"
		v-bind="$attrs"
		@click="toggle"
		@keydown="onKeydown"
	>
		<span class="sp-toggle-switch__track" aria-hidden="true">
			<span class="sp-toggle-switch__thumb" />
		</span>
		<span :data-testid="'sp-toggle-switch-label'" class="sp-toggle-switch__label">
			{{ label }}
		</span>
	</button>
</template>

<style>
.sp-toggle-switch {
	display: inline-flex;
	align-items: center;
	gap: var(--sp-space-3);
	padding-block: var(--sp-space-2);
	padding-inline: var(--sp-space-4);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-pill);
	background: var(--sp-bg-secondary);
	color: var(--sp-text-normal);
	font-family: var(--sp-font-text);
	font-size: var(--sp-font-size-sm);
	cursor: pointer;
	transition: background-color var(--sp-duration-fast) var(--sp-ease),
		border-color var(--sp-duration-fast) var(--sp-ease),
		color var(--sp-duration-fast) var(--sp-ease);
}
.sp-toggle-switch:hover:not(.is-disabled) {
	background: var(--sp-interactive-hover);
}
.sp-toggle-switch:focus-visible {
	outline: none;
	box-shadow: var(--sp-shadow-focus-ring);
}
.sp-toggle-switch.is-on {
	border-color: var(--sp-brand);
	background: var(--sp-brand-translucent);
}
.sp-toggle-switch.is-disabled {
	cursor: not-allowed;
	opacity: 0.55;
}
.sp-toggle-switch__track {
	position: relative;
	display: inline-block;
	width: 22px;
	height: 12px;
	border-radius: var(--sp-radius-pill);
	background: var(--sp-border-strong);
	transition: background-color var(--sp-duration-fast) var(--sp-ease);
}
.sp-toggle-switch.is-on .sp-toggle-switch__track {
	background: var(--sp-brand);
}
.sp-toggle-switch__thumb {
	position: absolute;
	top: 1px;
	inset-inline-start: 1px;
	width: 10px;
	height: 10px;
	border-radius: var(--sp-radius-full);
	background: var(--sp-bg-primary);
	transition: transform var(--sp-duration-fast) var(--sp-ease);
}
.sp-toggle-switch.is-on .sp-toggle-switch__thumb {
	transform: translateX(10px);
}
.sp-toggle-switch__label {
	white-space: nowrap;
}
</style>
