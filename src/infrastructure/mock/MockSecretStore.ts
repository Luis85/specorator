/**
 * In-memory `SecretStorePort` for unit tests + `npm run dev` (P9, SPEC-PV-011). A
 * plain `Map` cleared per session — **no real OS secret is touched** (REQ-PV-073).
 * `isAvailable()` defaults `true`; `setSecretStoreAvailable(false)` forces the
 * unavailable gate (TEST-PV-072). `seedSecret`/`getStoredKeys` are test hooks.
 *
 * The value never crosses into a notice/log/DTO (NFR-PV-002) — it lives only in
 * this in-memory map. No `obsidian`, no `node:*`. Total — never throws.
 */
import type { SecretStorePort } from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';

export class MockSecretStore implements SecretStorePort {
	private readonly store = new Map<string, string>();
	private available = true;

	/** Test hook: force the native-storage availability gate (TEST-PV-072). */
	setSecretStoreAvailable(available: boolean): void {
		this.available = available;
	}

	/** Test hook: pre-seed a stored secret (no real OS secret). */
	seedSecret(key: string, value: string): void {
		this.store.set(key, value);
	}

	/** Test hook: the stored secret keys (never values) for assertions. */
	getStoredKeys(): readonly string[] {
		return [...this.store.keys()];
	}

	isAvailable(): boolean {
		return this.available;
	}

	getSecret(key: string): Promise<Result<string | null>> {
		if (!this.available) {
			return Promise.resolve(err(new Error('secret storage unavailable')));
		}
		return Promise.resolve(ok(this.store.get(key) ?? null));
	}

	setSecret(key: string, value: string): Promise<Result<void>> {
		if (!this.available) {
			return Promise.resolve(err(new Error('secret storage unavailable')));
		}
		this.store.set(key, value);
		return Promise.resolve(ok(undefined));
	}

	deleteSecret(key: string): Promise<Result<void>> {
		if (!this.available) {
			return Promise.resolve(err(new Error('secret storage unavailable')));
		}
		// Idempotent — a missing key is `ok()`.
		this.store.delete(key);
		return Promise.resolve(ok(undefined));
	}

	listKeys(): Promise<Result<readonly string[]>> {
		if (!this.available) {
			return Promise.resolve(err(new Error('secret storage unavailable')));
		}
		return Promise.resolve(ok([...this.store.keys()]));
	}
}
