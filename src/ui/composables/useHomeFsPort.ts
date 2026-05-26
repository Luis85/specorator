import { inject } from 'vue';
import type { HomeFsPort } from '@/domain/ports';
import { HOME_FS_PORT } from '@/infrastructure/bridge/ports';

/**
 * Inject the read-first beyond-vault home-fs port (SPEC-PV-019, P9). Mirrors the
 * `useVaultPort` inject-or-throw pattern (ADR-008 one-port-per-composable, no
 * aggregate, REQ-PV-112). Throws a clear "was not provided" error when the host
 * forgot to `app.provide` it.
 *
 * The Codex/Opencode history read + the consent gate read the home-fs; on Mock/LS
 * it is inert (`isAvailable() === false`). Consumers that can degrade inject the
 * key OPTIONALLY so a non-Node bridge stays usable (NFR-PV-012).
 */
export function useHomeFsPort(): HomeFsPort {
	const port = inject(HOME_FS_PORT);
	if (!port) {
		throw new Error(
			'HomeFsPort was not provided. Call app.provide(HOME_FS_PORT, port) before mounting the app.',
		);
	}
	return port;
}
