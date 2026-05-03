import { inject } from 'vue'
import type { VaultPort } from '@/domain/ports'
import { VAULT_PORT } from '@/infrastructure/bridge/ports'

export function useVaultPort(): VaultPort {
	const port = inject(VAULT_PORT)
	if (!port) {
		throw new Error(
			'VaultPort was not provided. Call app.provide(VAULT_PORT, port) before mounting the app.',
		)
	}
	return port
}
