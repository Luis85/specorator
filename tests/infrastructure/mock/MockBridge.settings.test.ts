/**
 * T-SS-020/021 (TEST-SS-066 store-backing leg / TEST-SS-091 / TEST-SS-092 bridge
 * round-trip leg) — the Mock bridge round-trips the six additive OPTIONAL P10
 * `PluginSettings` fields through `SettingsPort`, and the in-memory
 * `SecretStorePort` backs the `env.<scope>.<KEY>` slots (the same store as
 * `provider.<id>.apiKey`, no new surface). SPEC-SS-012/014/019; REQ-SS-015/065/
 * 066/091/092; NFR-SS-001/004/007.
 *
 * The six fields are OPTIONAL + absent from DEFAULT_SETTINGS (mirroring
 * homeFsConsent), so a P9-shaped settings object stays byte-identical (NFR-SS-001).
 * A recorded value round-trips a save→reload; the env-secret slot round-trips
 * through the generic key/value store; `setSecretStoreAvailable(false)` drives the
 * unavailable gate (REQ-SS-015). No real OS secret (REQ-SS-066).
 */
import { describe, it, expect } from 'vitest';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import {
	DEFAULT_SETTINGS,
	envSecretKey,
	type PluginSettings,
} from '@/domain/settings/PluginSettings';

describe('MockBridge settings — six additive P10 fields round-trip (TEST-SS-092)', () => {
	it('a P9-shaped settings object stays byte-identical (the six fields absent, NFR-SS-001)', async () => {
		const bridge = new MockBridge();
		const settings = await bridge.getSettings();
		// The default mock settings carry no P10 field — the exact-key contract holds.
		expect('envSnippets' in settings).toBe(false);
		expect('envScopes' in settings).toBe(false);
		expect('keyboardNav' in settings).toBe(false);
		expect('providerDefaultModel' in settings).toBe(false);
		expect('defaultPermissionMode' in settings).toBe(false);
		expect('providerCliPath' in settings).toBe(false);
	});

	it('a recorded six-field value round-trips a save→getSettings (REQ-SS-092)', async () => {
		const bridge = new MockBridge();
		const saved: PluginSettings = {
			...DEFAULT_SETTINGS,
			envSnippets: [
				{
					id: 's1',
					name: 'proxy',
					description: '',
					scope: 'shared',
					envEntries: [{ key: 'HTTP_PROXY', value: { kind: 'inline', text: 'http://p' } }],
				},
			],
			envScopes: {
				shared: [{ key: 'FOO', value: { kind: 'inline', text: 'bar' } }],
				'provider:codex': [
					{ key: 'OPENAI_API_KEY', value: { kind: 'secretRef', secretRef: 'env.provider:codex.OPENAI_API_KEY' } },
				],
			},
			keyboardNav: { scrollUpKey: 'w', scrollDownKey: 's', focusInputKey: 'i' },
			providerDefaultModel: { codex: 'gpt-5' },
			defaultPermissionMode: 'plan',
			providerCliPath: { codex: '/usr/local/bin/codex' },
		};
		await bridge.saveSettings(saved);
		const after = await bridge.getSettings();
		expect(after).toEqual(saved);
		// The secretRef entry holds only the reference — never a plaintext secret.
		expect(JSON.stringify(after)).not.toContain('sk-');
	});
});

describe('MockBridge SecretStore — env.<scope>.<KEY> slots (TEST-SS-066/091)', () => {
	it('round-trips an env-secret slot through the generic key/value store', async () => {
		const bridge = new MockBridge();
		const key = envSecretKey('provider:codex', 'OPENAI_API_KEY');
		expect(key).toBe('env.provider:codex.OPENAI_API_KEY');
		await bridge.secretStore.setSecret(key, 'sk-env-secret');
		const got = await bridge.secretStore.getSecret(key);
		expect(got.ok).toBe(true);
		if (got.ok) expect(got.value).toBe('sk-env-secret');
	});

	it('the env-secret slot lives in the SAME store as provider.<id>.apiKey (no new surface, TEST-SS-091)', async () => {
		const bridge = new MockBridge();
		await bridge.secretStore.setSecret('provider.codex.apiKey', 'sk-provider');
		await bridge.secretStore.setSecret(envSecretKey('shared', 'CA_BUNDLE'), 'sk-env');
		const keys = await bridge.secretStore.listKeys();
		expect(keys.ok).toBe(true);
		if (keys.ok) {
			expect([...keys.value].sort()).toEqual([
				'env.shared.CA_BUNDLE',
				'provider.codex.apiKey',
			]);
		}
	});

	it('setSecretStoreAvailable(false) drives the unavailable gate for env slots (REQ-SS-015)', async () => {
		const bridge = new MockBridge();
		bridge.secretStore.setSecretStoreAvailable(false);
		expect(bridge.secretStore.isAvailable()).toBe(false);
		expect((await bridge.secretStore.setSecret(envSecretKey('shared', 'FOO'), 'v')).ok).toBe(false);
		expect((await bridge.secretStore.getSecret(envSecretKey('shared', 'FOO'))).ok).toBe(false);
	});
});
