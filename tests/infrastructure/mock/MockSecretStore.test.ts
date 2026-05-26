/**
 * T-PV-013/014 — the in-memory Mock `SecretStorePort` (SPEC-PV-011). The round-trip
 * (set/get/delete/listKeys), the availability gate (`setSecretStoreAvailable`), the
 * seed hook, and the no-real-OS-secret posture. The value never crosses into a
 * notice/log/DTO (NFR-PV-002).
 *
 * Traces: TEST-PV-070/072/073; SPEC-PV-006/011; REQ-PV-070..073; NFR-PV-002/007.
 */
import { describe, it, expect } from 'vitest';
import { MockSecretStore } from '@/infrastructure/mock/MockSecretStore';
import { providerSecretKey } from '@/domain/ports';

describe('MockSecretStore (TEST-PV-070/072/073)', () => {
	it('isAvailable() defaults true', () => {
		expect(new MockSecretStore().isAvailable()).toBe(true);
	});

	it('set/get round-trips the value at the boundary (TEST-PV-070)', async () => {
		const store = new MockSecretStore();
		const key = providerSecretKey('codex');
		await store.setSecret(key, 'sk-secret-123');
		const got = await store.getSecret(key);
		expect(got.ok).toBe(true);
		if (got.ok) expect(got.value).toBe('sk-secret-123');
	});

	it('getSecret of an absent key → ok(null)', async () => {
		const got = await new MockSecretStore().getSecret('provider.codex.apiKey');
		expect(got.ok).toBe(true);
		if (got.ok) expect(got.value).toBeNull();
	});

	it('deleteSecret is idempotent → ok() (TEST-PV-070)', async () => {
		const store = new MockSecretStore();
		const missing = await store.deleteSecret('nope');
		expect(missing.ok).toBe(true);
		await store.setSecret('provider.codex.apiKey', 'v');
		await store.deleteSecret('provider.codex.apiKey');
		const got = await store.getSecret('provider.codex.apiKey');
		if (got.ok) expect(got.value).toBeNull();
	});

	it('listKeys returns keys, never values (TEST-PV-070)', async () => {
		const store = new MockSecretStore();
		store.seedSecret('provider.codex.apiKey', 'value-a');
		store.seedSecret('provider.opencode.apiKey', 'value-b');
		const keys = await store.listKeys();
		expect(keys.ok).toBe(true);
		if (keys.ok) {
			expect([...keys.value].sort()).toEqual([
				'provider.codex.apiKey',
				'provider.opencode.apiKey',
			]);
			// no value leaks into the key list.
			expect(keys.value.join(' ')).not.toContain('value-a');
		}
	});

	it('setSecretStoreAvailable(false) forces the unavailable gate → err (TEST-PV-072)', async () => {
		const store = new MockSecretStore();
		store.setSecretStoreAvailable(false);
		expect(store.isAvailable()).toBe(false);
		expect((await store.setSecret('k', 'v')).ok).toBe(false);
		expect((await store.getSecret('k')).ok).toBe(false);
		expect((await store.listKeys()).ok).toBe(false);
	});

	it('getStoredKeys exposes seeded keys for assertion (no real OS secret, TEST-PV-073)', () => {
		const store = new MockSecretStore();
		store.seedSecret('provider.codex.apiKey', 'x');
		expect(store.getStoredKeys()).toEqual(['provider.codex.apiKey']);
	});
});
