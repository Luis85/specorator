import { inject } from 'vue'
import type { WorkspacePort } from '@/domain/ports'
import { WORKSPACE_PORT } from '@/infrastructure/bridge/ports'

export function useWorkspacePort(): WorkspacePort {
	const port = inject(WORKSPACE_PORT)
	if (!port) {
		throw new Error(
			'WorkspacePort was not provided. Call app.provide(WORKSPACE_PORT, port) before mounting the app.',
		)
	}
	return port
}
