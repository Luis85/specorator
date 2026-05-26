import { inject } from 'vue';
import type { ApprovalRuleStorePort } from '@/domain/ports';
import { APPROVAL_RULE_STORE_PORT } from '@/infrastructure/bridge/ports';

/**
 * Inject the approval-rule store port (SPEC-AS-018, P7). Mirrors the
 * `useToolbarCatalogPort`/`useVaultPort` inject-or-throw pattern (ADR-008
 * one-port-per-composable, no aggregate). Throws a clear "was not provided"
 * error when the host forgot to `app.provide` it.
 *
 * `ChatSurface` injects the key OPTIONALLY (`inject(APPROVAL_RULE_STORE_PORT,
 * undefined)`) so a mount without it degrades to "no rule store — always
 * prompt" (the byte-identical P4 path); this strict composable exists for any
 * consumer that requires the port.
 */
export function useApprovalRuleStorePort(): ApprovalRuleStorePort {
	const port = inject(APPROVAL_RULE_STORE_PORT);
	if (!port) {
		throw new Error(
			'ApprovalRuleStorePort was not provided. Call app.provide(APPROVAL_RULE_STORE_PORT, port) before mounting the app.',
		);
	}
	return port;
}
