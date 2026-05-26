/**
 * T-SS-022/023 (TEST-SS-065 merge leg) — the env→subprocess merge a provider
 * runtime performs at turn start (SPEC-SS-013, REQ-SS-065, EC-SS-15). The real
 * injection lives in the coverage-excluded `src/infrastructure/obsidian/**`
 * runtimes (manual leg TEST-SS-M2); this automated leg drives the same composition
 * through the scriptable `MockProviderEnvCapture` over a settings-shaped `envScopes`
 * record + an in-memory `SecretStorePort`.
 *
 * At turn start the active provider's runtime composes
 * `{ ...process.env, ...resolve(envScopes['shared']), ...resolve(envScopes['provider:<id>']) }`
 * where `resolve` reads an `{kind:'inline'}` entry as-is and an `{kind:'secretRef'}`
 * entry via `SecretStorePort.getSecret(secretRef)` AT THE INFRA BOUNDARY ONLY — the
 * resolved value reaches the captured subprocess env, never a DTO/notice/log
 * (NFR-SS-002).
 */
import { describe, it, expect } from 'vitest';
import { MockProviderEnvCapture } from '@/infrastructure/mock/MockProviderRuntime';
import { MockSecretStore } from '@/infrastructure/mock/MockSecretStore';
import { envSecretKey, type PluginSettings, DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings';
import type { ProviderId } from '@/domain/ports';
import type { EnvEntry } from '@/domain/chat/environment/EnvSnippet';

/** Model a runtime's turn-start composition over a settings-shaped envScopes record. */
async function runtimeCaptureEnv(
	capture: MockProviderEnvCapture,
	base: Readonly<Record<string, string>>,
	settings: PluginSettings,
	providerId: ProviderId,
	secretStore: MockSecretStore,
): Promise<Readonly<Record<string, string>> | null> {
	// A scope key may be absent at runtime — type it as possibly-undefined-valued so
	// the load-or-default `?? []` is honest (mirrors `buildScopeEnv` in the runtime).
	const scopes: Readonly<Record<string, readonly EnvEntry[] | undefined>> = settings.envScopes ?? {};
	const shared = scopes.shared ?? [];
	const provider = scopes[`provider:${providerId}`] ?? [];
	const result = await capture.captureEnv(base, shared, provider, secretStore);
	return result.ok ? result.value : null;
}

describe('provider-runtime env merge over MockProviderEnvCapture (TEST-SS-065, EC-SS-15)', () => {
	it('merges { ...base, ...shared, ...provider:<id> } at turn start; FOO=bar reaches the subprocess env', async () => {
		const secretStore = new MockSecretStore();
		const settings: PluginSettings = {
			...DEFAULT_SETTINGS,
			enabledProviders: ['codex'],
			envScopes: {
				shared: [{ key: 'FOO', value: { kind: 'inline', text: 'bar' } }],
				'provider:codex': [{ key: 'CODEX_REGION', value: { kind: 'inline', text: 'eu' } }],
			},
		};
		const env = await runtimeCaptureEnv(
			new MockProviderEnvCapture(),
			{ PATH: '/bin' },
			settings,
			'codex',
			secretStore,
		);
		expect(env).toEqual({ PATH: '/bin', FOO: 'bar', CODEX_REGION: 'eu' });
	});

	it('resolves a secretRef via getSecret at the boundary; the value reaches only the env', async () => {
		const secretStore = new MockSecretStore();
		const ref = envSecretKey('provider:codex', 'OPENAI_API_KEY');
		secretStore.seedSecret(ref, 'sk-resolved-only-here');
		const settings: PluginSettings = {
			...DEFAULT_SETTINGS,
			enabledProviders: ['codex'],
			envScopes: {
				'provider:codex': [
					{ key: 'OPENAI_API_KEY', value: { kind: 'secretRef', secretRef: ref } },
				],
			},
		};
		const capture = new MockProviderEnvCapture();
		const env = await runtimeCaptureEnv(capture, {}, settings, 'codex', secretStore);
		expect(env).toEqual({ OPENAI_API_KEY: 'sk-resolved-only-here' });
		// The settings record never carries the resolved value (only a secretRef).
		expect(JSON.stringify(settings)).not.toContain('sk-resolved-only-here');
	});

	it('a provider scope value overrides a shared value which overrides the base (precedence order)', async () => {
		const secretStore = new MockSecretStore();
		const settings: PluginSettings = {
			...DEFAULT_SETTINGS,
			envScopes: {
				shared: [{ key: 'TIER', value: { kind: 'inline', text: 'shared' } }],
				'provider:codex': [{ key: 'TIER', value: { kind: 'inline', text: 'provider' } }],
			},
		};
		const env = await runtimeCaptureEnv(
			new MockProviderEnvCapture(),
			{ TIER: 'base' },
			settings,
			'codex',
			secretStore,
		);
		expect(env?.TIER).toBe('provider');
	});

	it('an absent envScopes leaves the base env untouched (no empty injection)', async () => {
		const secretStore = new MockSecretStore();
		const env = await runtimeCaptureEnv(
			new MockProviderEnvCapture(),
			{ PATH: '/bin' },
			{ ...DEFAULT_SETTINGS },
			'claude',
			secretStore,
		);
		expect(env).toEqual({ PATH: '/bin' });
	});
});
