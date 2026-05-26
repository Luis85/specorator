/**
 * The GitHub Pages demo `SecretStorePort` (P9, SPEC-PV-012). An in-memory `Map`
 * (NOT localStorage — a secret must never persist to a device-local store,
 * NFR-PV-002, REQ-PV-073); `isAvailable()` → `true` so the masked secret field is
 * exercisable in the demo without a real OS store. The value never leaves this map.
 * Never throws across the boundary. No `node:*`.
 */
import type { SecretStorePort } from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import { ok } from '@/domain/shared/Result';

export class LocalStorageSecretStore implements SecretStorePort {
	private readonly store = new Map<string, string>();

	isAvailable(): boolean {
		return true;
	}

	getSecret(key: string): Promise<Result<string | null>> {
		return Promise.resolve(ok(this.store.get(key) ?? null));
	}

	setSecret(key: string, value: string): Promise<Result<void>> {
		this.store.set(key, value);
		return Promise.resolve(ok(undefined));
	}

	deleteSecret(key: string): Promise<Result<void>> {
		this.store.delete(key);
		return Promise.resolve(ok(undefined));
	}

	listKeys(): Promise<Result<readonly string[]>> {
		return Promise.resolve(ok([...this.store.keys()]));
	}
}
