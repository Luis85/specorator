import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import MainLayout from '@/ui/layouts/MainLayout.vue'
import { i18n } from '@/ui/i18n'
import { LOGGER_PORT, NOTIFICATION_PORT } from '@/infrastructure/bridge/ports'
import { fakeModulePorts } from '../../__fakes__/fake-ports'
import { MainLayoutPageObject } from './MainLayout.po'

function mountLayout(slots: Record<string, string> = {}) {
	const ports = fakeModulePorts()
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/', name: 'home', component: { template: '<div />' } },
			{ path: '/features', name: 'features', component: { template: '<div />' } },
			{ path: '/settings', name: 'settings', component: { template: '<div />' } },
		],
	})
	const wrapper = mount(MainLayout, {
		global: {
			plugins: [i18n, router],
			provide: {
				[LOGGER_PORT as unknown as symbol]: ports.logger,
				[NOTIFICATION_PORT as unknown as symbol]: ports.notifications,
			},
		},
		slots,
	})
	return new MainLayoutPageObject(wrapper)
}

describe('MainLayout', () => {
	it('renders root and default body', () => {
		const po = mountLayout({ default: '<p data-testid="payload">body</p>' })
		expect(po.root.element.tagName).toBe('DIV')
		expect(po.body.find('[data-testid="payload"]').text()).toBe('body')
	})

	it('hides header when slot is empty', () => {
		const po = mountLayout({ default: '<div />' })
		expect(po.header().exists()).toBe(false)
	})

	it('renders header slot when provided', () => {
		const po = mountLayout({
			default: '<div />',
			header: '<h1 data-testid="hdr">Title</h1>',
		})
		expect(po.header().exists()).toBe(true)
		expect(po.header().find('[data-testid="hdr"]').text()).toBe('Title')
	})

	it('hides footer when slot is empty', () => {
		const po = mountLayout({ default: '<div />' })
		expect(po.footer().exists()).toBe(false)
	})

	it('renders footer slot when provided', () => {
		const po = mountLayout({
			default: '<div />',
			footer: '<small data-testid="ftr">Footer</small>',
		})
		expect(po.footer().exists()).toBe(true)
		expect(po.footer().find('[data-testid="ftr"]').text()).toBe('Footer')
	})

	it('renders the top nav links', () => {
		const po = mountLayout({ default: '<div />' })
		expect(po.root.findAll('a').length).toBe(4) // Home + Features + Chat + Settings
	})
})
