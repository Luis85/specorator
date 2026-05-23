/**
 * Tests for `useNarrowSidepanel` (REQ-AUX-004, spec §1.4 + WS-AUX-4 T-AUX-220/221).
 *
 * jsdom does not implement ResizeObserver; we install a deterministic stub on
 * `globalThis.ResizeObserver` that captures the callback so the test can fire
 * synthetic resize entries.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { ref, effectScope } from 'vue'
import {
	useNarrowSidepanel,
	NARROW_BREAKPOINT_PX,
} from '@/ui/composables/useNarrowSidepanel'

type Cb = ResizeObserverCallback

interface CapturedObserver {
	observed: Element[]
	disconnect(): void
	fire(width: number, target: Element): void
}

let observers: CapturedObserver[]
let realRO: typeof ResizeObserver | undefined

beforeEach(() => {
	observers = []
	realRO = globalThis.ResizeObserver
	class StubRO {
		private observed: Element[] = []
		constructor(cb: Cb) {
			const observedRef = this.observed
			const captured: CapturedObserver = {
				observed: observedRef,
				disconnect: () => {
					observedRef.length = 0
				},
				fire(width, target) {
					const entry = {
						target,
						contentRect: { width } as DOMRectReadOnly,
						contentBoxSize: [{ inlineSize: width, blockSize: 100 }],
						borderBoxSize: [{ inlineSize: width, blockSize: 100 }],
						devicePixelContentBoxSize: [],
					} as unknown as ResizeObserverEntry
					cb([entry], {} as ResizeObserver)
				},
			}
			observers.push(captured)
		}
		observe(el: Element): void {
			this.observed.push(el)
		}
		unobserve(): void {}
		disconnect(): void {
			this.observed.length = 0
		}
	}
	;(globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = StubRO
})

afterEach(() => {
	;(globalThis as unknown as { ResizeObserver: typeof ResizeObserver | undefined }).ResizeObserver =
		realRO
})

describe('useNarrowSidepanel', () => {
	it('flips `narrow` true when observed inline-size drops below 360px', async () => {
		const scope = effectScope()
		const el = document.createElement('div')
		const targetRef = ref<HTMLElement | null>(el)
		const narrowRef = scope.run(() => useNarrowSidepanel(targetRef).narrow)!
		// Allow the post-flush watcher to wire the observer.
		await Promise.resolve()
		await Promise.resolve()
		expect(observers.length).toBe(1)
		observers[0].fire(320, el)
		expect(narrowRef.value).toBe(true)
		observers[0].fire(400, el)
		expect(narrowRef.value).toBe(false)
		scope.stop()
	})

	it('exports the documented breakpoint constant', () => {
		expect(NARROW_BREAKPOINT_PX).toBe(360)
	})
})
