/**
 * T-SS-024 (TEST-SS-014/090/091) — the no-secret-leak + correct-store invariants
 * (SPEC-SS-019). Holds at the gate as the counter-metric: across EVERY key + snippet
 * + scope save flow, ZERO secret bytes appear in the device-local `SettingsPort`
 * blob / `data.json` (TEST-SS-090); each setting lands in its correct store —
 * secrets (provider key `provider.<id>.apiKey` + env `env.<scope>.<KEY>`) →
 * `SecretStorePort`; device prefs (the non-secret snippet structure / scopes /
 * model / nav keys / permission mode / cli path) → `SettingsPort` (TEST-SS-091); a
 * secret value never echoes back into a returned struct / scope read (TEST-SS-014,
 * NFR-SS-002).
 *
 * Pass-as-guard for the established invariants (the EnvSnippetService secret-split +
 * the coerce* round-trip) — the invariant baseline recorded for the epic gate.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { fakeModulePorts, type FakePorts } from '../../__fakes__/fake-ports';
import { createEnvSnippetService, type EnvSnippetService } from '@/application/settings/EnvSnippetService';
import { PROVIDER_DESCRIPTORS } from '@/domain/chat/providers';
import { envSecretKey, type PluginSettings, DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings';
import { providerSecretKey } from '@/domain/ports';

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

/** The serialised device-local blob — the counter-metric surface. */
async function settingsBlob(): Promise<string> {
	return JSON.stringify(await ports.settings.getSettings());
}

const PROVIDER_KEY_SECRET = 'sk-provider-key-zzz';
const ENV_INLINE_VALUE = 'http://corp-proxy:8080';
const ENV_SECRET_VALUE = 'sk-env-secret-yyy';

describe('no-secret-leak across every flow (TEST-SS-090)', () => {
	it('a provider API key persists ONLY in the SecretStore, never the settings blob', async () => {
		await ports.secretStore.setSecret(providerSecretKey('codex'), PROVIDER_KEY_SECRET);
		expect(await settingsBlob()).not.toContain(PROVIDER_KEY_SECRET);
		expect(ports.secretStore.getStoredKeys()).toContain(providerSecretKey('codex'));
	});

	it('a snippet with an auth-secret value keeps only a secretRef in data.json (EC-SS-5)', async () => {
		const created = await service.create({
			name: 'codex-key',
			scope: 'provider:codex',
			envText: `OPENAI_API_KEY=${ENV_SECRET_VALUE}\nOPENAI_BASE_URL=https://api`,
		});
		expect(created.ok).toBe(true);
		// The secret value never lands in the device-local blob.
		expect(await settingsBlob()).not.toContain(ENV_SECRET_VALUE);
		// The secret value lives only in the SecretStore under env.<scope>.<KEY>.
		expect(ports.secretStore.getStoredKeys()).toContain(
			envSecretKey('provider:codex', 'OPENAI_API_KEY'),
		);
		// The non-secret value DOES land in the device-local struct (it is not a secret).
		expect(await settingsBlob()).toContain('https://api');
	});

	it('applyScopeText routes a secret value to the SecretStore, the blob stays clean', async () => {
		const applied = await service.applyScopeText(
			'provider:codex',
			`OPENAI_API_KEY=${ENV_SECRET_VALUE}\nFOO=${ENV_INLINE_VALUE}`,
		);
		expect(applied.ok).toBe(true);
		expect(await settingsBlob()).not.toContain(ENV_SECRET_VALUE);
		expect(await settingsBlob()).toContain(ENV_INLINE_VALUE);
		expect(ports.secretStore.getStoredKeys()).toContain(
			envSecretKey('provider:codex', 'OPENAI_API_KEY'),
		);
	});
});

describe('correct-store routing (TEST-SS-091)', () => {
	it('device prefs (the six P10 fields) land in SettingsPort, never the SecretStore', async () => {
		const prefs: PluginSettings = {
			...DEFAULT_SETTINGS,
			providerDefaultModel: { codex: 'gpt-5' },
			defaultPermissionMode: 'plan',
			keyboardNav: { scrollUpKey: 'w', scrollDownKey: 's', focusInputKey: 'i' },
			providerCliPath: { codex: '/usr/local/bin/codex' },
		};
		await ports.settings.saveSettings(prefs);
		const settings = await ports.settings.getSettings();
		expect(settings.providerDefaultModel).toEqual({ codex: 'gpt-5' });
		expect(settings.defaultPermissionMode).toBe('plan');
		// No device pref leaks into the SecretStore.
		expect(ports.secretStore.getStoredKeys()).toEqual([]);
	});

	it('secrets (provider key + env secret) land ONLY in the SecretStore', async () => {
		await ports.secretStore.setSecret(providerSecretKey('opencode'), PROVIDER_KEY_SECRET);
		await service.create({
			name: 'env-key',
			scope: 'provider:opencode',
			envText: `OPENCODE_API_KEY=${ENV_SECRET_VALUE}`,
		});
		const stored = [...ports.secretStore.getStoredKeys()].sort();
		expect(stored).toEqual([
			'env.provider:opencode.OPENCODE_API_KEY',
			'provider.opencode.apiKey',
		]);
		expect(await settingsBlob()).not.toContain(PROVIDER_KEY_SECRET);
		expect(await settingsBlob()).not.toContain(ENV_SECRET_VALUE);
	});
});

describe('no echo / no log of a secret value (TEST-SS-014, NFR-SS-002)', () => {
	it('readScope returns a secretRef MASKED — the resolved value never re-enters the service/UI', async () => {
		await service.create({
			name: 'codex-key',
			scope: 'provider:codex',
			envText: `OPENAI_API_KEY=${ENV_SECRET_VALUE}`,
		});
		await service.apply((await service.list()).ok ? (await listFirstId()) : '');
		const read = await service.readScope('provider:codex');
		expect(read.ok).toBe(true);
		if (read.ok) {
			const entry = read.value.find((e) => e.key === 'OPENAI_API_KEY');
			expect(entry?.value.kind).toBe('secretRef');
			// The resolved secret value never re-enters the returned entries.
			expect(JSON.stringify(read.value)).not.toContain(ENV_SECRET_VALUE);
		}
	});

	async function listFirstId(): Promise<string> {
		const list = await service.list();
		return list.ok && list.value.length > 0 ? list.value[0].id : '';
	}
});
