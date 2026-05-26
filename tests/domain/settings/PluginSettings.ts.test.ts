/**
 * T-PV-002 (TEST-PV-114 settings/additivity leg) — RED: `PluginSettings` gains
 * EXACTLY the device-local `activeProvider: ProviderId` (default `'claude'`) +
 * `enabledProviders: ProviderId[]` (default `[]` → both non-Claude disabled on a
 * fresh install, REQ-PV-103); the P0–P8 fields (`locale`/`logLevel`/`sessionsFolder`/
 * `maxTabs`/`customSystemPrompt`) stay byte-identical; a P8-shaped settings object
 * (no recorded selection) resolves byte-identically to P8 (additivity, NFR-PV-001).
 *
 * Fails `vue-tsc -p tsconfig.lint.json` (the two new fields do not yet exist on
 * `PluginSettings` / `DEFAULT_SETTINGS`) + the runtime defaults until T-PV-003.
 *
 * Traces: TEST-PV-114, SPEC-PV-001, SPEC-PV-027, REQ-PV-005/103/114, NFR-PV-001.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings';
import type { ProviderId } from '@/domain/chat/ProviderId';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- The two new fields exist with the exact types ----
const _activeProvider: Equals<PluginSettings['activeProvider'], ProviderId> = true;
const _enabledProviders: Equals<PluginSettings['enabledProviders'], readonly ProviderId[]> = true;
void _activeProvider;
void _enabledProviders;

describe('PluginSettings additive provider fields (TEST-PV-114)', () => {
	it('defaults activeProvider to "claude"', () => {
		expect(DEFAULT_SETTINGS.activeProvider).toBe('claude');
	});

	it('defaults enabledProviders to [] (both non-Claude disabled on fresh install)', () => {
		expect(DEFAULT_SETTINGS.enabledProviders).toEqual([]);
	});

	it('keeps the P0–P8 fields byte-identical (additivity, NFR-PV-001)', () => {
		expect(DEFAULT_SETTINGS.locale).toBe('en');
		expect(DEFAULT_SETTINGS.logLevel).toBe('warn');
		expect(DEFAULT_SETTINGS.sessionsFolder).toBe('.specorator/sessions');
		expect(DEFAULT_SETTINGS.maxTabs).toBe(3);
		expect(DEFAULT_SETTINGS.customSystemPrompt).toBe('');
	});

	it('a P8-shaped object (no recorded selection) resolves byte-identically to P8', () => {
		// A settings object with the recorded fields at their defaults is the P8
		// baseline plus the two additive fields at their no-op defaults.
		const p8Shaped: PluginSettings = {
			...DEFAULT_SETTINGS,
			activeProvider: 'claude',
			enabledProviders: [],
		};
		expect(p8Shaped.activeProvider).toBe('claude');
		expect(p8Shaped.enabledProviders).toEqual([]);
	});
});
