import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppRoot from '@/ui/AppRoot.vue'
import DashboardLayout from '@/ui/layouts/DashboardLayout.vue'
import { i18n } from '@/ui/i18n'
import { LOGGER_PORT, NOTIFICATION_PORT, SETTINGS_PORT } from '@/infrastructure/bridge/ports'
import { fakeModulePorts } from '../__fakes__/fake-ports'
import { AppRootPageObject } from './AppRoot.po'

async function mountAppRoot(initialPath: string) {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{
				path: '/',
				name: 'home',
				component: { template: '<div data-testid="home" />' },
				meta: { layout: DashboardLayout },
			},
			{
				path: '/features',
				name: 'features',
				component: { template: '<div data-testid="features" />' },
			},
			{
				path: '/settings',
				name: 'settings',
				component: { template: '<div />' },
			},
			{
				path: '/file/:filePath(.*)',
				name: 'file',
				component: { template: '<div />' },
			},
		],
	})
	await router.push(initialPath)
	await router.isReady()
	const ports = fakeModulePorts()
	const current = await ports.settings.getSettings()
	await ports.settings.saveSettings({ ...current, onboardingComplete: true })
	const wrapper = mount(AppRoot, {
		global: {
			plugins: [i18n, router, createPinia()],
			provide: {
				[LOGGER_PORT as unknown as symbol]: ports.logger,
				[NOTIFICATION_PORT as unknown as symbol]: ports.notifications,
				[SETTINGS_PORT as unknown as symbol]: ports.settings,
			},
		},
	})
	return { po: new AppRootPageObject(wrapper), wrapper }
}

describe('AppRoot', () => {
	it('falls back to MainLayout when route.meta.layout is absent', async () => {
		const { po } = await mountAppRoot('/features')
		await flushPromises()
		expect(po.mainLayout().exists()).toBe(true)
		expect(po.dashboardLayout().exists()).toBe(false)
	})

	it('resolves the active layout from route.meta.layout', async () => {
		const { po } = await mountAppRoot('/')
		await flushPromises()
		expect(po.dashboardLayout().exists()).toBe(true)
		expect(po.mainLayout().exists()).toBe(false)
	})

	it('swaps layouts when navigating between routes', async () => {
		const { po, wrapper } = await mountAppRoot('/')
		await flushPromises()
		expect(po.dashboardLayout().exists()).toBe(true)

		const router = wrapper.vm.$router
		await router.push('/features')
		await flushPromises()
		expect(po.mainLayout().exists()).toBe(true)
		expect(po.dashboardLayout().exists()).toBe(false)
	})
})
