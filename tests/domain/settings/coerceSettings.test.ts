/**
 * T-SS-002 (TEST-SS-092/093 coerce leg) — RED: the six P10 `coerce*` helpers +
 * `envSecretKey`. Each coercer is pure/total (never throws) and applies the
 * SPEC-SS-001 load-or-default table; a recorded valid value round-trips; absent/
 * garbage → the OPTIONAL field stays absent (no migration, NFR-SS-001/SPEC-SS-020).
 * `envSecretKey(scope, key) === 'env.<scope>.<key>'` (mirrors providerSecretKey).
 *
 * Fails until T-SS-003 adds the helpers (depends on T-SS-007 codec + T-SS-011 nav).
 *
 * Traces: TEST-SS-092, TEST-SS-093, SPEC-SS-001, SPEC-SS-020,
 * REQ-SS-021/060/067/070/071/083/092, NFR-SS-001/004.
 */
import { describe, it, expect } from 'vitest';
import {
	coerceEnvSnippets,
	coerceEnvScopes,
	coerceKeyboardNav,
	coerceProviderDefaultModel,
	coercePermissionMode,
	coerceProviderCliPath,
	envSecretKey,
} from '@/domain/settings/PluginSettings';
import type { EnvSnippetStruct } from '@/domain/chat/environment/EnvSnippet';

describe('envSecretKey (SPEC-SS-001)', () => {
	it('is the deterministic env.<scope>.<key> namespace', () => {
		expect(envSecretKey('shared', 'FOO')).toBe('env.shared.FOO');
		expect(envSecretKey('provider:codex', 'OPENAI_API_KEY')).toBe(
			'env.provider:codex.OPENAI_API_KEY',
		);
	});
});

describe('coerceEnvSnippets (SPEC-SS-001)', () => {
	it('returns undefined for non-array / empty input', () => {
		expect(coerceEnvSnippets(undefined)).toBeUndefined();
		expect(coerceEnvSnippets(null)).toBeUndefined();
		expect(coerceEnvSnippets('nope')).toBeUndefined();
		expect(coerceEnvSnippets([])).toBeUndefined();
	});

	it('drops structs without a non-empty string id+name', () => {
		expect(coerceEnvSnippets([{ name: 'x', envEntries: [] }])).toBeUndefined();
		expect(coerceEnvSnippets([{ id: '', name: 'x', envEntries: [] }])).toBeUndefined();
		expect(coerceEnvSnippets([{ id: 's', name: '', envEntries: [] }])).toBeUndefined();
	});

	it('keeps a valid struct, coerces description to string-or-empty, drops bad entries', () => {
		const raw = [
			{
				id: 's1',
				name: 'prod',
				envEntries: [
					{ key: 'FOO', value: { kind: 'inline', text: 'bar' } },
					{ key: 'SEC', value: { kind: 'secretRef', secretRef: 'env.shared.SEC' } },
					{ key: '', value: { kind: 'inline', text: 'dropme' } }, // empty key dropped
					{ key: 'BAD', value: { kind: 'nope' } }, // bad value-shape dropped
				],
			},
		];
		const out = coerceEnvSnippets(raw);
		expect(out).toBeDefined();
		const struct = out?.[0] as EnvSnippetStruct;
		expect(struct.id).toBe('s1');
		expect(struct.name).toBe('prod');
		expect(struct.description).toBe('');
		expect(struct.envEntries).toHaveLength(2);
		expect(struct.envEntries[0]).toEqual({ key: 'FOO', value: { kind: 'inline', text: 'bar' } });
	});

	it('keeps scope only when a valid EnvironmentScope, contextLimits only finite positives', () => {
		const out = coerceEnvSnippets([
			{
				id: 's1',
				name: 'n',
				scope: 'provider:codex',
				contextLimits: { 'gpt-x': 200_000, bad: -1, nan: Number.NaN },
				envEntries: [{ key: 'K', value: { kind: 'inline', text: 'v' } }],
			},
			{ id: 's2', name: 'n2', scope: 'provider:bogus', envEntries: [{ key: 'K', value: { kind: 'inline', text: 'v' } }] },
		]);
		expect(out?.[0]?.scope).toBe('provider:codex');
		expect(out?.[0]?.contextLimits).toEqual({ 'gpt-x': 200_000 });
		expect(out?.[1]?.scope).toBeUndefined(); // bogus scope dropped, struct kept
	});

	it('round-trips a recorded valid value (coerce is idempotent)', () => {
		const value: readonly EnvSnippetStruct[] = [
			{ id: 's1', name: 'prod', description: 'desc', scope: 'shared', envEntries: [{ key: 'FOO', value: { kind: 'inline', text: 'bar' } }] },
		];
		expect(coerceEnvSnippets(value as unknown)).toEqual(value);
	});

	it('never throws', () => {
		expect(() => coerceEnvSnippets(Symbol('x') as unknown)).not.toThrow();
		expect(() => coerceEnvSnippets([{ id: 1, name: 2 }] as unknown)).not.toThrow();
	});
});

describe('coerceEnvScopes (SPEC-SS-001)', () => {
	it('returns undefined for non-object / empty', () => {
		expect(coerceEnvScopes(undefined)).toBeUndefined();
		expect(coerceEnvScopes([])).toBeUndefined();
		expect(coerceEnvScopes({})).toBeUndefined();
	});

	it('keeps only valid EnvironmentScope keys with valid EnvEntry[] values', () => {
		const out = coerceEnvScopes({
			shared: [{ key: 'FOO', value: { kind: 'inline', text: 'bar' } }],
			'provider:codex': [{ key: 'OPENAI_API_KEY', value: { kind: 'secretRef', secretRef: 'env.provider:codex.OPENAI_API_KEY' } }],
			'provider:bogus': [{ key: 'X', value: { kind: 'inline', text: 'y' } }],
			notascope: [{ key: 'X', value: { kind: 'inline', text: 'y' } }],
		});
		expect(Object.keys(out ?? {}).sort()).toEqual(['provider:codex', 'shared']);
	});

	it('round-trips + never throws', () => {
		const value = { shared: [{ key: 'FOO', value: { kind: 'inline' as const, text: 'bar' } }] };
		expect(coerceEnvScopes(value as unknown)).toEqual(value);
		expect(() => coerceEnvScopes(42)).not.toThrow();
	});
});

describe('coerceKeyboardNav (SPEC-SS-001)', () => {
	it('returns the record for three valid single-char unique keys', () => {
		expect(coerceKeyboardNav({ scrollUpKey: 'w', scrollDownKey: 's', focusInputKey: 'i' })).toEqual({
			scrollUpKey: 'w',
			scrollDownKey: 's',
			focusInputKey: 'i',
		});
	});

	it('returns undefined for invalid / non-unique / multi-char / garbage', () => {
		expect(coerceKeyboardNav(undefined)).toBeUndefined();
		expect(coerceKeyboardNav('nope')).toBeUndefined();
		expect(coerceKeyboardNav({ scrollUpKey: 'ww', scrollDownKey: 's', focusInputKey: 'i' })).toBeUndefined();
		expect(coerceKeyboardNav({ scrollUpKey: 'w', scrollDownKey: 'w', focusInputKey: 'i' })).toBeUndefined();
		expect(coerceKeyboardNav({ scrollUpKey: 'w' })).toBeUndefined();
	});

	it('never throws', () => {
		expect(() => coerceKeyboardNav(Symbol('x') as unknown)).not.toThrow();
	});
});

describe('coerceProviderDefaultModel / coerceProviderCliPath (SPEC-SS-001)', () => {
	it('keep only valid ProviderId keys with non-empty string values', () => {
		expect(
			coerceProviderDefaultModel({ claude: 'opus', codex: 'gpt-5', bogus: 'x', opencode: '' }),
		).toEqual({ claude: 'opus', codex: 'gpt-5' });
		expect(coerceProviderCliPath({ codex: '/bin/codex', bogus: '/x', claude: 5 })).toEqual({
			codex: '/bin/codex',
		});
	});

	it('return undefined for non-object / empty / never throw', () => {
		expect(coerceProviderDefaultModel(undefined)).toBeUndefined();
		expect(coerceProviderDefaultModel({})).toBeUndefined();
		expect(coerceProviderCliPath([])).toBeUndefined();
		expect(coerceProviderCliPath({ bogus: 'x' })).toBeUndefined();
		expect(() => coerceProviderDefaultModel(42)).not.toThrow();
	});
});

describe('coercePermissionMode (SPEC-SS-001)', () => {
	it('keeps a valid PermissionMode, else undefined', () => {
		expect(coercePermissionMode('normal')).toBe('normal');
		expect(coercePermissionMode('plan')).toBe('plan');
		expect(coercePermissionMode('yolo')).toBe('yolo');
		expect(coercePermissionMode('bogus')).toBeUndefined();
		expect(coercePermissionMode(undefined)).toBeUndefined();
		expect(() => coercePermissionMode(42)).not.toThrow();
	});
});
