/**
 * T-AS-020 (RED) — `useApprovalRuleStorePort()` inject-or-throw (TEST-AS-053
 * composable leg).
 *
 * SPEC-AS-018, REQ-AS-040/042/053. Mirrors the `useToolbarCatalogPort`/`useVaultPort`
 * inject-or-throw pattern (ADR-008 one-port-per-composable, no aggregate). In
 * `ChatSurface` the port is injected OPTIONALLY (`inject(APPROVAL_RULE_STORE_PORT,
 * undefined)`) so a mount without it degrades to "no rule store — always prompt";
 * this strict composable exists for any consumer that requires it.
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useApprovalRuleStorePort } from '@/ui/composables/useApprovalRuleStorePort';
import { APPROVAL_RULE_STORE_PORT } from '@/infrastructure/bridge/ports';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { ApprovalRuleStorePort } from '@/domain/ports';

function harness(onResolved: (port: ApprovalRuleStorePort) => void) {
	return defineComponent({
		name: 'ApprovalRuleStoreHarness',
		setup() {
			onResolved(useApprovalRuleStorePort());
			return () => h('div');
		},
	});
}

describe('useApprovalRuleStorePort (SPEC-AS-018)', () => {
	it('returns the provided ApprovalRuleStorePort', () => {
		const port = new MockBridge().approvalRuleStore;
		let resolved: ApprovalRuleStorePort | null = null;
		mount(
			harness((p) => (resolved = p)),
			{ global: { provide: { [APPROVAL_RULE_STORE_PORT as symbol]: port } } },
		);
		expect(resolved).toBe(port);
	});

	it('throws a clear error when the port was not provided', () => {
		expect(() => mount(harness(() => undefined))).toThrow(
			/ApprovalRuleStorePort was not provided/,
		);
	});
});
