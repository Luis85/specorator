import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import OnboardingStep5Done from '@/ui/components/OnboardingStep5Done.vue'
import { SETTINGS_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports'
import { OnboardingStep5DonePO } from './OnboardingStep5Done.po'
import type { SettingsPort, LoggerPort } from '@/domain/ports'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

const mockLogger: LoggerPort = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function makeMockSettingsPort(overrides: Partial<SettingsPort> = {}): SettingsPort {
	return {
		getSettings: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS }),
		saveSettings: vi.fn().mockResolvedValue(undefined),
		...overrides,
	}
}

describe('OnboardingStep5Done', () => {
	function mountComponent(
		props: { personaSkipped: boolean; claudeStatus: 'ready' | 'not-ready' | 'unknown'; templateStatus: 'installed' | 'skipped' | 'failed' } = { personaSkipped: false, claudeStatus: 'ready', templateStatus: 'installed' },
		settingsOverrides: Partial<SettingsPort> = {},
	) {
		const port = makeMockSettingsPort(settingsOverrides)
		const wrapper = mount(OnboardingStep5Done, {
			props,
			global: {
				provide: {
					[SETTINGS_PORT as symbol]: port,
					[LOGGER_PORT as symbol]: mockLogger,
				},
			},
		})
		return { wrapper, po: new OnboardingStep5DonePO(wrapper), port }
	}

	beforeEach(() => { vi.clearAllMocks() })

	it('saves onboardingComplete:true on mount', async () => {
		const { port } = mountComponent()
		await flushPromises()
		expect(port.saveSettings).toHaveBeenCalledWith(
			expect.objectContaining({ onboardingComplete: true }),
		)
	})

	it('emits finish when CTA clicked', async () => {
		const { wrapper, po } = mountComponent()
		await flushPromises()
		await po.clickCta()
		expect(wrapper.emitted('finish')).toHaveLength(1)
	})

	it('shows save error when settings save fails', async () => {
		const { po } = mountComponent(
			{ personaSkipped: false, claudeStatus: 'ready', templateStatus: 'installed' },
			{ saveSettings: vi.fn().mockRejectedValue(new Error('fail')) },
		)
		await flushPromises()
		expect(po.saveError.exists()).toBe(true)
	})

	it('shows "Not added yet" for persona when skipped', async () => {
		const { po } = mountComponent({ personaSkipped: true, claudeStatus: 'ready', templateStatus: 'installed' })
		await flushPromises()
		expect(po.summaryPersona.text()).toContain('Not added yet')
	})

	it('shows "Not ready" for claude when not-ready', async () => {
		const { po } = mountComponent({ personaSkipped: false, claudeStatus: 'not-ready', templateStatus: 'installed' })
		await flushPromises()
		expect(po.summaryClaude.text()).toContain('Not ready')
	})
})
