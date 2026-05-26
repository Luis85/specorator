/**
 * The P9-runtime env-scope merge (P10, SPEC-SS-013, REQ-SS-065). Reads the applied
 * `envScopes` device-local record off the `SettingsPort`, resolves the `shared` +
 * `provider:<id>` entries into a plain env record via the application
 * {@link mergeScopeEnvs}, and merges them over the runtime's `base` env at the
 * subprocess spawn boundary.
 *
 * **This is the ONE place the env-scope secret value is read** (ADR-SS-001,
 * SPEC-SS-019): a `{kind:'secretRef'}` entry resolves via
 * `SecretStorePort.getSecret(ref)` here, the resolved value flows straight into the
 * subprocess env, and it NEVER enters the application/UI/DTO/notice/log
 * (NFR-SS-002). The merge precedence is `{ ...base, ...shared, ...provider }` — a
 * provider-scoped value wins over a shared value, which wins over the inherited base.
 *
 * Total — never throws across a port: a settings-read or secret-read failure
 * degrades to the unmodified `base` env (the turn still spawns; the missing env-scope
 * surfaces as the provider's own start-fail, never a crash). Coverage-excluded
 * (`src/infrastructure/obsidian/**`, §10) — the behavioural gate is the MANUAL leg
 * TEST-SS-M2; the pure merge it delegates to is unit-tested
 * (`tests/application/settings/resolveEnvScope.test.ts`).
 */
import type { ProviderId, SecretStorePort, SettingsPort } from '@/domain/ports';
import type { EnvironmentScope } from '@/domain/chat/environment/EnvSnippet';
import { mergeScopeEnvs } from '@/application/settings/resolveEnvScope';
import { tryAsync } from '@/domain/shared/tryAsync';

/**
 * Merge the applied `shared` + `provider:<id>` env scopes (resolving secretRefs at
 * the boundary) over `base`, returning the env the runtime spawns with. On any
 * failure the unmodified `base` is returned (never throws).
 */
export async function buildScopeEnv(
	base: Readonly<Record<string, string>>,
	providerId: ProviderId,
	settings: SettingsPort,
	secretStore: SecretStorePort,
): Promise<Record<string, string>> {
	const read = await tryAsync(() => settings.getSettings());
	if (!read.ok) return { ...base };
	const scopes = read.value.envScopes ?? {};
	const sharedScope: EnvironmentScope = 'shared';
	const providerScope: EnvironmentScope = `provider:${providerId}`;
	const shared = scopes[sharedScope] ?? [];
	const provider = scopes[providerScope] ?? [];
	const merged = await mergeScopeEnvs(base, shared, provider, secretStore);
	return merged.ok ? merged.value : { ...base };
}
