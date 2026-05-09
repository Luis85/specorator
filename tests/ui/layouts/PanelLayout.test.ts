import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PanelLayout from '@/ui/layouts/PanelLayout.vue'
import { LOGGER_PORT, NOTIFICATION_PORT } from '@/infrastructure/bridge/ports'
import { fakeModulePorts } from '../../__fakes__/fake-ports'
import { PanelLayoutPageObject } from './PanelLayout.po'

function mountLayout(slots: Record<string, string> = {}) {
	const ports = fakeModulePorts()
	const wrapper = mount(PanelLayout, {
		global: {
			provide: {
				[LOGGER_PORT as unknown as symbol]: ports.logger,
				[NOTIFICATION_PORT as unknown as symbol]: ports.notifications,
			},
		},
		slots,
	})
	return new PanelLayoutPageObject(wrapper)
}

describe('PanelLayout', () => {
	it('renders without a router (no router plugin installed)', () => {
		const po = mountLayout({ default: '<p data-testid="payload">panel</p>' })
		expect(po.root.element.tagName).toBe('DIV')
		expect(po.body.find('[data-testid="payload"]').text()).toBe('panel')
	})

	it('omits header and footer when slots are empty', () => {
		const po = mountLayout({ default: '<div />' })
		expect(po.header().exists()).toBe(false)
		expect(po.footer().exists()).toBe(false)
	})

	it('renders header and footer slots when provided', () => {
		const po = mountLayout({
			default: '<div />',
			header: '<span data-testid="hdr">Chat</span>',
			footer: '<span data-testid="ftr">Synced</span>',
		})
		expect(po.header().find('[data-testid="hdr"]').text()).toBe('Chat')
		expect(po.footer().find('[data-testid="ftr"]').text()).toBe('Synced')
	})
})
