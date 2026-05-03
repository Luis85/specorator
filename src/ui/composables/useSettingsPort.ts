import { inject } from 'vue'
import type { SettingsPort } from '@/domain/ports'
import { SETTINGS_PORT } from '@/infrastructure/bridge/ports'

export function useSettingsPort(): SettingsPort {
	const port = inject(SETTINGS_PORT)
	if (!port) {
		throw new Error(
			'SettingsPort was not provided. Call app.provide(SETTINGS_PORT, port) before mounting the app.',
		)
	}
	return port
}
