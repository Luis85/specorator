import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestingPinia } from '@pinia/testing'
import OnboardingStep2Persona from '@/ui/components/OnboardingStep2Persona.vue'
import { SETTINGS_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports'
import { OnboardingStep2PersonaPO } from './OnboardingStep2Persona.po'
import type { SettingsPort } from '@/domain/ports'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

function makeMockSettingsPort(overrides: Partial<SettingsPort> = {}): SettingsPort {
	return {
		getSettings: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS }),
		saveSettings: vi.fn().mockResolvedValue(undefined),
		...overrides,
	}
}

const mockLogger = {
	debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
}

describe('OnboardingStep2Persona', () => {
	function mountComponent(initialValue = '', settingsPort?: Partial<SettingsPort>) {
		const port = makeMockSettingsPort(settingsPort)
		const wrapper = mount(OnboardingStep2Persona, {
			props: { initialValue },
			global: {
				plugins: [createTestingPinia()],
				provide: {
					[SETTINGS_PORT as symbol]: port,
					[LOGGER_PORT as symbol]: mockLogger,
				},
			},
		})
		return { wrapper, po: new OnboardingStep2PersonaPO(wrapper), port }
	}

	beforeEach(() => { vi.clearAllMocks() })

	it('renders textarea with initialValue', () => {
		const { po } = mountComponent('hello')
		expect((po.textarea.element as HTMLTextAreaElement).value).toBe('hello')
	})

	it('skip emits next with skipped:true and does not save', async () => {
		const { wrapper, po, port } = mountComponent()
		await po.clickSkip()
		expect(wrapper.emitted('next')?.[0]).toEqual([{ skipped: true }])
		expect(port.saveSettings).not.toHaveBeenCalled()
	})

	it('continue saves persona and emits next with skipped:false', async () => {
		const { wrapper, po, port } = mountComponent()
		await po.typePersona('I am a PM.')
		await po.clickContinue()
		await wrapper.vm.$nextTick()
		expect(port.saveSettings).toHaveBeenCalled()
		expect(wrapper.emitted('next')?.[0]).toEqual([{ skipped: false }])
	})

	it('shows error message when save fails', async () => {
		const { wrapper, po } = mountComponent('', {
			saveSettings: vi.fn().mockRejectedValue(new Error('disk full')),
		})
		await po.clickContinue()
		await wrapper.vm.$nextTick()
		expect(po.saveError.exists()).toBe(true)
		expect(wrapper.emitted('next')).toBeUndefined()
	})
})
