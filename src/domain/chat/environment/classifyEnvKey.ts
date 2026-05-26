/**
 * The PURE env-key classifier + the secret predicate (SPEC-SS-002, REQ-SS-051/066).
 * Regrown 1:1 from claudian `core/providers/providerEnvironment.ts:23-61`, with the
 * per-provider branch replaced by DESCRIPTOR DATA: the classifier iterates each
 * descriptor's `environmentKeyPatterns` (T-SS-005), so it is capability-gated and
 * never branched on the provider id (NFR-SS-008, SPEC-SS-021). Total — never throws;
 * no `obsidian`/`node:*`/Vue/class (ADR-001/004).
 */
import type { ProviderId } from '@/domain/chat/ProviderId';
import type { ProviderDescriptor } from '@/domain/chat/providers/ProviderDescriptor';

/**
 * The shared-known env keys (regrown VERBATIM from `providerEnvironment.ts:23-37`).
 * Compared UPPER-CASE.
 */
export const SHARED_ENVIRONMENT_KEYS: ReadonlySet<string> = new Set([
	'PATH',
	'HTTP_PROXY',
	'HTTPS_PROXY',
	'NO_PROXY',
	'ALL_PROXY',
	'SSL_CERT_FILE',
	'SSL_CERT_DIR',
	'REQUESTS_CA_BUNDLE',
	'CURL_CA_BUNDLE',
	'NODE_EXTRA_CA_CERTS',
	'TMPDIR',
	'TMP',
	'TEMP',
]);

export type EnvKeyOwnership =
	| { readonly type: 'shared-known' }
	| { readonly type: 'shared-unknown' }
	| { readonly type: 'provider'; readonly providerId: ProviderId };

/** Auth-suffixed keys are secret when provider-owned (parity `providerEnvironment.ts`). */
const AUTH_KEY_SUFFIX = /(_API_KEY|_AUTH_TOKEN|_TOKEN)$/i;

/**
 * Classify a key shared-known / provider-owned / shared-unknown over the descriptor
 * patterns (parity `providerEnvironment.ts:43-61`). Trims + upper-cases; an empty
 * key → shared-unknown. Reads patterns from descriptor data — no provider-id branch.
 */
export function classifyEnvKey(
	key: string,
	descriptors: readonly ProviderDescriptor[],
): EnvKeyOwnership {
	const normalized = key.trim().toUpperCase();
	if (!normalized) return { type: 'shared-unknown' };
	if (SHARED_ENVIRONMENT_KEYS.has(normalized)) return { type: 'shared-known' };

	for (const descriptor of descriptors) {
		const patterns = descriptor.environmentKeyPatterns ?? [];
		if (patterns.some((pattern) => pattern.test(normalized))) {
			return { type: 'provider', providerId: descriptor.id };
		}
	}

	return { type: 'shared-unknown' };
}

/**
 * Whether a value for `key` is a SECRET (routes to SecretStorePort, REQ-SS-066):
 * `true` when the key is provider-owned AND matches an auth pattern
 * (`_API_KEY` | `_AUTH_TOKEN` | `_TOKEN`), OR the caller explicitly marks the entry
 * secret (`markSecret`). PURE/total.
 */
export function isSecretEnvKey(key: string, ownership: EnvKeyOwnership, markSecret: boolean): boolean {
	if (markSecret) return true;
	return ownership.type === 'provider' && AUTH_KEY_SUFFIX.test(key.trim());
}
