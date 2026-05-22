/**
 * Tests for `FloatingNavSidebar.vue` — WS-AUX-9 (T-AUX-325, T-AUX-326).
 *
 * Five tests:
 *   1. Renders four circular nav buttons.
 *   2. Each button emits the corresponding event.
 *   3. `narrow=true` hides the sidebar entirely.
 *   4. Default (no narrow injection) renders normally.
 *   5. Each button has an accessible name (REQ-AUX-018).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FloatingNavSidebar from '@/ui/components/agent/FloatingNavSidebar.vue'
import { FloatingNavSidebarPO } from './FloatingNavSidebar.po'
import { i18n } from '@/ui/i18n'
import type { LoggerPort } from '@/domain/ports'
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

function fakeLogger(): LoggerPort {
	return { debug() {}, info() {}, warn() {}, error() {} }
}

function mountSidebar(props: { narrow?: boolean } = {}) {
	const bridge = new MockBridge()
	return mount(FloatingNavSidebar, {
		global: {
			plugins: [i18n],
			provide: {
				[ICON_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: fakeLogger(),
			},
		},
		props,
		// eslint-disable-next-line obsidianmd/prefer-active-doc -- jsdom has no Obsidian popout windows.
		attachTo: document.body,
	})
}

describe('FloatingNavSidebar.vue', () => {
	it('renders four circular nav buttons', () => {
		const po = new FloatingNavSidebarPO(mountSidebar())
		expect(po.exists()).toBe(true)
		expect(po.scrollTopButton.exists()).toBe(true)
		expect(po.scrollBottomButton.exists()).toBe(true)
		expect(po.clearButton.exists()).toBe(true)
		expect(po.toggleThinkingButton.exists()).toBe(true)
	})

	it('emits scroll-top when the top button is clicked', async () => {
		const wrapper = mountSidebar()
		const po = new FloatingNavSidebarPO(wrapper)
		await po.clickScrollTop()
		expect(wrapper.emitted('scroll-top')).toBeDefined()
	})

	it('emits scroll-bottom, clear-conversation, toggle-thinking on respective clicks', async () => {
		const wrapper = mountSidebar()
		const po = new FloatingNavSidebarPO(wrapper)
		await po.clickScrollBottom()
		await po.clickClear()
		await po.clickToggleThinking()
		expect(wrapper.emitted('scroll-bottom')).toBeDefined()
		expect(wrapper.emitted('clear-conversation')).toBeDefined()
		expect(wrapper.emitted('toggle-thinking')).toBeDefined()
	})

	it('hides the sidebar when narrow=true', () => {
		const po = new FloatingNavSidebarPO(mountSidebar({ narrow: true }))
		expect(po.exists()).toBe(false)
	})

	it('renders by default (narrow=false) so the host can opt in via injection', () => {
		const po = new FloatingNavSidebarPO(mountSidebar({ narrow: false }))
		expect(po.exists()).toBe(true)
	})

	it('every button carries an accessible name', () => {
		const po = new FloatingNavSidebarPO(mountSidebar())
		for (const find of [
			po.scrollTopButton,
			po.scrollBottomButton,
			po.clearButton,
			po.toggleThinkingButton,
		]) {
			const aria = find.find('[data-testid="sp-icon-button"]').attributes('aria-label')
			expect(aria).toBeTruthy()
		}
	})
})
