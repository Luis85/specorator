/**
 * Tests for `NavSidebarButton.vue` (WS-AUX-9, T-AUX-328).
 *
 * Three tests:
 *   1. Renders a circular wrapper around an SpIconButton.
 *   2. Forwards `click` events to the host.
 *   3. Passes `ariaLabel` through to the inner button.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NavSidebarButton from '@/ui/components/agent/NavSidebarButton.vue'
import { NavSidebarButtonPO } from './NavSidebarButton.po'
import type { LoggerPort } from '@/domain/ports'
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

function fakeLogger(): LoggerPort {
	return { debug() {}, info() {}, warn() {}, error() {} }
}

function mountButton(props: { icon: string; ariaLabel: string; disabled?: boolean }) {
	const bridge = new MockBridge()
	return mount(NavSidebarButton, {
		props,
		global: {
			provide: {
				[ICON_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: fakeLogger(),
			},
		},
		 
		attachTo: document.body,
	})
}

describe('NavSidebarButton.vue', () => {
	it('renders a circular wrapper around an SpIconButton', () => {
		const po = new NavSidebarButtonPO(
			mountButton({ icon: 'trash-2', ariaLabel: 'Clear' }),
		)
		expect(po.root.exists()).toBe(true)
		expect(po.button.exists()).toBe(true)
	})

	it('forwards click events to the host', async () => {
		const wrapper = mountButton({ icon: 'arrow-up-to-line', ariaLabel: 'Top' })
		const po = new NavSidebarButtonPO(wrapper)
		await po.click()
		expect(wrapper.emitted('click')).toBeDefined()
	})

	it('passes ariaLabel through to the inner button', () => {
		const po = new NavSidebarButtonPO(
			mountButton({ icon: 'trash-2', ariaLabel: 'Clear conversation' }),
		)
		expect(po.button.attributes('aria-label')).toBe('Clear conversation')
	})
})
