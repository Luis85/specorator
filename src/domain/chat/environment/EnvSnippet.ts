/**
 * The env-snippet shape + the pure codec + the context-limit parser (SPEC-SS-003,
 * ADR-SS-001). Regrown 1:1 from claudian `core/types/settings.ts:17-24`
 * (`EnvSnippet`) + `utils/env.ts:325-345` (`parseEnvironmentVariables`) +
 * `utils/env.ts:428-451` (`parseContextLimit` + the bounds), with the secret-split
 * shape (`EnvEntry` inline | secretRef) layered on (REQ-SS-066). Pure data + pure
 * functions — total, never throw; no `obsidian`/`node:*`/Vue/class (ADR-001/004).
 */
import type { ProviderId } from '@/domain/chat/ProviderId';

/** A persisted env scope: the shared scope or a single provider's scope (REQ-SS-050). */
export type EnvironmentScope = 'shared' | `provider:${ProviderId}`;

/**
 * One env entry — either an inline (non-secret) value held device-local, or a
 * secretRef pointing at `SecretStorePort` under `env.<scope>.<KEY>` (ADR-SS-001,
 * REQ-SS-066). The plaintext secret NEVER lives here.
 */
export interface EnvEntry {
	readonly key: string;
	readonly value:
		| { readonly kind: 'inline'; readonly text: string }
		| { readonly kind: 'secretRef'; readonly secretRef: string };
}

/** A persisted snippet — the NON-SECRET structure (device-local via SettingsPort). */
export interface EnvSnippetStruct {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly scope?: EnvironmentScope;
	readonly envEntries: readonly EnvEntry[];
	/** REQ-SS-067 (sequenced last): per-model context limits. */
	readonly contextLimits?: Readonly<Record<string, number>>;
}

/** The display mask for a secretRef entry — the resolved value never re-enters the DOM (REQ-SS-014). */
const SECRET_MASK = '••••••';

/** Strip a wrapping pair of matching `"` or `'` from a trimmed value. Pure/total. */
function unquoteEnvValue(value: string): string {
	const wrapped =
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"));
	return wrapped ? value.slice(1, -1) : value;
}

/**
 * PURE: parse env text → key/value pairs (regrown `parseEnvironmentVariables`):
 * trims each line, skips blank + `#` comment lines, strips a leading `export `,
 * splits on the FIRST `=`, unquotes a wrapping `"`/`'`, drops an empty key. Total.
 */
export function parseEnvironmentVariables(input: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const line of input.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const normalized = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed;
		const eqIndex = normalized.indexOf('=');
		if (eqIndex <= 0) continue;
		const key = normalized.slice(0, eqIndex).trim();
		if (!key) continue;
		result[key] = unquoteEnvValue(normalized.slice(eqIndex + 1).trim());
	}
	return result;
}

/**
 * PURE: serialise `EnvEntry[]` back to env text — an inline value renders verbatim
 * (`KEY=text`); a `secretRef` renders as a MASKED placeholder line (`KEY=••••••`)
 * for display ONLY, never the resolved value (REQ-SS-014, SPEC-SS-017). Total.
 */
export function serializeEnvEntries(entries: readonly EnvEntry[]): string {
	return entries
		.map((entry) =>
			entry.value.kind === 'inline'
				? `${entry.key}=${entry.value.text}`
				: `${entry.key}=${SECRET_MASK}`,
		)
		.join('\n');
}

/** The context-limit bounds (regrown `utils/env.ts:428-429`). */
export const MIN_CONTEXT_LIMIT = 1_000 as const;
export const MAX_CONTEXT_LIMIT = 10_000_000 as const;

const CONTEXT_LIMIT_MULTIPLIERS: Readonly<Record<string, number>> = { k: 1_000, m: 1_000_000 };

/**
 * PURE: the context-limit parser (regrown `parseContextLimit`): trims/lowercases,
 * strips commas, matches `\d+(.\d+)?(k|m)?`, applies the k/m multiplier, REJECTS
 * (→ `null`) outside `[MIN_CONTEXT_LIMIT, MAX_CONTEXT_LIMIT]` or on bad input
 * (REQ-SS-067, EC-SS-12). Total — never throws.
 */
export function parseContextLimit(input: string): number | null {
	const trimmed = input.trim().toLowerCase().replace(/,/g, '');
	if (!trimmed) return null;

	const match = /^(\d+(?:\.\d+)?)\s*(k|m)?$/.exec(trimmed);
	if (!match) return null;

	const value = Number.parseFloat(match[1]);
	if (!Number.isFinite(value) || value <= 0) return null;

	const suffix = match[2];
	const multiplier = suffix ? (CONTEXT_LIMIT_MULTIPLIERS[suffix] ?? 1) : 1;
	const result = Math.round(value * multiplier);

	if (result < MIN_CONTEXT_LIMIT || result > MAX_CONTEXT_LIMIT) return null;
	return result;
}
