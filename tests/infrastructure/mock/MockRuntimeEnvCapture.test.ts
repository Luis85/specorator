/**
 * T-SS-020/021 (TEST-SS-065 capture leg) — the Mock runtime env-capture hook
 * records the merged subprocess env a provider runtime would spawn with, so the
 * env-injection leg runs WITHOUT a real subprocess (SPEC-SS-013, REQ-SS-065).
 *
 * The hook composes `{ ...base, ...resolve(shared), ...resolve(provider:<id>) }`
 * via the application `mergeScopeEnvs` — an inline entry as-is, a secretRef via
 * `SecretStorePort.getSecret(ref)` at the boundary. The resolved value reaches the
 * captured env only; it never enters a DTO/notice/log (NFR-SS-002). Total — the
 * capture returns `Result`, never throws.
 */
import { describe, it, expect } from 'vitest';
import { MockProviderEnvCapture } from '@/infrastructure/mock/MockProviderRuntime';
import { MockSecretStore } from '@/infrastructure/mock/MockSecretStore';
import { envSecretKey } from '@/domain/settings/PluginSettings';
import type { EnvEntry } from '@/domain/chat/environment/EnvSnippet';

describe('MockProviderEnvCapture (TEST-SS-065)', () => {
	it('captures the merged subprocess env: inline as-is + secretRef resolved at the boundary', async () => {
		const secretStore = new MockSecretStore();
		const ref = envSecretKey('provider:codex', 'OPENAI_API_KEY');
		secretStore.seedSecret(ref, 'sk-secret-xyz');

		const capture = new MockProviderEnvCapture();
		const shared: readonly EnvEntry[] = [{ key: 'FOO', value: { kind: 'inline', text: 'bar' } }];
		const provider: readonly EnvEntry[] = [
			{ key: 'OPENAI_API_KEY', value: { kind: 'secretRef', secretRef: ref } },
		];

		const result = await capture.captureEnv(
			{ PATH: '/usr/bin' },
			shared,
			provider,
			secretStore,
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toEqual({
				PATH: '/usr/bin',
				FOO: 'bar',
				OPENAI_API_KEY: 'sk-secret-xyz',
			});
		}
		// The captured env is recorded for assertion.
		expect(capture.lastEnv).toEqual({
			PATH: '/usr/bin',
			FOO: 'bar',
			OPENAI_API_KEY: 'sk-secret-xyz',
		});
	});

	it('a provider-scoped value overrides a shared value which overrides the base', async () => {
		const secretStore = new MockSecretStore();
		const capture = new MockProviderEnvCapture();
		const result = await capture.captureEnv(
			{ K: 'base' },
			[{ key: 'K', value: { kind: 'inline', text: 'shared' } }],
			[{ key: 'K', value: { kind: 'inline', text: 'provider' } }],
			secretStore,
		);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.K).toBe('provider');
	});

	it('a store-read failure short-circuits to err with no secret value substring (NFR-SS-002)', async () => {
		const secretStore = new MockSecretStore();
		secretStore.seedSecret(envSecretKey('shared', 'TOKEN'), 'sk-leak');
		secretStore.setSecretStoreAvailable(false);
		const capture = new MockProviderEnvCapture();
		const result = await capture.captureEnv(
			{},
			[{ key: 'TOKEN', value: { kind: 'secretRef', secretRef: envSecretKey('shared', 'TOKEN') } }],
			[],
			secretStore,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.message).not.toContain('sk-leak');
		// Nothing recorded on a failed resolution.
		expect(capture.lastEnv).toBeNull();
	});
});
