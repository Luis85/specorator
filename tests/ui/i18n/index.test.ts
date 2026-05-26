import { describe, it, expect } from 'vitest';
import { i18nMerge, i18nTranslate, setLocale, toSupportedLocale } from '@/ui/i18n';
import enMessages from '@/ui/i18n/locales/en';
import deMessages from '@/ui/i18n/locales/de';

/** Flatten a nested message tree into the leaf dot-paths. */
function leafKeys(node: unknown, prefix = ''): string[] {
	if (typeof node !== 'object' || node === null) return [prefix];
	return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
		leafKeys(v, prefix === '' ? k : `${prefix}.${k}`),
	);
}

// Snapshot the key sets at MODULE LOAD — before the i18nMerge tests below mutate
// the shared `enMessages` reference in place (vue-i18n holds the same object).
const EN_KEYS_AT_LOAD = new Set(leafKeys(enMessages));
const DE_KEYS_AT_LOAD = new Set(leafKeys(deMessages));

describe('i18nMerge / flatToNested', () => {
	it('merges flat dot-key messages without error', () => {
		expect(() => {
			i18nMerge('en', { 'hello.title': 'Hello' });
		}).not.toThrow();
	});

	it('throws when a leaf key conflicts with an existing parent', () => {
		expect(() => {
			i18nMerge('en', { 'a.b': 'child', a: 'parent' });
		}).toThrow(/i18n key collision/);
	});

	it('throws when a parent traversal conflicts with an existing leaf', () => {
		expect(() => {
			i18nMerge('en', { a: 'leaf', 'a.b': 'child' });
		}).toThrow(/i18n key collision/);
	});

	it('accepts sibling keys without error', () => {
		expect(() => {
			i18nMerge('en', { 'a.x': 'X', 'a.y': 'Y' });
		}).not.toThrow();
	});

	it('rejects __proto__ segment', () => {
		expect(() => {
			i18nMerge('en', { '__proto__.polluted': 'x' });
		}).toThrow(/forbidden segment/);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it('rejects prototype segment', () => {
		expect(() => {
			i18nMerge('en', { 'prototype.polluted': 'x' });
		}).toThrow(/forbidden segment/);
	});

	it('rejects constructor segment', () => {
		expect(() => {
			i18nMerge('en', { 'constructor.polluted': 'x' });
		}).toThrow(/forbidden segment/);
	});

	it('does not treat inherited toString as a colliding parent', () => {
		expect(() => {
			i18nMerge('en', { 'toString.x': 'X' });
		}).not.toThrow();
	});
});

/**
 * T-PSR-006 (TEST-PSR-009 / TEST-PSR-010) — RED: trimmed catalogue exposes the
 * single `agent.empty.placeholder` key (EN + DE) and a centralised
 * `toSupportedLocale` narrowing helper. Fails until T-PSR-007 adds the key and
 * exports `toSupportedLocale`. Traces: REQ-PSR-006, NFR-PSR-003;
 * SPEC-PSR-010/011/012.
 */
describe('locale key parity (en ↔ de)', () => {
	it('en and de declare the EXACT same leaf key set (no missing/extra keys)', () => {
		const missingInDe = [...EN_KEYS_AT_LOAD].filter((k) => !DE_KEYS_AT_LOAD.has(k)).sort();
		const missingInEn = [...DE_KEYS_AT_LOAD].filter((k) => !EN_KEYS_AT_LOAD.has(k)).sort();
		expect(missingInDe, `keys in en but missing in de: ${missingInDe.join(', ')}`).toEqual([]);
		expect(missingInEn, `keys in de but missing in en: ${missingInEn.join(', ')}`).toEqual([]);
	});
});

describe('agent placeholder + locale narrowing (T-PSR-006)', () => {
	it('TEST-PSR-009: agent.empty.placeholder returns EN, then DE after setLocale', () => {
		setLocale('en');
		expect(i18nTranslate('agent.empty.placeholder')).toBe(
			'The Specorator agent panel is empty. Chat lands in a later phase.',
		);
		setLocale('de');
		expect(i18nTranslate('agent.empty.placeholder')).toBe(
			'Das Specorator-Agent-Panel ist leer. Der Chat folgt in einer späteren Phase.',
		);
		setLocale('en');
	});

	it('TEST-PSR-010: toSupportedLocale narrows unknown → en, known → de', () => {
		expect(toSupportedLocale('fr')).toBe('en');
		expect(toSupportedLocale('de')).toBe('de');
	});
});
