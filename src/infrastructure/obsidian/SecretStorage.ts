/**
 * The real `SecretStorePort` over Obsidian's native `app.secretStorage` (P9,
 * SPEC-PV-009, ADR-PV-002). The provider API key persists ONLY to the OS-native
 * secret store — **NEVER `data.json` / a device-local store / a notice / a log**
 * (NFR-PV-002, REQ-PV-070). `app.secretStorage` is synchronous (`setSecret`/
 * `getSecret`/`listSecrets`, since Obsidian 1.11.4); each call is wrapped in
 * `trySync` so the port stays `Result`-typed and never throws across the boundary.
 *
 * `app.secretStorage` requires a lowercase-alphanumeric-with-dashes id, so the
 * `provider.<id>.apiKey` namespace key is normalised to `provider-<id>-apikey` for
 * the native store (the domain key stays the contract; the mapping is internal).
 *
 * `isAvailable()` probes whether `app.secretStorage` exists — the SPEC-PV-032
 * `minAppVersion` availability check (escalate-not-bump; older hosts gate the field
 * off rather than fall back to a plain store, EC-PV-10).
 *
 * Coverage-excluded (`src/infrastructure/obsidian/**`, §10) — the behavioural gate is
 * the MANUAL leg TEST-PV-M3 (the real round-trip + the availability check + the
 * no-`data.json` proof). No `obsidian` symbol leaks past this file.
 */
import type { App } from 'obsidian';
import type { SecretStorePort } from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';
import { trySync } from '@/domain/shared/tryAsync';

/** The minimal `app.secretStorage` shape this adapter reads (Obsidian ≥ 1.11.4). */
interface NativeSecretStorage {
	setSecret(id: string, secret: string): void;
	getSecret(id: string): string | null;
	listSecrets(): string[];
}

export class SecretStorage implements SecretStorePort {
	constructor(private readonly app: App) {}

	/** Whether native secret storage is available on this host (SPEC-PV-032). */
	isAvailable(): boolean {
		return this._native() !== null;
	}

	getSecret(key: string): Promise<Result<string | null>> {
		const native = this._native();
		if (native === null) {
			return Promise.resolve(err(new Error('native secret storage unavailable')));
		}
		const read = trySync(() => native.getSecret(SecretStorage._nativeId(key)));
		if (!read.ok) return Promise.resolve(err(read.error));
		// An empty string means "deleted/cleared" — surface it as absent (ok(null)).
		const value = read.value;
		return Promise.resolve(ok(value === null || value === '' ? null : value));
	}

	setSecret(key: string, value: string): Promise<Result<void>> {
		const native = this._native();
		if (native === null) {
			return Promise.resolve(err(new Error('native secret storage unavailable')));
		}
		const written = trySync(() => {
			native.setSecret(SecretStorage._nativeId(key), value);
		});
		return Promise.resolve(written);
	}

	deleteSecret(key: string): Promise<Result<void>> {
		const native = this._native();
		if (native === null) {
			return Promise.resolve(err(new Error('native secret storage unavailable')));
		}
		// `SecretStorage` exposes no delete; clearing to empty is the idempotent
		// equivalent (a subsequent `getSecret` returns `ok(null)`).
		const cleared = trySync(() => {
			native.setSecret(SecretStorage._nativeId(key), '');
		});
		return Promise.resolve(cleared);
	}

	listKeys(): Promise<Result<readonly string[]>> {
		const native = this._native();
		if (native === null) {
			return Promise.resolve(err(new Error('native secret storage unavailable')));
		}
		const listed = trySync(() => native.listSecrets());
		if (!listed.ok) return Promise.resolve(err(listed.error));
		return Promise.resolve(ok(listed.value));
	}

	/** Resolve the native `app.secretStorage`, or `null` when the host lacks it. */
	private _native(): NativeSecretStorage | null {
		const candidate = (this.app as { secretStorage?: unknown }).secretStorage;
		if (
			candidate !== null &&
			typeof candidate === 'object' &&
			typeof (candidate as NativeSecretStorage).getSecret === 'function'
		) {
			return candidate as NativeSecretStorage;
		}
		return null;
	}

	/** Map the `provider.<id>.apiKey` namespace key to a native-store-legal id. */
	private static _nativeId(key: string): string {
		return key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
	}
}
