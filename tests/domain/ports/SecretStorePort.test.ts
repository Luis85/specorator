/**
 * T-PV-008 (TEST-PV-112 port-shape leg) — RED: `SecretStorePort` exposes EXACTLY
 * `isAvailable(): boolean` (sync) + the four `Result`-typed async methods
 * (`getSecret`/`setSecret`/`deleteSecret`/`listKeys`); `providerSecretKey(id)` is a
 * deterministic `'provider.<id>.apiKey'` helper; `SECRET_STORE_PORT` is its OWN
 * `InjectionKey` in `@/infrastructure/bridge/ports`; the barrel `@/domain/ports`
 * re-exports `SecretStorePort` + `providerSecretKey`. The behavioural round-trip /
 * no-leak / availability-switch are the Mock leg (T-PV-013/014); the real
 * `app.secretStorage` is the manual leg (TEST-PV-M3).
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-PV-009 adds the port + key + barrel.
 *
 * Traces: TEST-PV-112, SPEC-PV-006, REQ-PV-070..073, NFR-PV-006.
 */
import { describe, it, expect } from 'vitest';
import type { InjectionKey } from 'vue';
import type { SecretStorePort } from '@/domain/ports/SecretStorePort';
import { providerSecretKey } from '@/domain/ports/SecretStorePort';
import type {
	SecretStorePort as PortFromBarrel,
} from '@/domain/ports';
import { providerSecretKey as keyFromBarrel } from '@/domain/ports';
import { SECRET_STORE_PORT } from '@/infrastructure/bridge/ports';
import type { Result } from '@/domain/shared/Result';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- The barrel re-export is the same type as the own module ----
const _barrelSame: Equals<SecretStorePort, PortFromBarrel> = true;
void _barrelSame;

// ---- The port exposes EXACTLY the five members ----
const _members: Equals<
	keyof SecretStorePort,
	'isAvailable' | 'getSecret' | 'setSecret' | 'deleteSecret' | 'listKeys'
> = true;
void _members;

// ---- isAvailable is synchronous; the rest are Result-typed promises ----
const _isAvailable: Equals<SecretStorePort['isAvailable'], () => boolean> = true;
const _getSecret: Equals<
	SecretStorePort['getSecret'],
	(key: string) => Promise<Result<string | null>>
> = true;
const _setSecret: Equals<
	SecretStorePort['setSecret'],
	(key: string, value: string) => Promise<Result<void>>
> = true;
const _deleteSecret: Equals<
	SecretStorePort['deleteSecret'],
	(key: string) => Promise<Result<void>>
> = true;
const _listKeys: Equals<
	SecretStorePort['listKeys'],
	() => Promise<Result<readonly string[]>>
> = true;
void _isAvailable;
void _getSecret;
void _setSecret;
void _deleteSecret;
void _listKeys;

// ---- The key is its own InjectionKey<SecretStorePort> ----
const _key: Equals<typeof SECRET_STORE_PORT, InjectionKey<SecretStorePort>> = true;
void _key;

describe('SecretStorePort shape + key + providerSecretKey (TEST-PV-112)', () => {
	it('the InjectionKey is a Symbol', () => {
		expect(typeof SECRET_STORE_PORT).toBe('symbol');
	});

	it('providerSecretKey is the deterministic provider.<id>.apiKey namespace', () => {
		expect(providerSecretKey('codex')).toBe('provider.codex.apiKey');
		expect(providerSecretKey('opencode')).toBe('provider.opencode.apiKey');
		expect(providerSecretKey('claude')).toBe('provider.claude.apiKey');
	});

	it('the barrel re-export is the same helper', () => {
		expect(keyFromBarrel).toBe(providerSecretKey);
	});

	it('an implementation satisfies the five-method contract', async () => {
		const store = new Map<string, string>();
		const port: SecretStorePort = {
			isAvailable: () => true,
			getSecret: (key) => Promise.resolve({ ok: true, value: store.get(key) ?? null }),
			setSecret: (key, value) => {
				store.set(key, value);
				return Promise.resolve({ ok: true, value: undefined });
			},
			deleteSecret: (key) => {
				store.delete(key);
				return Promise.resolve({ ok: true, value: undefined });
			},
			listKeys: () => Promise.resolve({ ok: true, value: [...store.keys()] }),
		};
		expect(port.isAvailable()).toBe(true);
		const set = await port.setSecret(providerSecretKey('codex'), 'sk-secret');
		expect(set.ok).toBe(true);
		const keys = await port.listKeys();
		expect(keys.ok && keys.value).toEqual(['provider.codex.apiKey']);
	});
});
