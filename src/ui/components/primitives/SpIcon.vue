<script setup lang="ts">
/**
 * SpIcon — single Lucide-icon seam (spec §1.3.1, REQ-AUX-001, REQ-AUX-018).
 *
 * Renders a Lucide icon by delegating to the injected IconPort. Every other
 * component renders icons by composing this primitive — UI code must never
 * call obsidian.setIcon directly (CLAUDE.md / ESLint enforced).
 *
 * Missing-icon fallback (REQ-AUX-018): if the port leaves the host element
 * empty (no `<svg>` child), SpIcon writes `el.textContent = ariaLabel ?? name`
 * and emits a deduplicated `LoggerPort.warn` so consumers spot bad icon names
 * without flooding the console.
 */
import { onMounted, ref, watch, computed } from 'vue'
import { useIconPort } from '@/ui/composables/useIconPort'
import { useLoggerPort } from '@/ui/composables/useLoggerPort'

interface SpIconProps {
	name: string
	size?: number
	ariaLabel?: string
}
const props = withDefaults(defineProps<SpIconProps>(), { size: 16 })

defineOptions({ name: 'SpIcon' })

const el = ref<HTMLElement | null>(null)
const iconPort = useIconPort()
const logger = useLoggerPort()

const sizeStyle = computed(() => ({
	width: `${String(props.size)}px`,
	height: `${String(props.size)}px`,
}))

function render(name: string): void {
	const host = el.value
	if (!host) return
	iconPort.setIcon(host, name)
	if (host.querySelector('svg') === null) {
		host.textContent = props.ariaLabel ?? name
		if (!warnedNames.has(name)) {
			warnedNames.add(name)
			logger.warn(`SpIcon: missing icon "${name}"`, { name })
		}
	}
}

onMounted(() => {
	render(props.name)
})

watch(
	() => props.name,
	(name) => {
		render(name)
	},
)

defineExpose({ el })
</script>

<script lang="ts">
/**
 * Module-level dedup set so `LoggerPort.warn` fires once per missing icon
 * name across the lifetime of the app, regardless of how many <SpIcon>
 * instances mount the same bad name. Exported as a private test hook so
 * unit tests can reset state between cases.
 */
const warnedNames = new Set<string>()
export function __resetSpIconWarnedNames(): void {
	warnedNames.clear()
}
</script>

<template>
	<span
		ref="el"
		class="sp-icon"
		:style="sizeStyle"
		:data-icon="name"
		:data-testid="'sp-icon'"
		:aria-label="ariaLabel ?? undefined"
		:aria-hidden="ariaLabel ? 'false' : 'true'"
	/>
</template>

<style>
.sp-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: 0 0 auto;
	line-height: 0;
}
.sp-icon > svg {
	width: 100%;
	height: 100%;
}
</style>
