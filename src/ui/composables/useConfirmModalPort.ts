import { inject } from 'vue'
import type { ConfirmModalPort } from '@/domain/ports'
import { CONFIRM_MODAL_PORT } from '@/infrastructure/bridge/ports'

export function useConfirmModalPort(): ConfirmModalPort {
	const port = inject(CONFIRM_MODAL_PORT)
	if (!port) {
		throw new Error(
			'ConfirmModalPort was not provided. Call app.provide(CONFIRM_MODAL_PORT, port) before mounting the app.',
		)
	}
	return port
}
