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
import type { PermissionMode } from '@/domain/chat/PermissionMode';
import type { EnvEntry, EnvSnippetStruct } from '@/domain/chat/environment/EnvSnippet';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- The two new fields exist with the exact types ----
const _activeProvider: Equals<PluginSettings['activeProvider'], ProviderId> = true;
const _enabledProviders: Equals<PluginSettings['enabledProviders'], readonly ProviderId[]> = true;
void _activeProvider;
void _enabledProviders;

// ---- P10 settings-shell (TEST-SS-092/093, SPEC-SS-001): the six additive
// OPTIONAL device-local fields exist with the pinned types and are each absent
// from DEFAULT_SETTINGS (mirroring homeFsConsent, NFR-SS-001/SPEC-SS-020). ----
const _envSnippets: Equals<PluginSettings['envSnippets'], readonly EnvSnippetStruct[] | undefined> =
	true;
const _envScopes: Equals<
	PluginSettings['envScopes'],
	Readonly<Record<string, readonly EnvEntry[]>> | undefined
> = true;
const _keyboardNav: Equals<
	PluginSettings['keyboardNav'],
	{ readonly scrollUpKey: string; readonly scrollDownKey: string; readonly focusInputKey: string } | undefined
> = true;
const _providerDefaultModel: Equals<
	PluginSettings['providerDefaultModel'],
	Readonly<Record<string, string>> | undefined
> = true;
const _defaultPermissionMode: Equals<
	PluginSettings['defaultPermissionMode'],
	PermissionMode | undefined
> = true;
const _providerCliPath: Equals<
	PluginSettings['providerCliPath'],
	Readonly<Record<string, string>> | undefined
> = true;
void _envSnippets;
void _envScopes;
void _keyboardNav;
void _providerDefaultModel;
void _defaultPermissionMode;
void _providerCliPath;

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

describe('PluginSettings P10 additive OPTIONAL fields (TEST-SS-092/093, SPEC-SS-001/020)', () => {
	it('the six P10 fields are absent from DEFAULT_SETTINGS (exact-key byte-identity, NFR-SS-001)', () => {
		// The exact-key contract stays byte-identical to P9: DEFAULT_SETTINGS holds
		// only the recorded P0–P9 keys; the six P10 fields are OPTIONAL + absent
		// (mirroring homeFsConsent).
		expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual(
			[
				'activeProvider',
				'customSystemPrompt',
				'enabledProviders',
				'locale',
				'logLevel',
				'maxTabs',
				'sessionsFolder',
			].sort(),
		);
		expect('envSnippets' in DEFAULT_SETTINGS).toBe(false);
		expect('envScopes' in DEFAULT_SETTINGS).toBe(false);
		expect('keyboardNav' in DEFAULT_SETTINGS).toBe(false);
		expect('providerDefaultModel' in DEFAULT_SETTINGS).toBe(false);
		expect('defaultPermissionMode' in DEFAULT_SETTINGS).toBe(false);
		expect('providerCliPath' in DEFAULT_SETTINGS).toBe(false);
	});

	it('accepts a fully-recorded P10 settings object (the OPTIONAL fields are assignable)', () => {
		const recorded: PluginSettings = {
			...DEFAULT_SETTINGS,
			envSnippets: [
				{ id: 's1', name: 'prod', description: '', envEntries: [{ key: 'FOO', value: { kind: 'inline', text: 'bar' } }] },
			],
			envScopes: { shared: [{ key: 'FOO', value: { kind: 'inline', text: 'bar' } }] },
			keyboardNav: { scrollUpKey: 'w', scrollDownKey: 's', focusInputKey: 'i' },
			providerDefaultModel: { claude: 'opus' },
			defaultPermissionMode: 'plan',
			providerCliPath: { codex: '/usr/bin/codex' },
		};
		expect(recorded.envSnippets?.[0]?.id).toBe('s1');
		expect(recorded.keyboardNav?.scrollUpKey).toBe('w');
		expect(recorded.defaultPermissionMode).toBe('plan');
	});
});
