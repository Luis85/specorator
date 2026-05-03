import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import type { SettingsPort } from '@/domain/ports'
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

interface Harness {
	readonly name: string
	readonly makePort: () => SettingsPort
}

function registerSettingsContract(harness: Harness): void {
	describe(`${harness.name} SettingsPort contract`, () => {
		let port: SettingsPort

		beforeEach(() => {
			port = harness.makePort()
		})

		it('returns defensive settings copies and persists saved settings', async () => {
			const initial = await port.getSettings()
			const mutableInitial = initial as { locale: string }
			mutableInitial.locale = 'de'

			expect((await port.getSettings()).locale).toBe(DEFAULT_SETTINGS.locale)

			await port.saveSettings({ ...DEFAULT_SETTINGS, locale: 'de', specsFolder: 'plans' })
			const saved = await port.getSettings()

			expect(saved.locale).toBe('de')
			expect(saved.specsFolder).toBe('plans')

			const mutableSaved = saved as { specsFolder: string }
			mutableSaved.specsFolder = 'mutated'
			expect((await port.getSettings()).specsFolder).toBe('plans')
		})
	})
}

registerSettingsContract({
	name: 'MockBridge',
	makePort: () => new MockBridge(),
})

registerSettingsContract({
	name: 'LocalStorageBridge',
	makePort: () => {
		localStorage.clear()
		return new LocalStorageBridge()
	},
})
