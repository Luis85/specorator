import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import HomeView from '@/ui/views/HomeView.vue'
import { i18n } from '@/ui/i18n'
import { fakeModulePorts } from '../../__fakes__/fake-ports'
import {
	SETTINGS_PORT,
	VAULT_PORT,
	WORKSPACE_PORT,
	NOTIFICATION_PORT,
} from '@/infrastructure/bridge/ports'
import { HomePageObject } from './Home.po'

function mountHome() {
	const ports = fakeModulePorts()
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/', name: 'home', component: { template: '<div />' } },
			{ path: '/features', name: 'features', component: { template: '<div />' } },
		],
	})
	const wrapper = mount(HomeView, {
		global: {
			plugins: [i18n, router, createPinia()],
			provide: {
				[SETTINGS_PORT as unknown as symbol]: ports.settings,
				[VAULT_PORT as unknown as symbol]: ports.vault,
				[WORKSPACE_PORT as unknown as symbol]: ports.workspace,
				[NOTIFICATION_PORT as unknown as symbol]: ports.notifications,
			},
		},
	})
	return { po: new HomePageObject(wrapper), ports }
}

describe('HomeView', () => {
	it('renders the title and create button', async () => {
		const { po } = mountHome()
		await flushPromises()
		expect(po.title.text().length).toBeGreaterThan(0)
		expect(po.createButton.text().length).toBeGreaterThan(0)
	})

	it('toggles the create form when the create button is clicked', async () => {
		const { po } = mountHome()
		await flushPromises()
		expect(po.isCreateFormVisible()).toBe(false)
		await po.clickCreate()
		await flushPromises()
		expect(po.isCreateFormVisible()).toBe(true)
	})
})
