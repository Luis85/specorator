/**
 * `SecretStorePort` (P9, SPEC-PV-006, ADR-PV-002). The narrow secret surface for a
 * provider API key. One port for one consumer kind (the masked field's `setSecret`
 * + the runtime env `getSecret`); its own `SECRET_STORE_PORT` key +
 * `useSecretStorePort()` composable, no aggregate (ADR-008).
 *
 * **Secrets never cross into the UI/store/DTO/notice/log (NFR-PV-002, REQ-PV-102).**
 * `getSecret` returns the value ONLY at the infra boundary into the subprocess env;
 * `listKeys` returns keys, never values. The real impl is `app.secretStorage`
 * (coverage-excluded); the value never lands in `data.json` (ADR-PV-002). All async
 * methods are `Result`-typed (never throw across the port). No `obsidian`/`node:*`/Vue.
 */
import type { ProviderId } from '@/domain/chat/ProviderId';
import type { Result } from '@/domain/shared/Result';

/**
 * The per-provider secret key namespace (SPEC-PV-006, open item #4). Deterministic
 * for get/set/delete/listKeys — e.g. `provider.codex.apiKey`. Pure/total.
 */
export const providerSecretKey = (id: ProviderId): string => `provider.${id}.apiKey`;

export interface SecretStorePort {
	/** Whether native secret storage is available on this device (REQ-PV-072). Synchronous + total. */
	isAvailable(): boolean;
	/** Read a stored secret by key (REQ-PV-071). `ok(null)` when absent. Read ONLY at the infra boundary. */
	getSecret(key: string): Promise<Result<string | null>>;
	/** Persist a secret by key into native secret storage (REQ-PV-070). NEVER `data.json`/device-local. */
	setSecret(key: string, value: string): Promise<Result<void>>;
	/** Delete a stored secret by key (REQ-PV-070). Idempotent — a missing key is `ok()`. */
	deleteSecret(key: string): Promise<Result<void>>;
	/** The stored secret KEYS (never values) — for a future P10 "key set / not set" UI. Off the P9 critical path. */
	listKeys(): Promise<Result<readonly string[]>>;
}
