/**
 * RED → green unit tests for the env-scope resolution helper the P9 runtimes
 * consume at the subprocess boundary (SPEC-SS-013, REQ-SS-065). It resolves a
 * scope's EnvEntry[] into the `Record<string,string>` the runtime merges into the
 * subprocess env: an inline entry as-is; a secretRef via SecretStorePort.getSecret
 * — and THIS is the one place a secret value is read (the resolved value never
 * enters a DTO/notice/log; it is returned only to be merged into the subprocess
 * env at the infra boundary). A `mergeScopeEnvs` helper composes
 * `{...process.env, ...shared, ...provider:<id>}` in that precedence order.
 *
 * TEST-SS-065. EC-SS-15.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { fakeModulePorts, type FakePorts } from '../../__fakes__/fake-ports';
import { resolveEnvScope, mergeScopeEnvs } from '@/application/settings/resolveEnvScope';
import { envSecretKey } from '@/domain/settings/PluginSettings';
import type { EnvEntry } from '@/domain/chat/environment/EnvSnippet';

let ports: FakePorts;

beforeEach(() => {
	ports = fakeModulePorts();
});

const inline = (key: string, text: string): EnvEntry => ({ key, value: { kind: 'inline', text } });
const ref = (key: string, secretRef: string): EnvEntry => ({ key, value: { kind: 'secretRef', secretRef } });

describe('resolveEnvScope — inline + secretRef resolution (TEST-SS-065)', () => {
	it('returns inline values verbatim', async () => {
		const result = await resolveEnvScope([inline('FOO', 'bar')], ports.secretStore);
		expect(result.ok && result.value).toEqual({ FOO: 'bar' });
	});

	it('resolves a secretRef via SecretStorePort.getSecret at the boundary', async () => {
		const key = envSecretKey('provider:codex', 'OPENAI_API_KEY');
		ports.secretStore.seedSecret(key, 'sk-secret-123');
		const result = await resolveEnvScope([ref('OPENAI_API_KEY', key)], ports.secretStore);
		expect(result.ok && result.value).toEqual({ OPENAI_API_KEY: 'sk-secret-123' });
	});

	it('omits a secretRef whose stored value is absent (no empty injection)', async () => {
		const result = await resolveEnvScope([ref('MISSING', envSecretKey('shared', 'MISSING'))], ports.secretStore);
		expect(result.ok && result.value).toEqual({});
	});

	it('errors (Result.err) when secret storage is unavailable, with no value substring', async () => {
		ports.secretStore.seedSecret(envSecretKey('shared', 'X'), 'topsecret');
		ports.secretStore.setSecretStoreAvailable(false);
		const result = await resolveEnvScope([ref('X', envSecretKey('shared', 'X'))], ports.secretStore);
		expect(result.ok).toBe(false);
		expect(!result.ok && result.error.message).not.toContain('topsecret');
	});

	it('resolves an empty entry list to an empty record', async () => {
		const result = await resolveEnvScope([], ports.secretStore);
		expect(result.ok && result.value).toEqual({});
	});
});

describe('mergeScopeEnvs — precedence {...base, ...shared, ...provider} (EC-SS-15)', () => {
	it('merges base, shared, then provider with provider winning', async () => {
		const base = { PATH: '/usr/bin', SHARED_ONLY: 'base' };
		const shared = [inline('SHARED_ONLY', 'shared-wins-over-base'), inline('FOO', 'from-shared')];
		const sk = envSecretKey('provider:codex', 'OPENAI_API_KEY');
		ports.secretStore.seedSecret(sk, 'sk-123');
		const provider = [ref('OPENAI_API_KEY', sk), inline('FOO', 'from-provider')];

		const result = await mergeScopeEnvs(base, shared, provider, ports.secretStore);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({
			PATH: '/usr/bin',
			SHARED_ONLY: 'shared-wins-over-base',
			FOO: 'from-provider',
			OPENAI_API_KEY: 'sk-123',
		});
	});

	it('propagates a resolution failure as Result.err', async () => {
		ports.secretStore.setSecretStoreAvailable(false);
		const result = await mergeScopeEnvs({}, [], [ref('X', envSecretKey('shared', 'X'))], ports.secretStore);
		expect(result.ok).toBe(false);
	});
});
