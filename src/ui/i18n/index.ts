import { createI18n } from 'vue-i18n';
import type en from './locales/en';
import enMessages from './locales/en';
import deMessages from './locales/de';
import esMessages from './locales/es';
import frMessages from './locales/fr';
import jaMessages from './locales/ja';
import koMessages from './locales/ko';
import ptMessages from './locales/pt';
import ruMessages from './locales/ru';
import zhCNMessages from './locales/zh-CN';
import zhTWMessages from './locales/zh-TW';

/** Type of the EN message catalogue — used for component type-safety. */
export type MessageSchema = typeof en;
export type SupportedLocale =
	| 'en'
	| 'de'
	| 'es'
	| 'fr'
	| 'ja'
	| 'ko'
	| 'pt'
	| 'ru'
	| 'zh-CN'
	| 'zh-TW';

// en first (so fallbackLocale + the keyset authority are unambiguous), de second
// (the existing locale), then the eight new codes alphabetically with the two
// regional zh-* tags last (SPEC-IL-001).
export const SUPPORTED_LOCALES: SupportedLocale[] = [
	'en',
	'de',
	'es',
	'fr',
	'ja',
	'ko',
	'pt',
	'ru',
	'zh-CN',
	'zh-TW',
];

/**
 * Narrow an arbitrary stored `locale` string to a `SupportedLocale`, falling
 * back to `'en'` for anything outside the catalogue (SPEC-PSR-012). The single
 * narrowing helper shared by every `setLocale` call site, so a stale/foreign
 * blob value (e.g. `'it'`) never reaches `setLocale` as an unsafe cast.
 */
export function toSupportedLocale(locale: string): SupportedLocale {
	return (SUPPORTED_LOCALES as readonly string[]).includes(locale)
		? (locale as SupportedLocale)
		: 'en';
}

export const i18n = createI18n({
	legacy: false,
	locale: 'en',
	fallbackLocale: 'en',
	// Typed as unknown to avoid literal-type conflicts between locale files;
	// vue-i18n still validates keys at runtime.
	messages: {
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
	} as unknown as Record<SupportedLocale, MessageSchema>,
});

export function setLocale(locale: SupportedLocale): void {
	const ref = (i18n.global as { locale: { value: SupportedLocale } }).locale;
	ref.value = locale;
}

const FORBIDDEN_KEY_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function assertSafeSegments(key: string, parts: ReadonlyArray<string>): void {
	for (const part of parts) {
		if (FORBIDDEN_KEY_SEGMENTS.has(part)) {
			throw new Error(`i18n key "${key}" contains forbidden segment "${part}"`);
		}
	}
}

function descendOrCreate(
	current: Record<string, unknown>,
	parts: ReadonlyArray<string>,
	upTo: number,
): Record<string, unknown> {
	let cursor = current;
	for (let i = 0; i < upTo; i++) {
		const part = parts[i];
		if (Object.hasOwn(cursor, part)) {
			const existing = cursor[part];
			if (typeof existing !== 'object' || existing === null) {
				throw new Error(
					`i18n key collision: "${parts.slice(0, i + 1).join('.')}" is both a leaf and a parent`,
				);
			}
		} else {
			cursor[part] = Object.create(null) as Record<string, unknown>;
		}
		cursor = cursor[part] as Record<string, unknown>;
	}
	return cursor;
}

function setLeaf(
	parent: Record<string, unknown>,
	leaf: string,
	fullKey: string,
	value: string,
): void {
	if (Object.hasOwn(parent, leaf) && typeof parent[leaf] === 'object' && parent[leaf] !== null) {
		throw new Error(`i18n key collision: "${fullKey}" conflicts with existing parent key`);
	}
	parent[leaf] = value;
}

function flatToNested(flat: Record<string, string>): Record<string, unknown> {
	const nested: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
	for (const [key, value] of Object.entries(flat)) {
		const parts = key.split('.');
		assertSafeSegments(key, parts);
		const parent = descendOrCreate(nested, parts, parts.length - 1);
		setLeaf(parent, parts[parts.length - 1], key, value);
	}
	return nested;
}

interface I18nGlobalMerge {
	mergeLocaleMessage(locale: string, messages: Record<string, unknown>): void;
	t(key: string, params: Record<string, unknown>): string;
}

const globalMerge = i18n.global as unknown as I18nGlobalMerge;

export function i18nMerge(locale: string, messages: Record<string, string>): void {
	globalMerge.mergeLocaleMessage(locale, flatToNested(messages));
}

export function i18nTranslate(key: string, params?: Record<string, unknown>): string {
	return globalMerge.t(key, params ?? {});
}
