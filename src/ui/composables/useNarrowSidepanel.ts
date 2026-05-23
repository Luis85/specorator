/**
 * `useNarrowSidepanel` — ResizeObserver-backed composable that emits a
 * reactive `narrow` boolean when the observed element drops below 360 px
 * inline-size. Provided by `AgentSidepanelRoot.vue` to descendants via
 * `NARROW_SIDEPANEL_KEY`, so layout-sensitive children (header actions,
 * tab strip overflow, welcome surface) collapse without each owning their
 * own observer.
 *
 * Spec §1.4 + REQ-AUX-004. Tested at `tests/ui/composables/useNarrowSidepanel.test.ts`.
 */
import { onScopeDispose, ref, watch, type InjectionKey, type Ref } from 'vue'

export const NARROW_BREAKPOINT_PX = 360

/**
 * Inject key for the `narrow` ref. Descendants resolve via
 * `inject(NARROW_SIDEPANEL_KEY, ref(false))` so unit tests without a parent
 * fall back to a non-narrow default rather than throwing.
 */
export const NARROW_SIDEPANEL_KEY: InjectionKey<Ref<boolean>> = Symbol('NarrowSidepanel')

export interface UseNarrowSidepanel {
	readonly narrow: Ref<boolean>
}

/**
 * Observe `targetRef.value` (assigned via `ref` on a template root) and flip
 * `narrow` when the bounding `inlineSize` crosses `NARROW_BREAKPOINT_PX`.
 * Re-observes when the target ref reseats; tears the observer down on scope
 * dispose so SidepanelRoot unmounts clean.
 */
export function useNarrowSidepanel(
	targetRef: Ref<HTMLElement | null>,
): UseNarrowSidepanel {
	const narrow = ref(false)

	if (typeof ResizeObserver === 'undefined') {
		// Environments without ResizeObserver (older jsdom) keep the default
		// non-narrow value. The visual layout still falls back gracefully.
		return { narrow }
	}

	const observer = new ResizeObserver((entries) => {
		for (const entry of entries) {
			// `inlineSize` is the writing-mode-aware width; covers RTL too.
			// `contentBoxSize` is always present in modern UAs but older Safari
			// emits empty arrays — fall back to `contentRect.width`.
			const boxes = entry.contentBoxSize
			const size =
				boxes.length > 0 ? boxes[0].inlineSize : entry.contentRect.width
			narrow.value = size < NARROW_BREAKPOINT_PX
		}
	})

	watch(
		targetRef,
		(next, prev) => {
			if (prev) observer.unobserve(prev)
			if (next) observer.observe(next)
		},
		{ immediate: true, flush: 'post' },
	)

	onScopeDispose(() => {
		observer.disconnect()
	})

	return { narrow }
}
