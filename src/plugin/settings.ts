import { type App, PluginSettingTab, Setting } from 'obsidian';
import type { ModuleDescriptor, SettingsFieldDescriptor } from '@/modules/module';
import type SpecoratorPlugin from './main';

/**
 * Slim settings tab (P0 reboot — SPEC-PSR-008). Renders only the
 * module-schema-driven controls (the two `coreSettingsModule` dropdowns in P0)
 * and persists changes through `SettingsPort` via `plugin.updateSettings`. The
 * fat tab's chat/secret/CLI/MCP/approval sections were deleted with their
 * subsystems.
 */
export class SpecoratorSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: SpecoratorPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		for (const mod of this.plugin.core?.allModules ?? []) {
			const fields = mod.settingsSchema?.fields;
			if (fields === undefined || fields.length === 0) continue;

			new Setting(containerEl).setName(mod.id).setHeading();

			for (const field of fields) {
				const currentValue = this.currentValue(mod, field);
				const setting = new Setting(containerEl).setName(field.label);
				if (field.description !== undefined) setting.setDesc(field.description);
				this.addControl(setting, mod, field, currentValue);
			}
		}
	}

	private currentValue(mod: ModuleDescriptor, field: SettingsFieldDescriptor): unknown {
		if (mod.settingsKey === 'specorator') {
			return (
				(this.plugin.settings as unknown as Record<string, unknown>)[field.key] ?? field.default
			);
		}
		if (mod.settingsKey !== undefined) {
			const slice = (this.plugin.core?.getModuleSettings(mod.settingsKey) ?? {}) as Record<
				string,
				unknown
			>;
			return slice[field.key] ?? field.default;
		}
		return field.default;
	}

	private addControl(
		setting: Setting,
		mod: ModuleDescriptor,
		field: SettingsFieldDescriptor,
		currentValue: unknown,
	): void {
		switch (field.type) {
			case 'toggle':
				setting.addToggle((t) =>
					t.setValue(currentValue as boolean).onChange(async (value) => {
						await this.saveField(mod, field.key, value);
					}),
				);
				break;

			case 'text':
				setting.addText((t) =>
					t.setValue(String(currentValue ?? field.default)).onChange(async (value) => {
						await this.saveField(mod, field.key, value.trim() || String(field.default));
					}),
				);
				break;

			case 'number':
				setting.addText((t) =>
					t.setValue(String(currentValue ?? field.default)).onChange(async (value) => {
						const n = Number(value);
						await this.saveField(mod, field.key, Number.isNaN(n) ? field.default : n);
					}),
				);
				break;

			case 'dropdown': {
				setting.addDropdown((dd) => {
					for (const opt of field.options ?? []) {
						dd.addOption(opt.value, opt.label);
					}
					dd.setValue(String(currentValue ?? field.default)).onChange(async (value) => {
						await this.saveField(mod, field.key, value);
					});
				});
				break;
			}
		}
	}

	private async saveField(mod: ModuleDescriptor, key: string, value: unknown): Promise<void> {
		if (mod.settingsKey === 'specorator') {
			await this.plugin.updateSettings({ [key]: value });
		} else if (mod.settingsKey !== undefined) {
			await this.plugin.updateModuleSettings(mod.settingsKey, { [key]: value });
		}
	}
}
