import { inject } from 'vue'
import type { LoggerPort } from '@/domain/ports'
import { LOGGER_PORT } from '@/infrastructure/bridge/ports'

export function useLoggerPort(): LoggerPort {
	const port = inject(LOGGER_PORT)
	if (!port) {
		throw new Error(
			'LoggerPort was not provided. Call app.provide(LOGGER_PORT, port) before mounting the app.',
		)
	}
	return port
}
