/**
 * TEST-PSR-024 (T-PSR-021 settings-store slice) — `ObsidianBridge` persists
 * settings to the device-local store (`app.saveLocalStorage`), never `data.json`
 * (the bridge has no `saveData` access). Load-or-default read; defaults on
 * absent/corrupt. SPEC-PSR-008; REQ-PSR-013, NFR-PSR-010; ADR-PSR-002.
 *
 * P3 (SPEC-TS-005, T-TS-006): the settings shape grew additively with
 * `sessionsFolder`/`maxTabs`; the round-trip + load-or-default expectations carry
 * the defaulted fields, and the corrupt/absent paths fall back to DEFAULT_SETTINGS.
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
});
