/**
 * Tests for `FloatingNavSidebar.vue` — WS-AUX-9 (T-AUX-325, T-AUX-326).
 *
 * G2.3 (RALPH G2): adds a fifth button — "New conversation" — at the
 * top of the column. The header band no longer owns the new-conversation
 * affordance; it lives here alongside scroll + clear + toggle-thinking.
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
	it('renders five circular nav buttons (incl. G2.3 new-conversation)', () => {
		const po = new FloatingNavSidebarPO(mountSidebar())
		expect(po.exists()).toBe(true)
		expect(po.newConversationButton.exists()).toBe(true)
		expect(po.scrollTopButton.exists()).toBe(true)
		expect(po.scrollBottomButton.exists()).toBe(true)
		expect(po.clearButton.exists()).toBe(true)
		expect(po.toggleThinkingButton.exists()).toBe(true)
	})

	it('emits new-conversation when the top button is clicked (G2.3)', async () => {
		const wrapper = mountSidebar()
		const po = new FloatingNavSidebarPO(wrapper)
		await po.clickNewConversation()
		expect(wrapper.emitted('new-conversation')).toBeDefined()
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
			po.newConversationButton,
			po.scrollTopButton,
			po.scrollBottomButton,
			po.clearButton,
			po.toggleThinkingButton,
		]) {
			const aria = find.find('[data-testid="sp-icon-button"]').attributes('aria-label')
			expect(aria).toBeTruthy()
		}
	})

	it('renders new-conversation as the first button in column order (G2.3)', () => {
		const wrapper = mountSidebar()
		const ids = ['floating-nav-new-conversation',
			'floating-nav-scroll-top',
			'floating-nav-scroll-bottom',
			'floating-nav-clear',
			'floating-nav-toggle-thinking']
		const root = wrapper.find('[data-testid="floating-nav-sidebar"]').element as HTMLElement
		const order = ids.map((id) =>
			Array.from(root.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`))[0],
		)
		// All five exist
		for (const el of order) expect(el).toBeDefined()
		// new-conversation comes first in DOM order
		expect(
			(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
		).toBe(true)
	})
})
