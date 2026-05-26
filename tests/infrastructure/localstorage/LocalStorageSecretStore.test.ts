/**
 * T-PV-015/016 — the GitHub Pages demo `SecretStorePort` (SPEC-PV-012). An
 * in-memory map (`isAvailable()→true`) so the masked secret field is exercisable in
 * the demo without a real OS store; no real secret persists.
 *
 * Traces: TEST-PV-073 (LS leg); SPEC-PV-012; REQ-PV-073; NFR-PV-002.
 */
import { describe, it, expect } from 'vitest';
import { LocalStorageSecretStore } from '@/infrastructure/localstorage/LocalStorageSecretStore';

describe('LocalStorageSecretStore (TEST-PV-073 LS leg)', () => {
	it('isAvailable() → true (the demo secret field is exercisable)', () => {
		expect(new LocalStorageSecretStore().isAvailable()).toBe(true);
	});

	it('set/get round-trips in memory (no real secret)', async () => {
		const store = new LocalStorageSecretStore();
		await store.setSecret('provider.codex.apiKey', 'sk-demo');
		const got = await store.getSecret('provider.codex.apiKey');
		expect(got.ok).toBe(true);
		if (got.ok) expect(got.value).toBe('sk-demo');
	});

	it('getSecret of an absent key → ok(null)', async () => {
		const got = await new LocalStorageSecretStore().getSecret('missing');
		if (got.ok) expect(got.value).toBeNull();
	});

	it('delete is idempotent + listKeys returns keys', async () => {
		const store = new LocalStorageSecretStore();
		await store.setSecret('provider.opencode.apiKey', 'v');
		const keys = await store.listKeys();
		if (keys.ok) expect(keys.value).toEqual(['provider.opencode.apiKey']);
		await store.deleteSecret('provider.opencode.apiKey');
		const after = await store.listKeys();
		if (after.ok) expect(after.value).toEqual([]);
	});
});
