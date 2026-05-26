/**
 * The PURE env scope routing (SPEC-SS-004, REQ-SS-050/052/053/064). Ported 1:1 from
 * claudian `core/providers/providerEnvironment.ts:273-364`, with throw-paths
 * converted to total returns and the per-provider branch replaced by the descriptor
 * classifier (`classifyEnvKey`), so the routing is capability-gated and never
 * branched on the provider id (NFR-SS-008). Total — never throws; no
 * `obsidian`/`node:*`/Vue/class (ADR-001/004).
 */
import type { ProviderId } from '@/domain/chat/ProviderId';
import type { ProviderDescriptor } from '@/domain/chat/providers/ProviderDescriptor';
import { classifyEnvKey } from './classifyEnvKey';
import type { EnvironmentScope } from './EnvSnippet';

export interface EnvironmentScopeUpdate {
	readonly scope: EnvironmentScope;
	readonly envText: string;
}

interface ClassifiedEnvironmentLines {
	readonly shared: string[];
	readonly providers: Partial<Record<ProviderId, string[]>>;
	readonly reviewKeys: Set<string>;
}

/** Extract the env key from a `KEY=value` line, or null for a blank/comment/keyless line. */
function extractEnvironmentKey(line: string): string | null {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith('#')) return null;
	const normalized = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed;
	const eqIndex = normalized.indexOf('=');
	if (eqIndex <= 0) return null;
	const key = normalized.slice(0, eqIndex).trim();
	return key || null;
}

function resolveScopeProviderId(scope: EnvironmentScope): ProviderId | null {
	return scope.startsWith('provider:') ? (scope.slice('provider:'.length) as ProviderId) : null;
}

function hasMeaningfulEnvironmentContent(envText: string): boolean {
	return envText.split(/\r?\n/).some((line) => {
		const trimmed = line.trim();
		return trimmed.length > 0 && !trimmed.startsWith('#');
	});
}

/** Distribute each line to its owning scope, attaching pending decorators to the next keyed line. */
function classifyEnvironmentLines(
	input: string,
	descriptors: readonly ProviderDescriptor[],
): ClassifiedEnvironmentLines {
	const result: ClassifiedEnvironmentLines = { shared: [], providers: {}, reviewKeys: new Set<string>() };
	let pendingDecorators: string[] = [];

	for (const line of input.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			pendingDecorators.push(line);
			continue;
		}

		const key = extractEnvironmentKey(line);
		if (key === null) {
			result.shared.push(...pendingDecorators, line);
			pendingDecorators = [];
			continue;
		}

		const ownership = classifyEnvKey(key, descriptors);
		if (ownership.type === 'provider') {
			const target = result.providers[ownership.providerId] ?? [];
			target.push(...pendingDecorators, line);
			result.providers[ownership.providerId] = target;
		} else {
			result.shared.push(...pendingDecorators, line);
			if (ownership.type === 'shared-unknown') result.reviewKeys.add(key);
		}
		pendingDecorators = [];
	}

	if (pendingDecorators.length > 0) result.shared.push(...pendingDecorators);
	return result;
}

/**
 * The keys in `envText` that do NOT belong in `scope` (shared scope: any
 * non-shared-known; a provider scope: any key not provider-owned by that provider)
 * → the review-warning list (REQ-SS-052). Total.
 */
export function getEnvironmentReviewKeysForScope(
	envText: string,
	scope: EnvironmentScope,
	descriptors: readonly ProviderDescriptor[],
): readonly string[] {
	const reviewKeys = new Set<string>();
	const expectedProviderId = resolveScopeProviderId(scope);

	for (const line of envText.split(/\r?\n/)) {
		const key = extractEnvironmentKey(line);
		if (key === null || reviewKeys.has(key)) continue;

		const ownership = classifyEnvKey(key, descriptors);
		if (scope === 'shared') {
			if (ownership.type !== 'shared-known') reviewKeys.add(key);
			continue;
		}
		if (ownership.type !== 'provider' || ownership.providerId !== expectedProviderId) {
			reviewKeys.add(key);
		}
	}

	return [...reviewKeys];
}

/** The single scope all of `envText`'s keys belong to, else undefined (REQ-SS-053/064). Total. */
export function inferEnvironmentSnippetScope(
	envText: string,
	descriptors: readonly ProviderDescriptor[],
): EnvironmentScope | undefined {
	const classified = classifyEnvironmentLines(envText, descriptors);
	const nonEmptyScopes: EnvironmentScope[] = [];

	if (hasMeaningfulEnvironmentContent(classified.shared.join('\n'))) nonEmptyScopes.push('shared');
	for (const [providerId, lines] of Object.entries(classified.providers)) {
		if (hasMeaningfulEnvironmentContent(lines.join('\n'))) {
			nonEmptyScopes.push(`provider:${providerId as ProviderId}`);
		}
	}

	return nonEmptyScopes.length === 1 ? nonEmptyScopes[0] : undefined;
}

/** The inferred scope, else `fallbackScope` only when `envText` has no meaningful content (REQ-SS-064). Total. */
export function resolveEnvironmentSnippetScope(
	envText: string,
	descriptors: readonly ProviderDescriptor[],
	fallbackScope?: EnvironmentScope,
): EnvironmentScope | undefined {
	const inferred = inferEnvironmentSnippetScope(envText, descriptors);
	if (inferred !== undefined) return inferred;
	return hasMeaningfulEnvironmentContent(envText) ? undefined : fallbackScope;
}

/**
 * Split a pasted env blob across scopes by key ownership (shared vs provider:<id>);
 * a fallback scope catches an unsplittable blob with no classified line (REQ-SS-053).
 * Total — comments/decorators attach to the following key's scope.
 */
export function getEnvironmentScopeUpdates(
	envText: string,
	descriptors: readonly ProviderDescriptor[],
	fallbackScope?: EnvironmentScope,
): readonly EnvironmentScopeUpdate[] {
	const classified = classifyEnvironmentLines(envText, descriptors);
	const updates: EnvironmentScopeUpdate[] = [];

	const sharedText = classified.shared.join('\n');
	if (sharedText.trim()) updates.push({ scope: 'shared', envText: sharedText });

	for (const [providerId, lines] of Object.entries(classified.providers)) {
		const providerText = lines.join('\n');
		if (!providerText.trim()) continue;
		updates.push({ scope: `provider:${providerId as ProviderId}`, envText: providerText });
	}

	if (updates.length > 0) return updates;
	// Nothing classified into a scope. The fallback bucket catches only an
	// unsplittable blob that still has meaningful content (REQ-SS-053, EC-SS-4);
	// empty/comment-only text yields no update.
	if (fallbackScope !== undefined && hasMeaningfulEnvironmentContent(envText)) {
		return [{ scope: fallbackScope, envText }];
	}
	return [];
}
