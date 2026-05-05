import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useSettings } from '@/ui/composables/useSettings'
import { i18n } from '@/ui/i18n'
import { NOTIFICATION_PORT, SETTINGS_PORT } from '@/infrastructure/bridge/ports'

describe('useSettings', () => {
	it('loadSettings: calls notify.showError instead of throwing when bridge rejects', async () => {
		const notify = {
			showError: vi.fn(),
			showWarning: vi.fn(),
			showSuccess: vi.fn(),
			showInfo: vi.fn(),
		}
		let captured: (() => Promise<void>) | undefined
		const wrapper = mount(
			defineComponent({
				setup() {
					const result = useSettings()
					captured = result.loadSettings
					return {}
				},
				template: '<div />',
			}),
			{
				global: {
					provide: {
						[SETTINGS_PORT as symbol]: {
							getSettings: () => Promise.reject(new Error('vault unavailable')),
							saveSettings: vi.fn(),
						},
						[NOTIFICATION_PORT as symbol]: notify,
					},
					plugins: [createPinia(), i18n],
				},
			},
		)
		await captured?.()
		expect(notify.showError).toHaveBeenCalledWith(expect.stringContaining('vault unavailable'))
		wrapper.unmount()
	})
})
