/**
 * TEST-PSR-024 (T-PSR-021 settings-store slice) — `ObsidianBridge` persists
 * settings to the device-local store (`app.saveLocalStorage`), never `data.json`
 * (the bridge has no `saveData` access). Load-or-default read; defaults on
 * absent/corrupt. SPEC-PSR-008; REQ-PSR-013, NFR-PSR-010; ADR-PSR-002.
 */
import { describe, it, expect } from 'vitest';
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge';
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

		await bridge.saveSettings({ locale: 'de', logLevel: 'debug' });

		const blob = store.get('specorator:settings');
		expect(blob).toBeDefined();
		expect(JSON.parse(blob!)).toEqual({ locale: 'de', logLevel: 'debug' });
		expect(await bridge.getSettings()).toEqual({ locale: 'de', logLevel: 'debug' });
	});

	it('getSettings returns DEFAULT_SETTINGS when nothing is stored (load-or-default)', async () => {
		const { app } = makeApp();
		const bridge = new ObsidianBridge(app);
		expect(await bridge.getSettings()).toEqual({ locale: 'en', logLevel: 'warn' });
	});

	it('getSettings falls back to defaults on a corrupt blob', async () => {
		const { app, store } = makeApp();
		store.set('specorator:settings', 'not-json{');
		const bridge = new ObsidianBridge(app);
		expect(await bridge.getSettings()).toEqual({ locale: 'en', logLevel: 'warn' });
	});
});
