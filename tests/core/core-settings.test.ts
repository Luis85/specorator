/**
 * Plugin shell reboot (P0) — `coreSettingsModule` load-or-default contract.
 *
 * Tests for T-PSR-001 / T-PSR-002 (TEST-PSR-001..007). They encode the
 * load-or-default, no-backwards-compat contract from SPEC-PSR-002/003/004: a
 * `validateSettings` with **no** `migrate` and **no** `settingsVersion` bump that
 * ignores unknown keys.
 *
 * P3 (SPEC-TS-005, T-TS-006) grows the settings additively with
 * `sessionsFolder`/`maxTabs` (resolved/clamped through the pure helpers on save).
 * The exact-shape expectations carry the defaulted fields; the no-migration
 * invariant is unchanged.
 *
 * Traces: REQ-PSR-005/006/008/013, SPEC-PSR-001/002/003/004, SPEC-TS-005;
 * CHARTER-REQ-FRESH / NG8.
 */
import { describe, it, expect } from 'vitest';
import { coreSettingsModule } from '@/core/core-settings';
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings';

const validate = (raw: unknown): PluginSettings => {
	const fn = coreSettingsModule.validateSettings;
	if (!fn) throw new Error('validateSettings is undefined');
	return fn(raw);
};

describe('coreSettingsModule — load-or-default (T-PSR-001)', () => {
	it('TEST-PSR-001: validateSettings(null) → DEFAULT_SETTINGS (load-or-default)', () => {
		expect(validate(null)).toEqual(DEFAULT_SETTINGS);
	});

	it('TEST-PSR-001: validateSettings(undefined) → DEFAULT_SETTINGS', () => {
		expect(validate(undefined)).toEqual(DEFAULT_SETTINGS);
	});

	it('TEST-PSR-002: module declares no `migrate` method (no backwards compat)', () => {
		expect(coreSettingsModule.migrate).toBeUndefined();
	});

	it('TEST-PSR-002: module does not set/bump `settingsVersion`', () => {
		expect(coreSettingsModule.settingsVersion).toBeUndefined();
	});

	it('TEST-PSR-003: unknown keys are ignored, never returned', () => {
		expect(validate({ locale: 'de', logLevel: 'info', specsFolder: 'x' })).toEqual({
			...DEFAULT_SETTINGS,
			locale: 'de',
			logLevel: 'info',
		});
	});

	it.each(['garbage', 42, ['a']])(
		'TEST-PSR-004: corrupt non-object (%p) → DEFAULT_SETTINGS',
		(corrupt) => {
			expect(validate(corrupt)).toEqual(DEFAULT_SETTINGS);
		},
	);
});

describe('coreSettingsModule — validate / schema / defaults (T-PSR-002)', () => {
	it('TEST-PSR-005: empty object → defaults; invalid logLevel → warn; non-string locale → en', () => {
		expect(validate({})).toEqual(DEFAULT_SETTINGS);
		expect(validate({ logLevel: 'verbose' })).toEqual(DEFAULT_SETTINGS);
		expect(validate({ locale: 42 })).toEqual(DEFAULT_SETTINGS);
	});

	it('TEST-PSR-005: a valid slim blob is returned verbatim (with P3 fields defaulted)', () => {
		expect(validate({ locale: 'de', logLevel: 'info' })).toEqual({
			...DEFAULT_SETTINGS,
			locale: 'de',
			logLevel: 'info',
		});
	});

	it('TEST-PSR-005: a partial blob (only logLevel) fills locale from default', () => {
		expect(validate({ logLevel: 'error' })).toEqual({ ...DEFAULT_SETTINGS, logLevel: 'error' });
	});

	it('TEST-TS-005: validateSettings resolves/clamps the P3 fields through the helpers', () => {
		expect(validate({ sessionsFolder: '/notes//sessions/', maxTabs: 99 })).toEqual({
			...DEFAULT_SETTINGS,
			sessionsFolder: 'notes/sessions',
			maxTabs: 10,
		});
		expect(validate({ sessionsFolder: '   ', maxTabs: 0 })).toEqual({
			...DEFAULT_SETTINGS,
			sessionsFolder: DEFAULT_SETTINGS.sessionsFolder,
			maxTabs: 1,
		});
	});

	it('TEST-PSR-006 / SPEC-TS-005: settingsSchema.fields are [locale, logLevel, sessionsFolder, maxTabs]', () => {
		const fields = coreSettingsModule.settingsSchema?.fields ?? [];
		expect(fields.map((f) => f.key)).toEqual(['locale', 'logLevel', 'sessionsFolder', 'maxTabs']);
		expect(fields.map((f) => f.type)).toEqual(['dropdown', 'dropdown', 'text', 'number']);
	});

	it('TEST-PSR-007 / SPEC-TS-005 / SPEC-CP-005: DEFAULT_SETTINGS keys are [customSystemPrompt, locale, logLevel, maxTabs, sessionsFolder]', () => {
		// P4 (SPEC-CP-005) adds the device-local customSystemPrompt additively.
		expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual([
			'customSystemPrompt',
			'locale',
			'logLevel',
			'maxTabs',
			'sessionsFolder',
		]);
	});
});
