import { inject } from 'vue'
import type { ClaudeCliPort } from '@/domain/ports'
import { CLAUDE_CLI_PORT } from '@/infrastructure/bridge/ports'

export function useClaudeCliPort(): ClaudeCliPort {
	const port = inject(CLAUDE_CLI_PORT)
	if (!port) {
		throw new Error(
			'ClaudeCliPort was not provided. Call app.provide(CLAUDE_CLI_PORT, port) before mounting the app.',
		)
	}
	return port
}
