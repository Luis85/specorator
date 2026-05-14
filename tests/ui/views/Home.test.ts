import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
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
import type { IFeatureService } from '@/application/feature/IFeatureService'
import { ok, type Result } from '@/domain/shared/Result'
import { Feature } from '@/domain/feature/Feature'
import { Slug } from '@/domain/shared/Slug'
import { FEATURE_SERVICE_KEY } from '@/ui/composables/useFeatureService'
import { HomePageObject } from './Home.po'

function makeStubFeature(id = 'f1', title = 'Stub'): Feature {
	const slugResult = Slug.create(id)
	const slug = slugResult.ok ? slugResult.value : Slug.reconstitute('stub')
	const now = new Date()
	return Feature.reconstitute({
		id,
		slug,
		title,
		status: 'active',
		currentStep: 1,
		createdAt: now,
		updatedAt: now,
	})
}

function makeStubService(overrides: Partial<IFeatureService> = {}): IFeatureService {
	return {
		loadFeatures: vi.fn(async () => ok([]) as Result<Feature[]>),
		createFeature: vi.fn(async () => ok(makeStubFeature())),
		activateFeature: vi.fn(async () => ok(makeStubFeature())),
		archiveFeature: vi.fn(async () => ok(makeStubFeature())),
		advanceFeatureStage: vi.fn(async () => ok(makeStubFeature())),
		...overrides,
	}
}

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
				[FEATURE_SERVICE_KEY as unknown as symbol]: makeStubService({
					loadFeatures: vi.fn(async () => ok([])),
				}),
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
