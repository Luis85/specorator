import '@/ui/styles/tokens.css';
import '@/ui/styles/animations.css';
import { Plugin } from 'obsidian';
import { AgentSidebarView, VIEW_TYPE_AGENT } from './AgentSidebarView';
import { SpecoratorSettingTab, type SettingsTabDeps } from './settings';
import { createSnippetEditLauncher } from './modals/EnvSnippetModalHost';
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings';
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge';
import { openInlineEdit } from './inlineEditLauncher';
import { PluginCore } from '@/core/plugin-core';
import { ALL_MODULES, type ModuleDescriptor } from '@/modules';
import { coreSettingsModule } from '@/core/core-settings';
import { createEnvSnippetService } from '@/application/settings';
import { PROVIDER_DESCRIPTORS } from '@/domain/chat/providers';
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
		const bridge = new ObsidianBridge(this.app);
		this.bridge = bridge;
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

		// P5 (SPEC-CA-026, REQ-CA-020): the inline-edit affordance is an editor command
		// gated on a NON-EMPTY selection — it does not appear / run on an empty one. It
		// opens the same launcher the sidebar provides (the aux-backed `InlineEditModal`)
		// and applies the accepted edit to the active editor.
		this.addCommand({
			id: 'inline-edit-selection',
			name: 'Inline edit: edit selection',
			editorCheckCallback: (checking, editor) => {
				const selectedText = editor.getSelection();
				if (selectedText.trim() === '') return false;
				if (checking) return true;
				const bridge = this.bridge;
				if (bridge === null) return true;
				const notePath = this.app.workspace.getActiveFile()?.path;
				void openInlineEdit(this.app, bridge.createAuxModel(), bridge, {
					selectedText,
					notePath,
				});
				return true;
			},
		});

		this.addSettingTab(new SpecoratorSettingTab(this.app, this, this.buildSettingsTabDeps(bridge)));
	}

	/**
	 * Assemble the P10 settings-shell ports + services the expanded tab renders the
	 * view-model from (SPEC-SS-010, T-SS-030). The env subsystem composes the bridge's
	 * `SettingsPort` + `SecretStorePort` behind a pure `EnvSnippetService` (NO new port,
	 * ADR-SS-001); the snippet edit/delete modals are wired through the
	 * `SnippetEditLauncher` seam so the tab never imports an Obsidian `Modal`.
	 */
	private buildSettingsTabDeps(bridge: ObsidianBridge): SettingsTabDeps {
		const envSnippets = createEnvSnippetService({
			settings: bridge,
			secretStore: bridge.secretStore,
			descriptors: PROVIDER_DESCRIPTORS,
		});
		const snippetLauncher = createSnippetEditLauncher({
			app: this.app,
			service: envSnippets,
			registry: bridge.providerRegistry,
			notify: bridge,
			t: i18nTranslate,
		});
		return {
			registry: bridge.providerRegistry,
			secretStore: bridge.secretStore,
			toolbarCatalog: bridge.toolbarCatalog,
			mcpConfigStore: bridge.mcpConfigStore,
			approvalRuleStore: bridge.approvalRuleStore,
			providerCommandCatalog: bridge.createProviderCommandCatalog(),
			envSnippets,
			snippetLauncher,
			notify: bridge,
			t: i18nTranslate,
		};
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
