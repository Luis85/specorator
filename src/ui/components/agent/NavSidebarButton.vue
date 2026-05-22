<script setup lang="ts">
/**
 * `NavSidebarButton.vue` — circular icon button used by
 * `<FloatingNavSidebar>` (WS-AUX-9, T-AUX-328). Wraps `<SpIconButton>` with
 * a circular shape, fixed 32 px size, and the scale-on-hover affordance
 * required by spec §1.3.11.
 *
 * The parent column controls resting opacity (0.15) and hover opacity (1.0);
 * this primitive owns the per-button `scale(1.05)` lift and circular chrome.
 *
 * `ariaLabel` is required because the only visual cue is the icon —
 * REQ-AUX-018 / NFR-AUX-008.
 */
import SpIconButton from '@/ui/components/primitives/SpIconButton.vue'

interface NavSidebarButtonProps {
	icon: string
	ariaLabel: string
	disabled?: boolean
}

withDefaults(defineProps<NavSidebarButtonProps>(), {
	disabled: false,
})

const emit = defineEmits<{
	click: [ev: MouseEvent]
}>()

defineOptions({ name: 'NavSidebarButton', inheritAttrs: false })

function onClick(ev: MouseEvent): void {
	emit('click', ev)
}
</script>

<template>
	<span
		class="sp-nav-sidebar-button"
		:data-testid="($attrs['data-testid'] as string | undefined) ?? 'nav-sidebar-button'"
	>
		<SpIconButton
			:icon="icon"
			:ariaLabel="ariaLabel"
			:disabled="disabled"
			:size="16"
			@click="onClick"
		/>
	</span>
</template>

<style scoped>
.sp-nav-sidebar-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	inline-size: 32px;
	block-size: 32px;
	border-radius: 50%;
	background: var(--sp-bg-secondary);
	border: 1px solid var(--sp-border);
	transition:
		transform var(--sp-duration-fast) var(--sp-ease),
		background-color var(--sp-duration-fast) var(--sp-ease);
}

.sp-nav-sidebar-button:hover {
	transform: scale(1.05);
	background: var(--sp-interactive-hover);
}

@media (prefers-reduced-motion: reduce) {
	.sp-nav-sidebar-button {
		transition: none;
	}
	.sp-nav-sidebar-button:hover {
		transform: none;
	}
}

.sp-nav-sidebar-button :deep(.sp-icon-button) {
	inline-size: 100%;
	block-size: 100%;
	padding: 0;
	border: none;
	background: transparent;
	border-radius: 50%;
}
</style>
