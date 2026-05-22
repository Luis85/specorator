<script setup lang="ts">
/**
 * `FloatingNavSidebar.vue` — right-edge floating column hosting
 * conversation-scoped navigation actions (WS-AUX-9, T-AUX-327, spec §1.3.11).
 *
 * Hosts four circular `<NavSidebarButton>` actions:
 *   - "Scroll to top" → emits `scroll-top`
 *   - "Scroll to bottom" → emits `scroll-bottom`
 *   - "Clear conversation" → emits `clear-conversation`
 *   - "Toggle thinking display" → emits `toggle-thinking`
 *
 * The column is opaque-on-hover by default: resting opacity 0.15, hover
 * opacity 1.0. Hidden entirely when the host marks the sidepanel as
 * narrow (via `useNarrowSidepanel`, REQ-AUX-016) — on a narrow column the
 * floating sidebar would overlap the message bubbles.
 *
 * The column is presentational: the host (`AgentSidepanelRoot.vue`) owns
 * the actual scroll / store mutations and wires them to the emitted events.
 */
import { inject, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import NavSidebarButton from '@/ui/components/agent/NavSidebarButton.vue'
import { NARROW_SIDEPANEL_KEY } from '@/ui/composables/useNarrowSidepanel'

interface FloatingNavSidebarProps {
	/**
	 * Test-only override. Production callers rely on the injected
	 * `NARROW_SIDEPANEL_KEY` so a single ResizeObserver on the sidepanel
	 * root drives every layout-sensitive descendant (REQ-AUX-004).
	 */
	narrow?: boolean
}

const props = defineProps<FloatingNavSidebarProps>()

const emit = defineEmits<{
	'scroll-top': []
	'scroll-bottom': []
	'clear-conversation': []
	'toggle-thinking': []
}>()

defineOptions({ name: 'FloatingNavSidebar' })

const { t } = useI18n()

const injectedNarrow = inject(NARROW_SIDEPANEL_KEY, ref(false))

/**
 * Visibility: hidden when the host explicitly opts out (`narrow=true`) or
 * when the injected sidepanel-width observer reports narrow. The prop wins
 * so unit tests can pin a value without mounting the resize-observer host.
 */
function isHidden(): boolean {
	// `props.narrow` is the explicit test override; the injected value carries
	// the production ResizeObserver signal. Either one being true hides the
	// floating column.
	return props.narrow || injectedNarrow.value
}
</script>

<template>
	<aside
		v-if="!isHidden()"
		class="sp-floating-nav"
		data-testid="floating-nav-sidebar"
		:aria-label="t('agent.nav.ariaLabel')"
	>
		<NavSidebarButton
			icon="arrow-up-to-line"
			:ariaLabel="t('agent.nav.scrollTop')"
			data-testid="floating-nav-scroll-top"
			@click="emit('scroll-top')"
		/>
		<NavSidebarButton
			icon="arrow-down-to-line"
			:ariaLabel="t('agent.nav.scrollBottom')"
			data-testid="floating-nav-scroll-bottom"
			@click="emit('scroll-bottom')"
		/>
		<NavSidebarButton
			icon="trash-2"
			:ariaLabel="t('agent.nav.clearConversation')"
			data-testid="floating-nav-clear"
			@click="emit('clear-conversation')"
		/>
		<NavSidebarButton
			icon="brain"
			:ariaLabel="t('agent.nav.toggleThinking')"
			data-testid="floating-nav-toggle-thinking"
			@click="emit('toggle-thinking')"
		/>
	</aside>
</template>

<style scoped>
.sp-floating-nav {
	position: absolute;
	inset-block-start: var(--sp-space-4, 1rem);
	inset-inline-end: var(--sp-space-3, 0.75rem);
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-2, 0.5rem);
	z-index: 4;
	opacity: 0.15;
	transition: opacity var(--sp-duration-fast) var(--sp-ease);
	pointer-events: auto;
}

.sp-floating-nav:hover,
.sp-floating-nav:focus-within {
	opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
	.sp-floating-nav {
		transition: none;
	}
}
</style>
