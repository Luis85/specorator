/**
 * The env-scope → subprocess-env resolution helper (P10, SPEC-SS-013, REQ-SS-065)
 * the P9 provider runtimes consume at turn start. Resolves a scope's `EnvEntry[]`
 * into the `Record<string,string>` the runtime merges into the subprocess env: an
 * `{kind:'inline'}` entry is read verbatim; a `{kind:'secretRef'}` entry is read
 * via `SecretStorePort.getSecret(secretRef)`.
 *
 * **This is the ONE place a secret value is read** (ADR-SS-001, SPEC-SS-019): the
 * resolved value is returned ONLY so the infra runtime can merge it into the
 * subprocess env — it never enters the application/UI/DTO/notice/log. A resolution
 * failure surfaces as `Result.err` with no secret value substring (NFR-SS-002).
 * `Result`-typed, never throws across the port. No `obsidian`/`node:*`/Vue (ADR-001).
 */
import type { SecretStorePort } from '@/domain/ports/SecretStorePort';
import type { Result } from '@/domain/shared/Result';
import { ok } from '@/domain/shared/Result';
import type { EnvEntry } from '@/domain/chat/environment/EnvSnippet';

/**
 * Resolve a scope's entries into a plain env record (REQ-SS-065). An inline entry
 * is read as-is; a secretRef entry is resolved via `getSecret` at the boundary — an
 * absent secret (`ok(null)`) is omitted (no empty injection). A store-read failure
 * short-circuits to `err`. Total — never throws.
 */
export async function resolveEnvScope(
	entries: readonly EnvEntry[],
	secretStore: SecretStorePort,
): Promise<Result<Record<string, string>>> {
	const resolved: Record<string, string> = {};
	for (const entry of entries) {
		if (entry.value.kind === 'inline') {
			resolved[entry.key] = entry.value.text;
			continue;
		}
		const secret = await secretStore.getSecret(entry.value.secretRef);
		if (!secret.ok) return secret;
		if (secret.value !== null) resolved[entry.key] = secret.value;
	}
	return ok(resolved);
}

/**
 * Compose the subprocess env the runtime spawns with: `{ ...base, ...shared,
 * ...provider }` (SPEC-SS-013) — a provider-scoped value wins over a shared value,
 * which wins over the inherited base (`process.env`). The secret resolution happens
 * here (via {@link resolveEnvScope}); the merged record is handed straight to the
 * subprocess. A resolution failure propagates as `err`. Total — never throws.
 */
export async function mergeScopeEnvs(
	base: Readonly<Record<string, string>>,
	sharedEntries: readonly EnvEntry[],
	providerEntries: readonly EnvEntry[],
	secretStore: SecretStorePort,
): Promise<Result<Record<string, string>>> {
	const shared = await resolveEnvScope(sharedEntries, secretStore);
	if (!shared.ok) return shared;
	const provider = await resolveEnvScope(providerEntries, secretStore);
	if (!provider.ok) return provider;
	return ok({ ...base, ...shared.value, ...provider.value });
}
