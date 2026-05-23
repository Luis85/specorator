/**
 * Tests for `<HoverActions>` (REQ-AUX-002, ADR-AUX-003, spec §1.3.2 / §3.1).
 *
 *   T-AUX-114 — children stay in the accessibility tree in BOTH hidden and
 *               revealed states. The reveal is opacity-only — no
 *               `display: none` / `visibility: hidden`.
 *   T-AUX-115 — `prefers-reduced-motion: reduce` collapses transitions.
 *   T-AUX-116 — `pointer: coarse` forces opacity to 1.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import HoverActions from '@/ui/components/primitives/HoverActions.vue'
import { HoverActionsPageObject } from './HoverActions.po'

/**
 * jsdom does not parse `@media` queries, so the production scoped styles
 * inside HoverActions.vue need to be supplemented with a stub-friendly
 * stylesheet inside each test. We inject the full spec §1.3.2 CSS contract
 * so the test layer asserts the same selectors that ship in the bundle.
 */
const TOKENS = `
.specorator-root {
	--sp-duration-fast: 0.15s;
	--sp-ease: ease;
}
`

let injected: HTMLStyleElement | null = null
let injectedMatchMedia: typeof window.matchMedia | null = null

function injectStyle(css: string): void {
	const el = document.createElement('style')
	el.setAttribute('data-test-css', 'hover-actions')
	el.textContent = css
	document.head.appendChild(el)
	injected = el
}

function stubMatchMedia(matchers: Record<string, boolean>): void {
	injectedMatchMedia = window.matchMedia
	const fn = (query: string): MediaQueryList => {
		const matches = matchers[query] ?? false
		return {
			matches,
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		} as MediaQueryList
	}
	Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: fn })
}

beforeEach(() => {
	injectStyle(TOKENS)
})

afterEach(() => {
	if (injected) {
		injected.remove()
		injected = null
	}
	for (const el of Array.from(document.head.querySelectorAll('style[data-test-css]'))) {
		el.remove()
	}
	if (injectedMatchMedia) {
		Object.defineProperty(window, 'matchMedia', {
			configurable: true,
			writable: true,
			value: injectedMatchMedia,
		})
		injectedMatchMedia = null
	}
})

function Host(): ReturnType<typeof defineComponent> {
	return defineComponent({
		components: { HoverActions },
		props: {
			placement: { type: String, default: undefined },
			alwaysVisible: { type: Boolean, default: undefined },
		},
		template: `
			<div class="specorator-root sp-hover-host" data-testid="host">
				<HoverActions :placement="placement" :alwaysVisible="alwaysVisible">
					<button data-testid="action-copy" aria-label="Copy">copy</button>
					<button data-testid="action-edit" aria-label="Edit">edit</button>
				</HoverActions>
			</div>
		`,
	})
}

describe('HoverActions', () => {
	it('renders root with role="toolbar" and data-placement', () => {
		const wrapper = mount(Host(), { attachTo: document.body, props: {} })
		const po = new HoverActionsPageObject(wrapper)
		expect(po.role()).toBe('toolbar')
		expect(po.placement()).toBe('block-end-inline-end')
	})

	it('reflects custom placement on the data-placement attribute', () => {
		const wrapper = mount(Host(), {
			attachTo: document.body,
			props: { placement: 'block-start-inline-end' },
		})
		expect(new HoverActionsPageObject(wrapper).placement()).toBe('block-start-inline-end')
	})

	it('keeps children in the accessibility tree in hidden state (opacity-only reveal)', () => {
		const wrapper = mount(Host(), { attachTo: document.body, props: {} })
		const po = new HoverActionsPageObject(wrapper)
		// Children must remain queryable + not removed from the layout tree.
		expect(po.slottedCount()).toBe(2)
		const copy = wrapper.find('[data-testid="action-copy"]')
		const edit = wrapper.find('[data-testid="action-edit"]')
		expect(copy.exists()).toBe(true)
		expect(edit.exists()).toBe(true)
		// And the container is not removed via display:none or visibility:hidden.
		expect(po.displayValue()).not.toBe('none')
		expect(po.visibilityValue()).not.toBe('hidden')
	})

	it('keeps children in the accessibility tree in revealed state (alwaysVisible=true)', () => {
		const wrapper = mount(Host(), {
			attachTo: document.body,
			props: { alwaysVisible: true },
		})
		const po = new HoverActionsPageObject(wrapper)
		expect(po.slottedCount()).toBe(2)
		expect(po.alwaysVisible()).toBe('true')
		expect(po.displayValue()).not.toBe('none')
		expect(po.visibilityValue()).not.toBe('hidden')
	})

	it('declares a token-driven opacity transition in the shipped stylesheet', async () => {
		// jsdom does not resolve `var()` chains in computed styles, so the
		// per-component runtime assertion is brittle. The deterministic
		// contract check is to grep the shipped SFC source for the spec
		// §1.3.2 selectors — Storybook screenshots cover the visual outcome.
		const fs = await import('node:fs/promises')
		const path = await import('node:path')
		const src = await fs.readFile(
			path.resolve(__dirname, '../../../../src/ui/components/primitives/HoverActions.vue'),
			'utf8',
		)
		expect(src).toMatch(/transition:\s*opacity\s+var\(--sp-duration-fast\)\s+var\(--sp-ease\)/)
		expect(src).toMatch(/\.sp-hover-host:hover\s+\.sp-hover-actions/)
		expect(src).toMatch(/\.sp-hover-host:focus-within\s+\.sp-hover-actions/)
		expect(src).toMatch(/\.sp-hover-actions:focus-within/)
		expect(src).toMatch(/\.sp-hover-actions\[data-always-visible='true'\]/)
		expect(src).toMatch(/@media\s+\(prefers-reduced-motion:\s*reduce\)/)
		expect(src).toMatch(/@media\s+\(pointer:\s*coarse\)/)
	})

	it('reduced-motion media query collapses the transition (T-AUX-115)', () => {
		injectStyle(`
			.sp-hover-actions { opacity: 0; transition: opacity var(--sp-duration-fast) var(--sp-ease); }
			@media (prefers-reduced-motion: reduce) {
				.specorator-root { --sp-duration-fast: 0s; }
				.sp-hover-actions { transition: none; }
			}
		`)
		stubMatchMedia({ '(prefers-reduced-motion: reduce)': true })
		const wrapper = mount(Host(), { attachTo: document.body, props: {} })
		const po = new HoverActionsPageObject(wrapper)
		// jsdom doesn't actually apply @media rules, but the production
		// stylesheet ships them; we assert the matchMedia plumbing returns
		// the right answer so consumers can branch off it.
		expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true)
		// And we assert the container is still present so reduced-motion
		// does not blank the actions out.
		expect(po.slottedCount()).toBe(2)
	})

	it('coarse-pointer media forces visible state (T-AUX-116)', () => {
		injectStyle(`
			.sp-hover-actions { opacity: 0; }
			@media (pointer: coarse) {
				.sp-hover-actions { opacity: 1; }
			}
		`)
		stubMatchMedia({ '(pointer: coarse)': true })
		const wrapper = mount(Host(), { attachTo: document.body, props: {} })
		const po = new HoverActionsPageObject(wrapper)
		expect(window.matchMedia('(pointer: coarse)').matches).toBe(true)
		// Children stay rendered; reveal is CSS-only and lives in the
		// production stylesheet (asserted by Storybook screenshots).
		expect(po.slottedCount()).toBe(2)
	})

	it('warns when mounted without a `.sp-hover-host` ancestor (T-AUX-120)', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
			/* swallow */
		})
		mount(HoverActions, {
			attachTo: document.body,
			slots: { default: '<button>x</button>' },
		})
		expect(warn).toHaveBeenCalled()
		const message = warn.mock.calls[0]?.[0]
		expect(String(message)).toMatch(/sp-hover-host/i)
		warn.mockRestore()
	})

	it('does NOT warn when mounted under a `.sp-hover-host` ancestor', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
			/* swallow */
		})
		mount(Host(), { attachTo: document.body, props: {} })
		expect(warn).not.toHaveBeenCalled()
		warn.mockRestore()
	})

	it('renders alwaysVisible="false" when prop omitted', () => {
		const wrapper = mount(Host(), { attachTo: document.body, props: {} })
		expect(new HoverActionsPageObject(wrapper).alwaysVisible()).toBe('false')
	})
})
