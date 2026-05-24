/**
 * T-PSR-014 (TEST-PSR-014) — RED: the slim settings tab persists a schema-driven
 * dropdown change through SettingsPort (SPEC-PSR-008, E12).
 *
 * Fails against the current fat tab (it imports the deleted `SpecoratorView` /
 * `AgentSidepanelView` and its `render*` helpers need deleted plugin surface)
 * and goes GREEN after T-PSR-015 slims `SpecoratorSettingTab` to the
 * module-schema loop. Traces: REQ-PSR-007; SPEC-PSR-008.
 */
import { describe, it, expect, vi } from 'vitest';

interface DropdownStub {
	readonly options: Record<string, string>;
	value: string;
	changeHandler?: (value: string) => void | Promise<void>;
}

// A Proxy obsidian mock: real `Setting` (captures dropdown onChange) +
// `PluginSettingTab` (gives a jsdom containerEl), and a no-op class for every
// other named import so the fat tab's import chain (ItemView, etc.) resolves.
vi.mock('obsidian', () => {
	const dropdowns: DropdownStub[] = [];
	class Dropdown implements DropdownStub {
		options: Record<string, string> = {};
		value = '';
		changeHandler?: (value: string) => void | Promise<void>;
		addOption(v: string, l: string): this {
			this.options[v] = l;
			return this;
		}
		setValue(v: string): this {
			this.value = v;
			return this;
		}
		onChange(cb: (value: string) => void | Promise<void>): this {
			this.changeHandler = cb;
			return this;
		}
	}
	class Setting {
		setName(): this {
			return this;
		}
		setDesc(): this {
			return this;
		}
		setHeading(): this {
			return this;
		}
		addDropdown(cb: (d: Dropdown) => void): this {
			const d = new Dropdown();
			cb(d);
			dropdowns.push(d);
			return this;
		}
		addText(): this {
			return this;
		}
		addToggle(): this {
			return this;
		}
		addButton(): this {
			return this;
		}
		addTextArea(): this {
			return this;
		}
		addExtraButton(): this {
			return this;
		}
	}
	class PluginSettingTab {
		app: unknown;
		containerEl: HTMLElement;
		constructor(app: unknown) {
			this.app = app;
			const el = document.createElement('div');
			// Obsidian augments HTMLElement with `empty()`; the slim tab calls it
			// first. (We deliberately do NOT polyfill `createEl` so the fat tab's
			// `render*` helpers still throw — this test is RED until T-PSR-015.)
			(el as unknown as { empty: () => void }).empty = function (this: HTMLElement) {
				while (this.firstChild) this.removeChild(this.firstChild);
			};
			this.containerEl = el;
		}
	}
	const specials: Record<string, unknown> = {
		Setting,
		PluginSettingTab,
		__dropdowns: dropdowns,
		normalizePath: (p: string) => p,
		setIcon: () => {},
	};
	// Every other named export resolves to a no-op that is both callable and
	// constructable (so `extends X`, `new X()`, and `X()` all work). Cached per
	// name so an `instanceof` binding stays stable.
	const cache = new Map<string, unknown>();
	const reserved = (prop: string | symbol): boolean =>
		typeof prop !== 'string' || prop === '__esModule' || prop === 'default' || prop === 'then';
	return new Proxy(specials, {
		has(_target, prop) {
			return !reserved(prop);
		},
		get(target, prop) {
			if (reserved(prop)) return undefined;
			const key = prop as string;
			if (key in target) return target[key];
			let v = cache.get(key);
			if (v === undefined) {
				v = function NoOp() {};
				cache.set(key, v);
			}
			return v;
		},
	});
});

import * as obsidian from 'obsidian';
import type { App } from 'obsidian';
import { SpecoratorSettingTab } from '@/plugin/settings';
import { coreSettingsModule } from '@/core/core-settings';
import { fakeModulePorts } from '../__fakes__/fake-ports';

const capturedDropdowns = (obsidian as unknown as { __dropdowns: DropdownStub[] }).__dropdowns;

describe('SpecoratorSettingTab — schema dropdown round-trip (TEST-PSR-014)', () => {
	it('a locale dropdown change persists through SettingsPort and reads back', async () => {
		const { bridge } = fakeModulePorts();
		const saveSpy = vi.spyOn(bridge, 'saveSettings');

		const plugin = {
			app: {},
			core: { allModules: [coreSettingsModule] },
			settings: { locale: 'en', logLevel: 'warn' } as Record<string, unknown>,
			async updateSettings(patch: Record<string, unknown>): Promise<void> {
				this.settings = (coreSettingsModule.validateSettings?.({
					...this.settings,
					...patch,
				}) ?? this.settings) as unknown as Record<string, unknown>;
				await bridge.saveSettings(
					this.settings as unknown as Parameters<typeof bridge.saveSettings>[0],
				);
			},
		};

		const tab = new SpecoratorSettingTab(
			plugin.app as App,
			plugin as unknown as ConstructorParameters<typeof SpecoratorSettingTab>[1],
		);
		capturedDropdowns.length = 0;
		tab.display();

		const localeDropdown = capturedDropdowns.find((d) => 'en' in d.options);
		expect(localeDropdown).toBeDefined();
		await localeDropdown?.changeHandler?.('de');

		expect(saveSpy).toHaveBeenCalled();
		expect((await bridge.getSettings()).locale).toBe('de');
	});
});
