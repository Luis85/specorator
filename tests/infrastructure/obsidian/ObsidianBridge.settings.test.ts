/**
 * TEST-PSR-024 (T-PSR-021 settings-store slice) — `ObsidianBridge` persists
 * settings to the device-local store (`app.saveLocalStorage`), never `data.json`
 * (the bridge has no `saveData` access). Load-or-default read; defaults on
 * absent/corrupt. SPEC-PSR-008; REQ-PSR-013, NFR-PSR-010; ADR-PSR-002.
 *
 * P3 (SPEC-TS-005, T-TS-006): the settings shape grew additively with
 * `sessionsFolder`/`maxTabs`; the round-trip + load-or-default expectations carry
 * the defaulted fields, and the corrupt/absent paths fall back to DEFAULT_SETTINGS.
 *
 * P9 (SPEC-PV-014/024, T-PV-036): the OPTIONAL device-local `homeFsConsent` record
 * MUST survive a `_coerceSettings` round-trip so a recorded one-time beyond-vault
 * consent persists across a production reload (the gate never re-prompts, EC-PV-6,
 * REQ-PV-082). The exact-key contract stays byte-identical P0–P8 when no consent was
 * recorded (the field is absent, not `undefined`, NFR-PV-001).
 */
import { describe, it, expect } from 'vitest';
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge';
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings';
import type { App } from 'obsidian';

function makeApp(): { app: App; store: Map<string, string> } {
	const store = new Map<string, string>();
	const app = {
		loadLocalStorage: (key: string): string | null => store.get(key) ?? null,
		saveLocalStorage: (key: string, value: string): void => {
			store.set(key, value);
		},
	} as unknown as App;
	return { app, store };
}

describe('ObsidianBridge settings — device-local store (TEST-PSR-024)', () => {
	it('saveSettings writes the device-local store; getSettings round-trips', async () => {
		const { app, store } = makeApp();
		const bridge = new ObsidianBridge(app);

		const saved = {
			locale: 'de' as const,
			logLevel: 'debug' as const,
			sessionsFolder: '.specorator/sessions',
			maxTabs: 3,
			customSystemPrompt: '',
			// P9 (SPEC-PV-001/027): the additive device-local provider selection.
			activeProvider: 'claude' as const,
			enabledProviders: [] as const,
		};
		await bridge.saveSettings(saved);

		const blob = store.get('specorator:settings');
		expect(blob).toBeDefined();
		expect(JSON.parse(blob!)).toEqual(saved);
		expect(await bridge.getSettings()).toEqual(saved);
	});

	it('getSettings returns DEFAULT_SETTINGS when nothing is stored (load-or-default)', async () => {
		const { app } = makeApp();
		const bridge = new ObsidianBridge(app);
		expect(await bridge.getSettings()).toEqual(DEFAULT_SETTINGS);
	});

	it('getSettings falls back to defaults on a corrupt blob', async () => {
		const { app, store } = makeApp();
		store.set('specorator:settings', 'not-json{');
		const bridge = new ObsidianBridge(app);
		expect(await bridge.getSettings()).toEqual(DEFAULT_SETTINGS);
	});

	it('T-PV-036: a recorded homeFsConsent survives the save→reload round-trip (REQ-PV-082, EC-PV-6)', async () => {
		const { app, store } = makeApp();
		const bridge = new ObsidianBridge(app);

		const saved = {
			...DEFAULT_SETTINGS,
			enabledProviders: ['codex'] as const,
			activeProvider: 'codex' as const,
			// The one-time beyond-vault consent record (provider.homeFsConsent.<id> keys).
			homeFsConsent: { 'provider.homeFsConsent.codex': true },
		};
		await bridge.saveSettings(saved);

		// A fresh bridge reading the persisted blob (simulating a production reload) MUST
		// still carry the consent record — _coerceSettings must NOT drop it.
		const reloaded = new ObsidianBridge(app);
		const after = await reloaded.getSettings();
		expect(after.homeFsConsent).toEqual({ 'provider.homeFsConsent.codex': true });
		// Sanity: the blob round-trips verbatim through saveSettings + the coercion.
		expect(JSON.parse(store.get('specorator:settings')!).homeFsConsent).toEqual(
			saved.homeFsConsent,
		);
	});

	it('T-PV-036: no recorded consent stays byte-identical P8 (homeFsConsent absent, not undefined)', async () => {
		const { app } = makeApp();
		const bridge = new ObsidianBridge(app);
		const settings = await bridge.getSettings();
		// The OPTIONAL field is absent (the exact-key contract holds, NFR-PV-001).
		expect('homeFsConsent' in settings).toBe(false);
		expect(settings).toEqual(DEFAULT_SETTINGS);
	});
});
