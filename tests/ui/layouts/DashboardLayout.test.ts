import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DashboardLayout from '@/ui/layouts/DashboardLayout.vue'
import { LOGGER_PORT, NOTIFICATION_PORT } from '@/infrastructure/bridge/ports'
import { fakeModulePorts } from '../../__fakes__/fake-ports'
import { DashboardLayoutPageObject } from './DashboardLayout.po'

function mountLayout(slots: Record<string, string> = {}) {
	const ports = fakeModulePorts()
	const wrapper = mount(DashboardLayout, {
		global: {
			provide: {
				[LOGGER_PORT as unknown as symbol]: ports.logger,
				[NOTIFICATION_PORT as unknown as symbol]: ports.notifications,
			},
		},
		slots,
	})
	return new DashboardLayoutPageObject(wrapper)
}

describe('DashboardLayout', () => {
	it('renders root and default body', () => {
		const po = mountLayout({ default: '<div data-testid="kpi">42</div>' })
		expect(po.root.element.tagName).toBe('DIV')
		expect(po.body.find('[data-testid="kpi"]').text()).toBe('42')
	})

	it('omits header and footer when slots are empty', () => {
		const po = mountLayout({ default: '<div />' })
		expect(po.header().exists()).toBe(false)
		expect(po.footer().exists()).toBe(false)
	})

	it('renders header and footer slots when provided', () => {
		const po = mountLayout({
			default: '<div />',
			header: '<h1 data-testid="hdr">Overview</h1>',
			footer: '<small data-testid="ftr">Updated</small>',
		})
		expect(po.header().find('[data-testid="hdr"]').text()).toBe('Overview')
		expect(po.footer().find('[data-testid="ftr"]').text()).toBe('Updated')
	})
})
