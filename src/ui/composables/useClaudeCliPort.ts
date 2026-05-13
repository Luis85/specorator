import { inject } from 'vue'
import type { ClaudeCliPort } from '@/domain/ports'
import { CLAUDE_CLI_PORT } from '@/infrastructure/bridge/ports'

export function useClaudeCliPort(): ClaudeCliPort | undefined {
	return inject(CLAUDE_CLI_PORT)
}
