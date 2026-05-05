import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createPinia } from 'pinia'
import SettingsView from '@/ui/views/SettingsView.vue'
import { i18n } from '@/ui/i18n'
import { NOTIFICATION_PORT, SETTINGS_PORT } from '@/infrastructure/bridge/ports'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import { SettingsViewPO } from './SettingsView.po'

describe('SettingsView', () => {
	it('handleSave: calls notify.showError instead of throwing when saveSettings rejects', async () => {
		const notify = {
			showError: vi.fn(),
			showWarning: vi.fn(),
			showSuccess: vi.fn(),
			showInfo: vi.fn(),
		}
		const wrapper = mount(SettingsView, {
			global: {
				provide: {
					[SETTINGS_PORT as symbol]: {
						getSettings: () => Promise.resolve({ ...DEFAULT_SETTINGS }),
						saveSettings: () => Promise.reject(new Error('write failed')),
					},
					[NOTIFICATION_PORT as symbol]: notify,
				},
				plugins: [createPinia(), i18n],
			},
		})
		await flushPromises()
		const po = new SettingsViewPO(wrapper)
		await po.clickSave()
		await flushPromises()
		expect(notify.showError).toHaveBeenCalledWith(expect.stringContaining('write failed'))
	})
})
