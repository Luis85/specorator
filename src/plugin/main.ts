import '@/ui/styles/tokens.css';
import '@/ui/styles/animations.css';
import { Plugin } from 'obsidian';
import { AgentSidebarView, VIEW_TYPE_AGENT } from './AgentSidebarView';
import { SpecoratorSettingTab } from './settings';
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings';
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge';
import { PluginCore } from '@/core/plugin-core';
import { ALL_MODULES, type ModuleDescriptor } from '@/modules';
import { coreSettingsModule } from '@/core/core-settings';
import { i18nMerge, i18nTranslate, setLocale, toSupportedLocale } from '@/ui/i18n';
import type { TranslationPort } from '@/domain/ports';

/**
 * Plugin entry (P0 reboot — SPEC-PSR-016). Boots one empty agent sidebar view
 * opened by a single command (no ribbon). Settings persist to the device-local
 * store via `SettingsPort` (ObsidianBridge → app.loadLocalStorage/saveLocalStorage,
 * ADR-PSR-002), never `data.json`. Load-or-default; no migration (NG8).
 */
export default class SpecoratorPlugin extends Plugin {
	settings: PluginSettings = { ...DEFAULT_SETTINGS };
	core: PluginCore | null = null;
	bridge: ObsidianBridge | null = null;
	/** data.json module blob (e.g. helloModule) — NOT settings (those are device-local). */
	private _storedData: Record<string, unknown> = {};

	async onload(): Promise<void> {
		this.bridge = new ObsidianBridge(this.app);
		await this.loadSettings();

		const translationPort: TranslationPort = { t: i18nTranslate };
		this.core = new PluginCore(ALL_MODULES as ReadonlyArray<ModuleDescriptor>, {
			settings: this.bridge,
			vault: this.bridge,
			workspace: this.bridge,
			notifications: this.bridge,
			logger: this.bridge,
			t: translationPort,
			i18nMerge,
		});

		setLocale(toSupportedLocale(this.settings.locale));

		// Module bootstrap reads the data.json blob (helloModule etc.). This is NOT
		// a settings read — settings live in the device-local store (load-or-default,
		// no migration; NG8).
		const stored = (await this.loadData()) as Record<string, unknown> | null;
		this._storedData = { ...(stored ?? {}) };
		await this.core.init(this._storedData);
		// PluginCore.init projects every module's slice into the blob, including the
		// specorator settings slice. Drop it so a later module-settings save never
		// re-persists locale/logLevel to data.json (NFR-PSR-010).
		this._storedData = Object.fromEntries(
			Object.entries(this._storedData).filter(([key]) => key !== 'specorator'),
		);

		this.registerView(VIEW_TYPE_AGENT, (leaf) => new AgentSidebarView(leaf, this));

		this.addCommand({
			id: 'open-agent-sidebar',
			name: 'Open agent sidebar',
			callback: () => {
				void this.activateAgentSidebar();
			},
		});

		this.addSettingTab(new SpecoratorSettingTab(this.app, this));
	}

	// Obsidian guarantees a single onunload(); detaching our own leaves here is
	// the expected cleanup path.
	// eslint-disable-next-line obsidianmd/detach-leaves
	override onunload(): void {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_AGENT);
		this.bridge?.hideAllNotices();
		void this.core?.destroy();
	}

	/** Load-or-default from the device-local store (SPEC-PSR-002/016). */
	async loadSettings(): Promise<void> {
		if (this.bridge === null) return;
		this.settings = await this.bridge.getSettings();
	}

	/**
	 * Validate + persist a settings change through `SettingsPort` (device-local
	 * store, never data.json — REQ-PSR-013, NFR-PSR-010). Mirrors the validated
	 * value into PluginCore so module hooks observe the coerced value.
	 */
	async updateSettings(partial: Partial<PluginSettings>): Promise<void> {
		const merged = { ...this.settings, ...partial };
		const validated = coreSettingsModule.validateSettings?.(merged) ?? merged;
		this.settings = validated;
		await this.bridge?.saveSettings(validated);
		await this.core?.notifySettingsChanged('specorator', validated);
	}

	/** Persist a non-core module's settings slice to the data.json blob. */
	async updateModuleSettings(settingsKey: string, partial: Record<string, unknown>): Promise<void> {
		const current = (this._storedData[settingsKey] ?? {}) as Record<string, unknown>;
		const merged = { ...current, ...partial };
		await this.core?.notifySettingsChanged(settingsKey, merged);
		const validated = (this.core?.getModuleSettings(settingsKey) ?? merged) as Record<
			string,
			unknown
		>;
		this._storedData = { ...this._storedData, [settingsKey]: validated };
		await this.saveData(this._storedData);
	}

	/** Reveal-or-create the agent sidebar in the right sidebar (SPEC-PSR-007). */
	async activateAgentSidebar(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_AGENT);
		if (existing.length > 0) {
			const leaf = existing[0];
			// Deferred-leaf invariant (ADR-008): load before reveal so onOpen runs.
			await leaf.loadIfDeferred();
			await workspace.revealLeaf(leaf);
			return;
		}
		const leaf = workspace.getRightLeaf(false);
		if (leaf === null) return;
		await leaf.setViewState({ type: VIEW_TYPE_AGENT, active: true });
		await leaf.loadIfDeferred();
		await workspace.revealLeaf(leaf);
	}
}
