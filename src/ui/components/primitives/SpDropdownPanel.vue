<script setup lang="ts">
/**
 * SpDropdownPanel — backdrop-blur dropdown shell (spec §1.3.14, REQ-AUX-012).
 *
 * Teleports a `role="dialog"` panel to `document.body` so the dropdown can
 * float above the agent surface regardless of the trigger's stacking
 * context. The panel:
 *
 *   - Listens for `keydown.Escape` and emits `close`.
 *   - Listens for `mousedown` outside the panel (and outside the optional
 *     backdrop click target) and emits `close`.
 *   - Moves focus into the first focusable child on open, falling back to
 *     the panel itself when the slot has no focusable.
 *   - Exposes `data-anchor-mode` so the consuming CSS can flip drop
 *     direction (`dropup` vs `dropdown`).
 *
 * The backdrop blur is declared in the stylesheet via `--sp-blur`
 * (ADR-AUX-002) with a solid background fallback. CQ-AUX-04 is escalated:
 * this primitive ships scoped to the agent surface; extending it to
 * Settings tab pickers is deferred.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'

type AnchorMode = 'dropup' | 'dropdown'

interface SpDropdownPanelProps {
	open: boolean
	anchorMode?: AnchorMode
	ariaLabel: string
	/**
	 * When `false`, the panel does NOT move focus into itself on open. The
	 * slash-command and @-mention dropdowns rely on this: the textarea
	 * remains focused so the user can keep typing-to-filter and arrow-key
	 * navigate while the dropdown is visible (PR-ASV-3, PR-ASV-4).
	 * Defaults to `true` for menu-style consumers (ProviderMenu, etc.).
	 */
	autoFocus?: boolean
}

const props = withDefaults(defineProps<SpDropdownPanelProps>(), {
	anchorMode: 'dropup',
	autoFocus: true,
})

const emit = defineEmits<{
	close: []
}>()

defineOptions({ name: 'SpDropdownPanel' })

const panelRef = ref<HTMLElement | null>(null)

const computedClasses = computed(() => [
	'sp-dropdown-panel',
	`sp-dropdown-panel--${props.anchorMode}`,
])

function onDocumentKeydown(ev: KeyboardEvent): void {
	if (!props.open) return
	if (ev.key === 'Escape') {
		emit('close')
	}
}

function onDocumentMousedown(ev: MouseEvent): void {
	if (!props.open) return
	const panel = panelRef.value
	if (!panel) {
		emit('close')
		return
	}
	const target = ev.target as Node | null
	if (target && panel.contains(target)) return
	emit('close')
}

async function focusFirst(): Promise<void> {
	await nextTick()
	const panel = panelRef.value
	if (!panel) return
	const focusable = panel.querySelector<HTMLElement>(
		'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
	)
	if (focusable) {
		focusable.focus()
	} else {
		panel.focus()
	}
}

onMounted(() => {
	document.addEventListener('keydown', onDocumentKeydown, true)
	document.addEventListener('mousedown', onDocumentMousedown, true)
	if (props.open && props.autoFocus) {
		void focusFirst()
	}
})

onBeforeUnmount(() => {
	document.removeEventListener('keydown', onDocumentKeydown, true)
	document.removeEventListener('mousedown', onDocumentMousedown, true)
})

watch(
	() => props.open,
	(isOpen) => {
		if (isOpen && props.autoFocus) {
			void focusFirst()
		}
	},
)
</script>

<template>
	<Teleport to="body">
		<template v-if="open">
			<div :data-testid="'sp-dropdown-panel-backdrop'" class="sp-dropdown-panel-backdrop" />
			<div
				ref="panelRef"
				:class="computedClasses"
				:data-testid="'sp-dropdown-panel'"
				:data-anchor-mode="anchorMode"
				role="dialog"
				:aria-label="ariaLabel"
				:aria-modal="'false'"
				tabindex="-1"
			>
				<slot />
			</div>
		</template>
	</Teleport>
</template>

<style>
.sp-dropdown-panel-backdrop {
	position: fixed;
	inset: 0;
	background: transparent;
	z-index: var(--sp-z-dropdown);
	pointer-events: none;
}
.sp-dropdown-panel {
	position: fixed;
	z-index: var(--sp-z-dropdown-fixed);
	min-width: 200px;
	max-width: min(360px, 90vw);
	max-height: min(60vh, 480px);
	overflow: auto;
	padding: var(--sp-space-3);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-lg);
	background: var(--sp-surface-overlay);
	color: var(--sp-text-normal);
	font-family: var(--sp-font-text);
	font-size: var(--sp-font-size-md);
	box-shadow: var(--sp-shadow-dropdown);
	-webkit-backdrop-filter: var(--sp-blur);
	backdrop-filter: var(--sp-blur);
}
.sp-dropdown-panel:focus-visible {
	outline: none;
	box-shadow: var(--sp-shadow-focus-ring), var(--sp-shadow-dropdown);
}
.sp-dropdown-panel--dropup {
	inset-block-end: 64px;
	inset-inline-start: 50%;
	transform: translateX(-50%);
	box-shadow: var(--sp-shadow-dropup);
}
.sp-dropdown-panel--dropdown {
	inset-block-start: 64px;
	inset-inline-start: 50%;
	transform: translateX(-50%);
}
</style>
