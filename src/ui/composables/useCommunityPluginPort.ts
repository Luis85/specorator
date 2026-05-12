import { inject } from 'vue'
import type { CommunityPluginPort } from '@/domain/ports'
import { COMMUNITY_PLUGIN_PORT } from '@/infrastructure/bridge/ports'

export function useCommunityPluginPort(): CommunityPluginPort {
	const port = inject(COMMUNITY_PLUGIN_PORT)
	if (!port) {
		throw new Error(
			'CommunityPluginPort was not provided. Call app.provide(COMMUNITY_PLUGIN_PORT, port) before mounting the app.',
		)
	}
	return port
}
