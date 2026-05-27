import { describe, it, expect } from 'vitest';
import {
	i18n,
	i18nMerge,
	i18nTranslate,
	setLocale,
	toSupportedLocale,
	SUPPORTED_LOCALES,
	type SupportedLocale,
} from '@/ui/i18n';
import enMessages from '@/ui/i18n/locales/en';
import deMessages from '@/ui/i18n/locales/de';
import esMessages from '@/ui/i18n/locales/es';
import frMessages from '@/ui/i18n/locales/fr';
import jaMessages from '@/ui/i18n/locales/ja';
import koMessages from '@/ui/i18n/locales/ko';
import ptMessages from '@/ui/i18n/locales/pt';
import ruMessages from '@/ui/i18n/locales/ru';
import zhCNMessages from '@/ui/i18n/locales/zh-CN';
import zhTWMessages from '@/ui/i18n/locales/zh-TW';

/** Flatten a nested message tree into the leaf dot-paths. */
function leafKeys(node: unknown, prefix = ''): string[] {
	if (typeof node !== 'object' || node === null) return [prefix];
	return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
		leafKeys(v, prefix === '' ? k : `${prefix}.${k}`),
	);
}

/** Resolve a leaf dot-path to its string value in a catalogue, or undefined. */
function leafValue(node: unknown, key: string): string | undefined {
	let cursor: unknown = node;
	for (const part of key.split('.')) {
		if (typeof cursor !== 'object' || cursor === null) return undefined;
		cursor = (cursor as Record<string, unknown>)[part];
	}
	return typeof cursor === 'string' ? cursor : undefined;
}

/** Extract the `{token}` interpolation multiset (sorted) from a value. */
function placeholderMultiset(value: string): string[] {
	return (value.match(/\{[^}]+\}/g) ?? []).slice().sort();
}

// Map every catalogue to its imported default. SUPPORTED_LOCALES is the source of
// truth for "which locales exist"; this map binds each code to its catalogue so the
// table-driven tests below can iterate `SUPPORTED_LOCALES` directly.
const CATALOGUES: Record<SupportedLocale, unknown> = {
	en: enMessages,
	de: deMessages,
	es: esMessages,
	fr: frMessages,
	ja: jaMessages,
	ko: koMessages,
	pt: ptMessages,
	ru: ruMessages,
	'zh-CN': zhCNMessages,
	'zh-TW': zhTWMessages,
};

// Snapshot the key sets at MODULE LOAD — before the i18nMerge tests below mutate
// the shared catalogue references in place (vue-i18n holds the same objects).
// Snapshot from the IMPORTED catalogue defaults, never from the live vue-i18n
// instance, so the i18nMerge mutation tests cannot perturb the parity/placeholder
// assertions (SPEC-IL-004).
const EN_KEYS_AT_LOAD = new Set(leafKeys(enMessages));
const KEYS_AT_LOAD: Record<SupportedLocale, Set<string>> = Object.fromEntries(
	SUPPORTED_LOCALES.map((code) => [code, new Set(leafKeys(CATALOGUES[code]))]),
) as Record<SupportedLocale, Set<string>>;

const NON_EN_LOCALES = SUPPORTED_LOCALES.filter((code) => code !== 'en');

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
 * T-IL-006 (TEST-IL-001 / TEST-IL-002) — registration completeness + per-catalogue
 * import shape. All ten codes are registered in both SUPPORTED_LOCALES and the
 * vue-i18n `messages` map, the two sets match, and every catalogue resolves to a
 * non-empty object. Traces: SPEC-IL-001/002, REQ-IL-001/002.
 */
describe('registration completeness (T-IL-006)', () => {
	const TEN_CODES = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-CN', 'zh-TW'];

	it('TEST-IL-001: SUPPORTED_LOCALES is exactly the ten charter codes', () => {
		expect(SUPPORTED_LOCALES).toHaveLength(10);
		expect([...SUPPORTED_LOCALES]).toEqual(TEN_CODES);
	});

	it('TEST-IL-001: SUPPORTED_LOCALES set deep-equals the messages-map key set (both size 10)', () => {
		const registered = new Set(SUPPORTED_LOCALES);
		const messageKeys = new Set(Object.keys(i18n.global.messages.value));
		expect(registered.size).toBe(10);
		expect(messageKeys.size).toBe(10);
		expect([...registered].sort()).toEqual([...messageKeys].sort());
	});

	it('TEST-IL-001: every messages entry resolves to a non-empty object', () => {
		for (const code of SUPPORTED_LOCALES) {
			const entry = (i18n.global.messages.value as Record<string, unknown>)[code];
			expect(typeof entry, `messages[${code}] is an object`).toBe('object');
			expect(entry, `messages[${code}] is not null`).not.toBeNull();
			expect(Object.keys(entry as object).length, `messages[${code}] is non-empty`).toBeGreaterThan(
				0,
			);
		}
	});

	it.each(NON_EN_LOCALES)(
		'TEST-IL-002: catalogue %s default-exports an object with >=1 leaf string',
		(code) => {
			const keys = leafKeys(CATALOGUES[code]);
			expect(keys.length, `${code} has at least one leaf`).toBeGreaterThan(0);
			const firstValue = leafValue(CATALOGUES[code], keys[0]);
			expect(typeof firstValue, `${code} first leaf is a string`).toBe('string');
		},
	);
});

/**
 * T-IL-003 (TEST-IL-003 / TEST-IL-004) — all-ten-against-en key parity, replacing
 * the P7 en↔de-only assertion. Table-driven over every non-en locale; each must
 * declare the EXACT en leaf keyset (no missing, no extra), with a failure message
 * naming the offending locale + keys. Snapshot-at-load dodges the i18nMerge
 * mutation. Traces: SPEC-IL-004, REQ-IL-003/004, EC-IL-003/004.
 */
describe('locale key parity (all ten against en)', () => {
	it.each(NON_EN_LOCALES)(
		'TEST-IL-003/004: %s declares the EXACT en leaf key set (no missing/extra)',
		(code) => {
			const localeKeys = KEYS_AT_LOAD[code];
			const missingInLocale = [...EN_KEYS_AT_LOAD].filter((k) => !localeKeys.has(k)).sort();
			const extraInLocale = [...localeKeys].filter((k) => !EN_KEYS_AT_LOAD.has(k)).sort();
			expect(
				missingInLocale,
				`keys in en but missing in ${code}: ${missingInLocale.join(', ')}`,
			).toEqual([]);
			expect(extraInLocale, `keys in ${code} but missing in en: ${extraInLocale.join(', ')}`).toEqual(
				[],
			);
		},
	);
});

/**
 * T-IL-004 (TEST-IL-008) — placeholder-multiset parity. For every en leaf key, each
 * non-en locale's `{token}` multiset must equal en's. A dropped (EC-IL-001) or
 * renamed (EC-IL-002) placeholder fails; a leaf with no placeholders passes
 * trivially (EC-IL-009). Traces: SPEC-IL-005, REQ-IL-008.
 */
describe('placeholder-multiset parity (all ten against en)', () => {
	it.each(NON_EN_LOCALES)(
		'TEST-IL-008: %s preserves the {token} multiset of every en leaf',
		(code) => {
			const offenders: string[] = [];
			for (const key of EN_KEYS_AT_LOAD) {
				const enValue = leafValue(enMessages, key);
				const localeValue = leafValue(CATALOGUES[code], key);
				if (enValue === undefined || localeValue === undefined) continue;
				const enTokens = placeholderMultiset(enValue);
				const localeTokens = placeholderMultiset(localeValue);
				if (enTokens.join('|') !== localeTokens.join('|')) {
					offenders.push(
						`${key}: en[${enTokens.join(',')}] vs ${code}[${localeTokens.join(',')}]`,
					);
				}
			}
			expect(offenders, `${code} placeholder mismatches:\n${offenders.join('\n')}`).toEqual([]);
		},
	);
});

/**
 * T-PSR-006 (TEST-PSR-009) — the trimmed-catalogue agent placeholder still renders
 * EN then DE after setLocale; preserved through the P11 widen. Traces: REQ-PSR-006.
 */
describe('agent placeholder (T-PSR-006)', () => {
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
});

/**
 * T-IL-006 (TEST-IL-005 / TEST-IL-006) — toSupportedLocale narrows each of the ten
 * (incl. the regional zh-CN/zh-TW tags) to itself, and maps anything else to 'en'
 * (case-sensitive, no regional collapse). Traces: SPEC-IL-001, REQ-IL-005/006,
 * EC-IL-006/007.
 */
describe('toSupportedLocale narrowing (T-IL-006)', () => {
	it.each(SUPPORTED_LOCALES)('TEST-IL-005: narrows %s to itself', (code) => {
		expect(toSupportedLocale(code)).toBe(code);
	});

	it('TEST-IL-006: unknown / case-mismatched / regional-non-member codes fall back to en', () => {
		expect(toSupportedLocale('it')).toBe('en');
		expect(toSupportedLocale('zh')).toBe('en');
		expect(toSupportedLocale('')).toBe('en');
		expect(toSupportedLocale('EN')).toBe('en');
		expect(toSupportedLocale('de-DE')).toBe('en');
	});
});

/**
 * T-IL-006 (TEST-IL-011) — missing-translation fallback. With a non-en locale
 * active, a key absent from a synthetic partially-merged locale but present in en
 * resolves the en string and never throws (fallbackLocale: 'en' honoured). Exercised
 * via a synthetic merge, NOT a real catalogue gap — the parity test already makes a
 * real gap a red build (SPEC-IL-008, EC-IL-008). Traces: REQ-IL-011, NFR-IL-004.
 */
describe('missing-key fallback (T-IL-006)', () => {
	it('TEST-IL-011: a key missing from the active non-en locale resolves the en string, no throw', () => {
		const fallbackKey = 'il.fallback.probe';
		const enValue = 'Fallback probe value';
		// Register the probe only under en; leave a non-en locale (es) without it.
		i18nMerge('en', { [fallbackKey]: enValue });
		setLocale('es');
		let resolved: string | undefined;
		expect(() => {
			resolved = i18nTranslate(fallbackKey);
		}).not.toThrow();
		expect(resolved).toBe(enValue);
		setLocale('en');
	});
});
