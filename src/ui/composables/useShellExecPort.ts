import { inject } from 'vue';
import type { ShellExecPort } from '@/domain/ports';
import { SHELL_EXEC_PORT } from '@/infrastructure/bridge/ports';

/**
 * Inject the bang-bash shell-execution port (SPEC-CP-026). Mirrors the
 * `useChatRuntimePort` inject-or-throw pattern (ADR-008 one-port-per-composable;
 * no aggregate). Throws a clear "was not provided" error when the host forgot to
 * `app.provide` it.
 */
export function useShellExecPort(): ShellExecPort {
	const port = inject(SHELL_EXEC_PORT);
	if (!port) {
		throw new Error(
			'ShellExecPort was not provided. Call app.provide(SHELL_EXEC_PORT, shell) before mounting the app.',
		);
	}
	return port;
}
