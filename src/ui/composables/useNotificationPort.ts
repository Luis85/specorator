import { inject } from 'vue'
import type { NotificationPort } from '@/domain/ports'
import { NOTIFICATION_PORT } from '@/infrastructure/bridge/ports'

export function useNotificationPort(): NotificationPort {
	const port = inject(NOTIFICATION_PORT)
	if (!port) {
		throw new Error(
			'NotificationPort was not provided. Call app.provide(NOTIFICATION_PORT, port) before mounting the app.',
		)
	}
	return port
}
