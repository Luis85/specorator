/**
 * Plugin shell reboot (P0) — `coreSettingsModule` load-or-default contract.
 *
 * RED tests for T-PSR-001 / T-PSR-002 (TEST-PSR-001..007). They encode the
 * slim, no-backwards-compat contract from SPEC-PSR-002/003/004: load-or-default
 * settings with **no** `migrate` and **no** `settingsVersion` bump, a two-field
 * `validateSettings` (`{ locale, logLevel }`) that ignores unknown keys, and a
 * two-dropdown schema. They fail against the current fat module (16 fields,
 * `migrate()`, `settingsVersion: 3`) and go GREEN after T-PSR-003/004.
 *
 * Traces: REQ-PSR-005/006/008/013; SPEC-PSR-001/002/003/004; CHARTER-REQ-FRESH / NG8.
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
		expect(validate(null)).toEqual({ locale: 'en', logLevel: 'warn' });
	});

	it('TEST-PSR-001: validateSettings(undefined) → DEFAULT_SETTINGS', () => {
		expect(validate(undefined)).toEqual({ locale: 'en', logLevel: 'warn' });
	});

	it('TEST-PSR-002: module declares no `migrate` method (no backwards compat)', () => {
		expect(coreSettingsModule.migrate).toBeUndefined();
	});

	it('TEST-PSR-002: module does not set/bump `settingsVersion`', () => {
		expect(coreSettingsModule.settingsVersion).toBeUndefined();
	});

	it('TEST-PSR-003: unknown keys are ignored, never returned', () => {
		expect(validate({ locale: 'de', logLevel: 'info', specsFolder: 'x' })).toEqual({
			locale: 'de',
			logLevel: 'info',
		});
	});

	it.each(['garbage', 42, ['a']])(
		'TEST-PSR-004: corrupt non-object (%p) → DEFAULT_SETTINGS',
		(corrupt) => {
			expect(validate(corrupt)).toEqual({ locale: 'en', logLevel: 'warn' });
		},
	);
});

describe('coreSettingsModule — validate / schema / defaults (T-PSR-002)', () => {
	it('TEST-PSR-005: empty object → defaults; invalid logLevel → warn; non-string locale → en', () => {
		expect(validate({})).toEqual({ locale: 'en', logLevel: 'warn' });
		expect(validate({ logLevel: 'verbose' })).toEqual({ locale: 'en', logLevel: 'warn' });
		expect(validate({ locale: 42 })).toEqual({ locale: 'en', logLevel: 'warn' });
	});

	it('TEST-PSR-005: a valid slim blob is returned verbatim', () => {
		expect(validate({ locale: 'de', logLevel: 'info' })).toEqual({
			locale: 'de',
			logLevel: 'info',
		});
	});

	it('TEST-PSR-005: a partial blob (only logLevel) fills locale from default', () => {
		expect(validate({ logLevel: 'error' })).toEqual({ locale: 'en', logLevel: 'error' });
	});

	it('TEST-PSR-006: settingsSchema.fields keys are exactly [locale, logLevel], both dropdowns', () => {
		const fields = coreSettingsModule.settingsSchema?.fields ?? [];
		expect(fields.map((f) => f.key)).toEqual(['locale', 'logLevel']);
		expect(fields.map((f) => f.type)).toEqual(['dropdown', 'dropdown']);
	});

	it('TEST-PSR-007: DEFAULT_SETTINGS keys are exactly [locale, logLevel]', () => {
		expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual(['locale', 'logLevel']);
	});
});
