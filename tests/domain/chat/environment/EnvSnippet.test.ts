/**
 * T-SS-006 (TEST-SS-060 codec leg / TEST-SS-067) — RED: the `EnvSnippet` shapes
 * (`EnvironmentScope` / `EnvEntry` / `EnvSnippetStruct`), the PURE byte-parity
 * `parseEnvironmentVariables`, the PURE `serializeEnvEntries` (inline verbatim,
 * secretRef MASKED — never the resolved value), and the PURE `parseContextLimit`
 * (k/m multiplier + the [1_000, 10_000_000] bounds + null-on-invalid + never-throws).
 * Regrown 1:1 from claudian `utils/env.ts:325-345/428-451` + `core/types/settings.ts`.
 *
 * Fails until T-SS-007 adds `src/domain/chat/environment/EnvSnippet.ts`.
 *
 * Traces: TEST-SS-060, TEST-SS-067, SPEC-SS-003,
 * REQ-SS-014/050/060/064/066/067, EC-SS-12.
 */
import { describe, it, expect } from 'vitest';
import {
	parseEnvironmentVariables,
	serializeEnvEntries,
	parseContextLimit,
	MIN_CONTEXT_LIMIT,
	MAX_CONTEXT_LIMIT,
	type EnvEntry,
	type EnvironmentScope,
	type EnvSnippetStruct,
} from '@/domain/chat/environment/EnvSnippet';

describe('EnvSnippet shapes (SPEC-SS-003)', () => {
	it('the EnvironmentScope / EnvEntry / EnvSnippetStruct shapes compile', () => {
		const shared: EnvironmentScope = 'shared';
		const provider: EnvironmentScope = 'provider:codex';
		const inline: EnvEntry = { key: 'FOO', value: { kind: 'inline', text: 'bar' } };
		const secret: EnvEntry = { key: 'SEC', value: { kind: 'secretRef', secretRef: 'env.shared.SEC' } };
		const struct: EnvSnippetStruct = {
			id: 's1',
			name: 'prod',
			description: '',
			scope: provider,
			envEntries: [inline, secret],
			contextLimits: { 'gpt-x': 200_000 },
		};
		expect(shared).toBe('shared');
		expect(struct.envEntries).toHaveLength(2);
	});
});

describe('parseEnvironmentVariables (byte-parity, SPEC-SS-003)', () => {
	it('parses KEY=value pairs', () => {
		expect(parseEnvironmentVariables('FOO=bar\nBAZ=qux')).toEqual({ FOO: 'bar', BAZ: 'qux' });
	});

	it('trims, skips blank + # comment lines', () => {
		expect(parseEnvironmentVariables('  \n# a comment\nFOO=bar\n')).toEqual({ FOO: 'bar' });
	});

	it('strips a leading "export " prefix', () => {
		expect(parseEnvironmentVariables('export FOO=bar')).toEqual({ FOO: 'bar' });
	});

	it('splits on the FIRST = (values may contain =)', () => {
		expect(parseEnvironmentVariables('URL=http://x?a=b')).toEqual({ URL: 'http://x?a=b' });
	});

	it('unquotes a wrapping " or single quote', () => {
		expect(parseEnvironmentVariables('A="quoted"\nB=\'single\'')).toEqual({ A: 'quoted', B: 'single' });
	});

	it('drops an empty key (no leading =)', () => {
		expect(parseEnvironmentVariables('=novalue\nFOO=bar')).toEqual({ FOO: 'bar' });
	});

	it('is total — never throws', () => {
		expect(() => parseEnvironmentVariables('')).not.toThrow();
		expect(() => parseEnvironmentVariables('garbage no equals')).not.toThrow();
	});
});

describe('serializeEnvEntries (mask secrets, SPEC-SS-003, REQ-SS-014)', () => {
	it('renders an inline value verbatim KEY=text', () => {
		expect(serializeEnvEntries([{ key: 'FOO', value: { kind: 'inline', text: 'bar' } }])).toBe('FOO=bar');
	});

	it('MASKS a secretRef — the resolved value never re-enters the output', () => {
		const out = serializeEnvEntries([
			{ key: 'OPENAI_API_KEY', value: { kind: 'secretRef', secretRef: 'env.provider:codex.OPENAI_API_KEY' } },
		]);
		expect(out).toContain('OPENAI_API_KEY=');
		expect(out).not.toContain('env.provider:codex.OPENAI_API_KEY');
		expect(out).toMatch(/OPENAI_API_KEY=•+/);
	});

	it('renders a mix of inline + masked secret, one per line', () => {
		const out = serializeEnvEntries([
			{ key: 'FOO', value: { kind: 'inline', text: 'bar' } },
			{ key: 'SEC', value: { kind: 'secretRef', secretRef: 'env.shared.SEC' } },
		]);
		expect(out.split('\n')).toHaveLength(2);
		expect(out.split('\n')[0]).toBe('FOO=bar');
	});

	it('is total — never throws on empty', () => {
		expect(() => serializeEnvEntries([])).not.toThrow();
		expect(serializeEnvEntries([])).toBe('');
	});
});

describe('parseContextLimit (k/m + bounds, SPEC-SS-003, TEST-SS-067, EC-SS-12)', () => {
	it('exports the [1_000, 10_000_000] bounds', () => {
		expect(MIN_CONTEXT_LIMIT).toBe(1_000);
		expect(MAX_CONTEXT_LIMIT).toBe(10_000_000);
	});

	it('parses a plain integer in-bounds', () => {
		expect(parseContextLimit('200000')).toBe(200_000);
	});

	it('applies the k/m multiplier', () => {
		expect(parseContextLimit('200k')).toBe(200_000);
		expect(parseContextLimit('1m')).toBe(1_000_000);
		expect(parseContextLimit('1.5m')).toBe(1_500_000);
	});

	it('strips commas + lowercases', () => {
		expect(parseContextLimit('200,000')).toBe(200_000);
		expect(parseContextLimit('1M')).toBe(1_000_000);
	});

	it('REJECTS (→ null) out-of-bounds or invalid input — never throws', () => {
		expect(parseContextLimit('999')).toBeNull(); // below MIN
		expect(parseContextLimit('20m')).toBeNull(); // above MAX
		expect(parseContextLimit('')).toBeNull();
		expect(parseContextLimit('abc')).toBeNull();
		expect(parseContextLimit('-5k')).toBeNull();
		expect(parseContextLimit('0')).toBeNull();
		expect(() => parseContextLimit('garbage')).not.toThrow();
	});
});
