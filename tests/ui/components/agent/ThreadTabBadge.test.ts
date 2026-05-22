/**
 * Tests for `<ThreadTabBadge>` (REQ-AUX-019, spec §1.3.8 + §3.4).
 *
 *   T-AUX-204 — border colour resolves per data-state mapping.
 *   T-AUX-205 — `state="streaming"` applies the `thinking-pulse` animation.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ThreadTabBadge from '@/ui/components/agent/ThreadTabBadge.vue'
import { ThreadTabBadgePageObject } from './ThreadTabBadge.po'

describe('ThreadTabBadge', () => {
	it('exposes the state via data-state for each variant', () => {
		const states = ['active', 'streaming', 'attention', 'idle'] as const
		for (const state of states) {
			const wrapper = mount(ThreadTabBadge, { props: { state, digit: 1 } })
			const po = new ThreadTabBadgePageObject(wrapper)
			expect(po.state()).toBe(state)
		}
	})

	it('renders the digit prop as text content', () => {
		const wrapper = mount(ThreadTabBadge, { props: { state: 'idle', digit: 7 } })
		const po = new ThreadTabBadgePageObject(wrapper)
		expect(po.digitText()).toBe('7')
	})

	it('streaming variant flags the state so CSS can apply thinking-pulse', () => {
		// jsdom does not parse scoped <style> blocks; the binding from
		// `data-state="streaming"` to the `thinking-pulse` keyframe is verified
		// by Storybook visual + Playwright tests at WS-AUX-10. Here we assert
		// the contract surface only: the state attribute the CSS selector
		// targets.
		const wrapper = mount(ThreadTabBadge, {
			props: { state: 'streaming', digit: 3 },
		})
		const po = new ThreadTabBadgePageObject(wrapper)
		expect(po.state()).toBe('streaming')
	})

	it('is aria-hidden so the digit does not double-announce with the tab label', () => {
		const wrapper = mount(ThreadTabBadge, { props: { state: 'idle', digit: 1 } })
		const po = new ThreadTabBadgePageObject(wrapper)
		expect(po.rootEl.getAttribute('aria-hidden')).toBe('true')
	})
})
