import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useSettings } from '@/ui/composables/useSettings'
import { i18n, setLocale } from '@/ui/i18n'
import { NOTIFICATION_PORT, SETTINGS_PORT } from '@/infrastructure/bridge/ports'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

describe('useSettings', () => {
	it('loadSettings: sets locale on the i18n instance from persisted settings', async () => {
		setLocale('en')
		const deSettings: PluginSettings = { ...DEFAULT_SETTINGS, locale: 'de' }
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
							getSettings: () => Promise.resolve(deSettings),
							saveSettings: vi.fn(),
						},
						[NOTIFICATION_PORT as symbol]: {
							showError: vi.fn(),
							showWarning: vi.fn(),
							showSuccess: vi.fn(),
							showInfo: vi.fn(),
						},
					},
					plugins: [createPinia(), i18n],
				},
			},
		)
		await captured?.()
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((i18n.global as any).locale.value).toBe('de')
		setLocale('en')
		wrapper.unmount()
	})

	it('saveSettings: updates locale on the i18n instance', async () => {
		setLocale('en')
		let capturedSave: ((s: PluginSettings) => Promise<void>) | undefined
		const wrapper = mount(
			defineComponent({
				setup() {
					const result = useSettings()
					capturedSave = result.saveSettings
					return {}
				},
				template: '<div />',
			}),
			{
				global: {
					provide: {
						[SETTINGS_PORT as symbol]: {
							getSettings: () => Promise.resolve(DEFAULT_SETTINGS),
							saveSettings: vi.fn(),
						},
						[NOTIFICATION_PORT as symbol]: {
							showError: vi.fn(),
							showWarning: vi.fn(),
							showSuccess: vi.fn(),
							showInfo: vi.fn(),
						},
					},
					plugins: [createPinia(), i18n],
				},
			},
		)
		await capturedSave?.({ ...DEFAULT_SETTINGS, locale: 'de' })
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((i18n.global as any).locale.value).toBe('de')
		setLocale('en')
		wrapper.unmount()
	})

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
