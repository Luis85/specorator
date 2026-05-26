/**
 * T-PV-025 (RED) — `useSecretStorePort()` inject-or-throw (TEST-PV-112 composable
 * leg).
 *
 * SPEC-PV-019, REQ-PV-112. Mirrors the `useVaultPort` inject-or-throw pattern
 * (ADR-008 one-port-per-composable, no aggregate). Returns the injected
 * `SECRET_STORE_PORT` when provided; throws a clear "was not provided" error
 * otherwise.
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useSecretStorePort } from '@/ui/composables/useSecretStorePort';
import { SECRET_STORE_PORT } from '@/infrastructure/bridge/ports';
import { MockSecretStore } from '@/infrastructure/mock/MockSecretStore';
import type { SecretStorePort } from '@/domain/ports';

function harness(onResolved: (port: SecretStorePort) => void) {
	return defineComponent({
		name: 'SecretStoreHarness',
		setup() {
			onResolved(useSecretStorePort());
			return () => h('div');
		},
	});
}

describe('useSecretStorePort (SPEC-PV-019)', () => {
	it('returns the provided SecretStorePort', () => {
		const port = new MockSecretStore();
		let resolved: SecretStorePort | null = null;
		mount(
			harness((p) => (resolved = p)),
			{ global: { provide: { [SECRET_STORE_PORT as symbol]: port } } },
		);
		expect(resolved).toBe(port);
	});

	it('throws a clear error when the port was not provided', () => {
		expect(() => mount(harness(() => undefined))).toThrow(/SecretStorePort was not provided/);
	});
});
