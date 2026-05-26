/**
 * T-SS-024 (TEST-SS-094) — the `Result`-boundary invariant (SPEC-SS-022). Every save
 * path returns `Result`; a failed store write surfaces as `Result.err` (the caller
 * shows a `NotificationPort` notice); **no throw crosses a port** and the service
 * stays operable (REQ-SS-094, EC-SS-13). An `err` carries NO secret/env value
 * substring (NFR-SS-002, SPEC-SS-026).
 *
 * Pass-as-guard for the established Result-discipline (the EnvSnippetService composes
 * SettingsPort + SecretStorePort behind `tryAsync` + `Result`) — the invariant
 * baseline recorded for the epic gate. The MockSecretStore availability switch drives
 * the deterministic failure path without a real store.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { fakeModulePorts, type FakePorts } from '../../__fakes__/fake-ports';
import { createEnvSnippetService, type EnvSnippetService } from '@/application/settings/EnvSnippetService';
import { PROVIDER_DESCRIPTORS } from '@/domain/chat/providers';

let ports: FakePorts;
let service: EnvSnippetService;

beforeEach(() => {
	ports = fakeModulePorts();
	service = createEnvSnippetService({
		settings: ports.settings,
		secretStore: ports.secretStore,
		descriptors: PROVIDER_DESCRIPTORS,
	});
});

const SECRET = 'sk-must-not-leak-into-err';

describe('Result boundary — failed secret write (TEST-SS-094, EC-SS-13)', () => {
	it('a secret-store-unavailable create returns err with NO secret value substring', async () => {
		ports.secretStore.setSecretStoreAvailable(false);
		const result = await service.create({
			name: 'codex-key',
			scope: 'provider:codex',
			envText: `OPENAI_API_KEY=${SECRET}`,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBeInstanceOf(Error);
			expect(result.error.message).not.toContain(SECRET);
		}
	});

	it('does NOT throw across the port — the failure is a Result.err', async () => {
		ports.secretStore.setSecretStoreAvailable(false);
		await expect(
			service.applyScopeText('provider:codex', `OPENAI_API_KEY=${SECRET}`),
		).resolves.toMatchObject({ ok: false });
	});

	it('the service stays operable after a failed write (a later valid op succeeds)', async () => {
		ports.secretStore.setSecretStoreAvailable(false);
		const failed = await service.create({
			name: 'x',
			scope: 'provider:codex',
			envText: `OPENAI_API_KEY=${SECRET}`,
		});
		expect(failed.ok).toBe(false);
		// Recover availability — a non-secret save now succeeds (the tab stays usable).
		ports.secretStore.setSecretStoreAvailable(true);
		const ok = await service.create({ name: 'proxy', scope: 'shared', envText: 'FOO=bar' });
		expect(ok.ok).toBe(true);
	});
});

describe('Result boundary — every method returns a Result (no throw)', () => {
	it('list / readScope / remove resolve to a Result even on a degraded store', async () => {
		ports.secretStore.setSecretStoreAvailable(false);
		await expect(service.list()).resolves.toHaveProperty('ok');
		await expect(service.readScope('shared')).resolves.toHaveProperty('ok');
		await expect(service.remove('missing-id')).resolves.toHaveProperty('ok');
	});
});
