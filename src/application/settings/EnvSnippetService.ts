/**
 * `EnvSnippetService` (P10, SPEC-SS-009, ADR-SS-001). The env-snippet use cases —
 * composes `SettingsPort` (the NON-SECRET struct, device-local) + `SecretStorePort`
 * (the secret values, under `env.<scope>.<KEY>`) behind a pure service. **NO new
 * port** (ADR-SS-001 §5). The injected `ProviderDescriptor[]` drives the pure
 * classifier so the routing is capability-gated, never branched on the provider id
 * (NFR-SS-008, SPEC-SS-021).
 *
 * **The secret split (the load-bearing invariant, SPEC-SS-019):** on save each
 * value is classified; a secret value is written to `SecretStorePort` and the
 * struct keeps only a `{kind:'secretRef'}` entry — the plaintext secret NEVER lands
 * in `data.json`/device-local/a notice/a log/the returned struct. `readScope`
 * returns a `secretRef` MASKED — never resolved into the service/UI (the value is
 * resolved ONLY at the subprocess-env boundary, SPEC-SS-013). On remove both stores
 * are cleared.
 *
 * Every method is `Result`-typed — no throw across a port (REQ-SS-094, NFR-SS-006);
 * an `err` carries no secret/env value substring (NFR-SS-002, SPEC-SS-022/026).
 * No `obsidian`/`node:*`/Vue (application layer, ADR-001).
 */
import type { ProviderDescriptor } from '@/domain/chat/providers/ProviderDescriptor';
import type { SettingsPort } from '@/domain/ports/SettingsPort';
import type { SecretStorePort } from '@/domain/ports/SecretStorePort';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';
import { tryAsync } from '@/domain/shared/tryAsync';
import type { PluginSettings } from '@/domain/settings/PluginSettings';
import { envSecretKey } from '@/domain/settings/PluginSettings';
import {
	parseEnvironmentVariables,
	parseContextLimit,
	type EnvEntry,
	type EnvironmentScope,
	type EnvSnippetStruct,
} from '@/domain/chat/environment/EnvSnippet';
import { classifyEnvKey, isSecretEnvKey } from '@/domain/chat/environment/classifyEnvKey';
import {
	getEnvironmentScopeUpdates,
	getEnvironmentReviewKeysForScope,
	resolveEnvironmentSnippetScope,
} from '@/domain/chat/environment/envScope';

/** Raw create/edit input — the editor's fields (the secret values arrive as plaintext text, never persisted as-is). */
export interface EnvSnippetInput {
	readonly name: string;
	readonly description?: string;
	readonly envText: string;
	readonly scope?: EnvironmentScope;
	readonly markSecretKeys?: readonly string[];
	readonly contextLimits?: Readonly<Record<string, number>>;
}

export interface EnvSnippetService {
	/** The persisted non-secret snippet structures (load-or-default `[]`, REQ-SS-060). */
	list(): Promise<Result<readonly EnvSnippetStruct[]>>;
	/** Create a snippet — name required, secret-split, mint an id, persist (REQ-SS-060/063/066). */
	create(input: EnvSnippetInput): Promise<Result<EnvSnippetStruct>>;
	/** Edit in place preserving the id; reconcile secret slots (REQ-SS-061). */
	edit(id: string, input: EnvSnippetInput): Promise<Result<EnvSnippetStruct>>;
	/** Remove the struct AND each secretRef slot; idempotent (REQ-SS-062). */
	remove(id: string): Promise<Result<void>>;
	/** Apply a snippet's entries into its (declared or inferred) scope (REQ-SS-064). */
	apply(id: string): Promise<Result<void>>;
	/** Save an env-scope editor's raw text — classify + split + route; return the review keys (REQ-SS-050..053). */
	applyScopeText(scope: EnvironmentScope, text: string): Promise<Result<{ reviewKeys: readonly string[] }>>;
	/** Read a scope's entries — secretRefs stay MASKED, never resolved (REQ-SS-014). */
	readScope(scope: EnvironmentScope): Promise<Result<readonly EnvEntry[]>>;
}

export interface EnvSnippetServiceDeps {
	readonly settings: SettingsPort;
	readonly secretStore: SecretStorePort;
	readonly descriptors: readonly ProviderDescriptor[];
}

/** One parsed env line's classification — the non-secret entry + an optional secret slot to write. */
interface SplitEntry {
	readonly entry: EnvEntry;
	readonly secret?: { readonly secretRef: string; readonly value: string };
}

export function createEnvSnippetService(deps: EnvSnippetServiceDeps): EnvSnippetService {
	const { settings, secretStore, descriptors } = deps;

	/** Read the persisted snippets (load-or-default `[]`). */
	function readSnippets(current: PluginSettings): readonly EnvSnippetStruct[] {
		return current.envSnippets ?? [];
	}

	/** Coerce the input context-limits — drop any value `parseContextLimit` rejects (REQ-SS-067). */
	function coerceInputContextLimits(
		raw: Readonly<Record<string, number>> | undefined,
	): Readonly<Record<string, number>> | undefined {
		if (raw === undefined) return undefined;
		const kept: Record<string, number> = {};
		for (const [model, value] of Object.entries(raw)) {
			const parsed = parseContextLimit(String(value));
			if (parsed !== null) kept[model] = parsed;
		}
		return Object.keys(kept).length > 0 ? kept : undefined;
	}

	/**
	 * Classify each parsed key into a non-secret entry + (for a secret value) the
	 * secret slot to write under `env.<scope>.<KEY>`. The plaintext secret stays in
	 * the returned `secret.value` ONLY to be handed to `setSecret`; the `entry`
	 * itself holds only the `secretRef` (SPEC-SS-019).
	 */
	function splitEntries(
		envText: string,
		scope: EnvironmentScope,
		markSecretKeys: readonly string[],
	): readonly SplitEntry[] {
		const marked = new Set(markSecretKeys.map((key) => key.trim().toUpperCase()));
		const parsed = parseEnvironmentVariables(envText);
		const splits: SplitEntry[] = [];
		for (const [key, value] of Object.entries(parsed)) {
			const ownership = classifyEnvKey(key, descriptors);
			const markSecret = marked.has(key.trim().toUpperCase());
			if (isSecretEnvKey(key, ownership, markSecret)) {
				const secretRef = envSecretKey(scope, key);
				splits.push({ entry: { key, value: { kind: 'secretRef', secretRef } }, secret: { secretRef, value } });
			} else {
				splits.push({ entry: { key, value: { kind: 'inline', text: value } } });
			}
		}
		return splits;
	}

	/** Write each split's secret slot to `SecretStorePort` (one write per secret). */
	async function writeSecrets(splits: readonly SplitEntry[]): Promise<Result<void>> {
		for (const split of splits) {
			if (split.secret === undefined) continue;
			const written = await secretStore.setSecret(split.secret.secretRef, split.secret.value);
			if (!written.ok) return written;
		}
		return ok(undefined);
	}

	/** Delete each `secretRef` slot referenced by the given entries (idempotent). */
	async function deleteSecretsFor(entries: readonly EnvEntry[]): Promise<Result<void>> {
		for (const entry of entries) {
			if (entry.value.kind !== 'secretRef') continue;
			const deleted = await secretStore.deleteSecret(entry.value.secretRef);
			if (!deleted.ok) return deleted;
		}
		return ok(undefined);
	}

	/** Persist the full snippet list (one settings write), preserving every other field. */
	async function saveSnippets(
		current: PluginSettings,
		snippets: readonly EnvSnippetStruct[],
	): Promise<Result<void>> {
		return tryAsync(() => settings.saveSettings({ ...current, envSnippets: snippets }));
	}

	/** Build the struct from an input + the split (the struct carries only non-secret entries). */
	function buildStruct(id: string, input: EnvSnippetInput, splits: readonly SplitEntry[]): EnvSnippetStruct {
		const contextLimits = coerceInputContextLimits(input.contextLimits);
		return {
			id,
			name: input.name.trim(),
			description: input.description ?? '',
			envEntries: splits.map((split) => split.entry),
			...(input.scope !== undefined ? { scope: input.scope } : {}),
			...(contextLimits !== undefined ? { contextLimits } : {}),
		};
	}

	/** The scope namespace for a snippet's secrets — declared, else inferred, else `'shared'`. */
	function resolveSecretScope(input: EnvSnippetInput): EnvironmentScope {
		return input.scope ?? resolveEnvironmentSnippetScope(input.envText, descriptors) ?? 'shared';
	}

	async function list(): Promise<Result<readonly EnvSnippetStruct[]>> {
		const current = await tryAsync(() => settings.getSettings());
		return current.ok ? ok(readSnippets(current.value)) : current;
	}

	async function persistSnippet(
		id: string,
		input: EnvSnippetInput,
		priorEntries: readonly EnvEntry[],
		replace: boolean,
	): Promise<Result<EnvSnippetStruct>> {
		const name = input.name.trim();
		if (name === '') return err(new Error('settings.envSnippets.nameRequired'));

		const currentResult = await tryAsync(() => settings.getSettings());
		if (!currentResult.ok) return currentResult;
		const current = currentResult.value;

		const scope = resolveSecretScope(input);
		const splits = splitEntries(input.envText, scope, input.markSecretKeys ?? []);

		// Reconcile: delete prior secret slots no longer present (edit, REQ-SS-061).
		const newRefs = new Set(
			splits.flatMap((split) => (split.secret !== undefined ? [split.secret.secretRef] : [])),
		);
		const orphaned = priorEntries.filter(
			(entry) => entry.value.kind === 'secretRef' && !newRefs.has(entry.value.secretRef),
		);
		const deleted = await deleteSecretsFor(orphaned);
		if (!deleted.ok) return deleted;

		const written = await writeSecrets(splits);
		if (!written.ok) return written;

		const struct = buildStruct(id, input, splits);
		const existing = readSnippets(current);
		const snippets = replace
			? existing.map((snippet) => (snippet.id === id ? struct : snippet))
			: [...existing, struct];

		const saved = await saveSnippets(current, snippets);
		return saved.ok ? ok(struct) : saved;
	}

	async function create(input: EnvSnippetInput): Promise<Result<EnvSnippetStruct>> {
		return persistSnippet(crypto.randomUUID(), input, [], false);
	}

	async function edit(id: string, input: EnvSnippetInput): Promise<Result<EnvSnippetStruct>> {
		const listed = await list();
		if (!listed.ok) return listed;
		const prior = listed.value.find((snippet) => snippet.id === id);
		return persistSnippet(id, input, prior?.envEntries ?? [], true);
	}

	async function remove(id: string): Promise<Result<void>> {
		const currentResult = await tryAsync(() => settings.getSettings());
		if (!currentResult.ok) return currentResult;
		const current = currentResult.value;
		const existing = readSnippets(current);
		const target = existing.find((snippet) => snippet.id === id);
		if (target === undefined) return ok(undefined); // idempotent

		const deleted = await deleteSecretsFor(target.envEntries);
		if (!deleted.ok) return deleted;

		return saveSnippets(
			current,
			existing.filter((snippet) => snippet.id !== id),
		);
	}

	/** Merge a scope's new entries into `envScopes`, replacing by key, preserving other scopes. */
	function mergeScopeEntries(
		current: PluginSettings,
		scope: EnvironmentScope,
		additions: readonly EnvEntry[],
	): Readonly<Record<string, readonly EnvEntry[]>> {
		const scopes = { ...(current.envScopes ?? {}) };
		const existing = scopes[scope] ?? [];
		const byKey = new Map<string, EnvEntry>(existing.map((entry) => [entry.key, entry]));
		for (const entry of additions) byKey.set(entry.key, entry);
		scopes[scope] = [...byKey.values()];
		return scopes;
	}

	async function apply(id: string): Promise<Result<void>> {
		const currentResult = await tryAsync(() => settings.getSettings());
		if (!currentResult.ok) return currentResult;
		const current = currentResult.value;
		const snippet = readSnippets(current).find((entry) => entry.id === id);
		if (snippet === undefined) return ok(undefined);

		// Infer over `KEY=x` lines — the classifier reads only the key, not the value
		// (a bare key list has no `=` and would classify as nothing).
		const scope =
			snippet.scope ??
			resolveEnvironmentSnippetScope(
				snippet.envEntries.map((entry) => `${entry.key}=x`).join('\n'),
				descriptors,
			) ??
			'shared';
		const merged = mergeScopeEntries(current, scope, snippet.envEntries);
		return tryAsync(() => settings.saveSettings({ ...current, envScopes: merged }));
	}

	async function applyScopeText(
		scope: EnvironmentScope,
		text: string,
	): Promise<Result<{ reviewKeys: readonly string[] }>> {
		const currentResult = await tryAsync(() => settings.getSettings());
		if (!currentResult.ok) return currentResult;
		let working = currentResult.value;

		const updates = getEnvironmentScopeUpdates(text, descriptors, scope);
		for (const update of updates) {
			const splits = splitEntries(update.envText, update.scope, []);
			const written = await writeSecrets(splits);
			if (!written.ok) return written;
			const merged = mergeScopeEntries(
				working,
				update.scope,
				splits.map((split) => split.entry),
			);
			working = { ...working, envScopes: merged };
		}

		const saved = await tryAsync(() => settings.saveSettings(working));
		if (!saved.ok) return saved;
		return ok({ reviewKeys: getEnvironmentReviewKeysForScope(text, scope, descriptors) });
	}

	async function readScope(scope: EnvironmentScope): Promise<Result<readonly EnvEntry[]>> {
		const current = await tryAsync(() => settings.getSettings());
		if (!current.ok) return current;
		// A secretRef entry is returned AS-IS — never resolved (SPEC-SS-013/019).
		return ok(current.value.envScopes?.[scope] ?? []);
	}

	return { list, create, edit, remove, apply, applyScopeText, readScope };
}
