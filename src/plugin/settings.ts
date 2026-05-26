import { type App, PluginSettingTab, Setting } from 'obsidian';
import type { ModuleDescriptor, SettingsFieldDescriptor } from '@/modules/module';
import type SpecoratorPlugin from './main';
import type { ProviderRegistryPort } from '@/domain/ports/ProviderRegistryPort';
import type { SecretStorePort } from '@/domain/ports/SecretStorePort';
import { providerSecretKey } from '@/domain/ports/SecretStorePort';
import type { ToolbarCatalogPort } from '@/domain/ports/ToolbarCatalogPort';
import type { McpConfigStorePort } from '@/domain/ports/McpConfigStorePort';
import type { ApprovalRuleStorePort } from '@/domain/ports/ApprovalRuleStorePort';
import type { ProviderCommandCatalogPort } from '@/domain/ports/ProviderCommandCatalogPort';
import type { NotificationPort } from '@/domain/ports/NotificationPort';
import type { TranslationPort } from '@/domain/ports/TranslationPort';
import type { EnvSnippetService } from '@/application/settings/EnvSnippetService';
import {
	buildSettingsViewModel,
	makeHasProviderDefinitions,
	makeGetProviderDefinitions,
	type SettingsControl,
	type SettingsSection,
	type ProviderDefinitionPresence,
} from '@/application/settings';
import { parseNavMappings } from '@/domain/settings/keyboardNav';
import type { ProviderId } from '@/domain/chat/ProviderId';
import type { PermissionMode } from '@/domain/chat/PermissionMode';
import type { EnvironmentScope, EnvSnippetStruct, EnvEntry } from '@/domain/chat/environment/EnvSnippet';
import type { ManagedMcpServer } from '@/domain/chat/mcp/McpTypes';

/** The permission modes offered by the shared section's mode dropdown (the closed P7 set). */
const PERMISSION_MODES: readonly PermissionMode[] = ['normal', 'plan', 'yolo'];

/**
 * The snippet create/edit/delete launcher the env-snippet rows drive (SPEC-SS-011,
 * T-SS-026). The settings tab depends on this seam so the Obsidian `Modal` hosts
 * live in `src/plugin/modals/**`; a `true` result asks the tab to re-render.
 */
export interface SnippetEditLauncher {
	/** Open the create modal; resolve `true` when a snippet was created. */
	openCreate(): Promise<boolean>;
	/** Open the edit modal for `snippet`; resolve `true` when it was saved. */
	openEdit(snippet: EnvSnippetStruct): Promise<boolean>;
	/** Open the delete-confirm modal for `snippet`; resolve `true` when removed. */
	openDelete(snippet: EnvSnippetStruct): Promise<boolean>;
}

/**
 * The ports + services the expanded settings tab renders the view-model from
 * (SPEC-SS-010). Constructed in `main.ts` (T-SS-030) from the `ObsidianBridge`
 * ports + the `EnvSnippetService`. No `obsidian` symbol leaks past `src/plugin/**`.
 */
export interface SettingsTabDeps {
	readonly registry: ProviderRegistryPort;
	readonly secretStore: SecretStorePort;
	readonly toolbarCatalog: ToolbarCatalogPort;
	readonly mcpConfigStore: McpConfigStorePort;
	readonly approvalRuleStore: ApprovalRuleStorePort;
	readonly providerCommandCatalog: ProviderCommandCatalogPort;
	readonly envSnippets: EnvSnippetService;
	readonly snippetLauncher: SnippetEditLauncher;
	readonly notify: NotificationPort;
	readonly t: TranslationPort['t'];
}

/**
 * The settings tab (P0 core loop + the P10 capability-gated shell, SPEC-SS-010).
 * `display()` keeps the module-schema core loop (the `coreField`s, UNCHANGED —
 * REQ-SS-005) and then walks the pure `buildSettingsViewModel` view-model, rendering
 * each `SettingsControl` via the Obsidian `Setting` API / `createEl` / `setText`
 * (safe DOM only — no `innerHTML`/`v-html`, no `window.confirm`; SPEC-SS-023). Each
 * control wires its `onChange` to its narrow port / use case; a `Result.err` surfaces
 * as a `NotificationPort` notice (REQ-SS-094). A toggle / key / snippet change
 * re-renders the tab. The renderer `switch (control.kind)`es over the discriminated
 * union — the ONE allowed switch, NEVER on `providerId` (SPEC-SS-021). Coverage-excluded
 * `src/plugin/**` → manual leg TEST-SS-M1.
 */
export class SpecoratorSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: SpecoratorPlugin,
		private readonly deps: SettingsTabDeps | null = null,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.renderCoreModules(containerEl);

		// P10: the capability-gated shell is additive — only when the plugin wired
		// the tab with its ports (T-SS-030). Without deps the slim P0 core loop renders.
		if (this.deps === null) return;
		void this.renderShell(containerEl, this.deps);
	}

	/** The P0 module-schema core loop (UNCHANGED — REQ-SS-005). */
	private renderCoreModules(containerEl: HTMLElement): void {
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

	/** Build the view-model + render every section/control (the P10 shell, SPEC-SS-010). */
	private async renderShell(containerEl: HTMLElement, deps: SettingsTabDeps): Promise<void> {
		const keysResult = await deps.secretStore.listKeys();
		const secretKeysSet = new Set<string>(keysResult.ok ? keysResult.value : []);
		const hasProviderDefinitions: (id: ProviderId) => ProviderDefinitionPresence =
			await makeHasProviderDefinitions(deps.providerCommandCatalog);
		const getProviderDefinitions = await makeGetProviderDefinitions(deps.providerCommandCatalog);

		const viewModel = buildSettingsViewModel({
			settings: this.plugin.settings,
			registry: deps.registry,
			getCatalog: (id) => deps.toolbarCatalog.getCatalog(id),
			secretKeysSet,
			secretStorageAvailable: deps.secretStore.isAvailable(),
			hasProviderDefinitions,
			getProviderDefinitions,
		});

		// The shared section's `coreField`s are already rendered by the P0 core loop;
		// the shell re-renders only the additive controls (skip `coreField`).
		for (const section of viewModel.sections) {
			this.renderSection(containerEl, section, deps);
		}
	}

	/** Render one section heading + its (non-coreField) controls. */
	private renderSection(
		containerEl: HTMLElement,
		section: SettingsSection,
		deps: SettingsTabDeps,
	): void {
		const controls = section.controls.filter((control) => control.kind !== 'coreField');
		if (controls.length === 0) return;
		new Setting(containerEl).setName(deps.t(section.titleKey)).setHeading();
		for (const control of controls) {
			this.renderControl(containerEl, control, deps);
		}
	}

	/**
	 * Render one control via the `Setting` API. The ONE allowed `switch` is on the
	 * `kind` discriminant (SPEC-SS-021); it never branches on `providerId`.
	 */
	// eslint-disable-next-line complexity -- the SPEC-SS-021 exhaustiveness switch over the 14-member SettingsControl union; complexity is the union size itself, not incidental branching.
	private renderControl(
		containerEl: HTMLElement,
		control: SettingsControl,
		deps: SettingsTabDeps,
	): void {
		switch (control.kind) {
			case 'coreField':
				return; // rendered by the P0 core loop
			case 'providerToggle':
				this.renderProviderToggle(containerEl, control, deps);
				return;
			case 'apiKeyField':
				this.renderApiKeyField(containerEl, control, deps);
				return;
			case 'modelPicker':
				this.renderModelPicker(containerEl, control, deps);
				return;
			case 'envScopeEditor':
				this.renderEnvScopeEditor(containerEl, control.scope, deps);
				return;
			case 'envSnippetList':
				this.renderEnvSnippetList(containerEl, deps);
				return;
			case 'agentList':
				this.renderDefinitionList(containerEl, 'settings.agent', control.entries, deps);
				return;
			case 'slashList':
				this.renderDefinitionList(containerEl, 'settings.slash', control.entries, deps);
				return;
			case 'mcpManager':
				this.renderMcpManager(containerEl, deps);
				return;
			case 'mcpDocNote':
				new Setting(containerEl)
					.setName(deps.t('settings.mcp.label'))
					.setDesc(deps.t(control.noteKey));
				return;
			case 'approvalRules':
				this.renderApprovalRules(containerEl, deps);
				return;
			case 'permissionMode':
				this.renderPermissionMode(containerEl, control.value, deps);
				return;
			case 'keyboardNav':
				this.renderKeyboardNav(containerEl, control.text, deps);
				return;
			case 'cliPath':
				this.renderCliPath(containerEl, control.providerId, control.path, deps);
				return;
			default:
				assertNever(control);
		}
	}

	/** A non-Claude provider's enable toggle → `enabledProviders` + re-render (REQ-SS-003). */
	private renderProviderToggle(
		containerEl: HTMLElement,
		control: Extract<SettingsControl, { kind: 'providerToggle' }>,
		deps: SettingsTabDeps,
	): void {
		new Setting(containerEl)
			.setName(deps.t('settings.provider.toggle'))
			.setDesc(deps.t('settings.provider.toggleDesc'))
			.addToggle((toggle) =>
				toggle.setValue(control.enabled).onChange((enabled) => {
					void this.toggleProvider(control.providerId, enabled);
				}),
			);
	}

	private async toggleProvider(id: ProviderId, enabled: boolean): Promise<void> {
		const current = this.plugin.settings.enabledProviders;
		const next = enabled ? [...new Set([...current, id])] : current.filter((entry) => entry !== id);
		await this.plugin.updateSettings({ enabledProviders: next });
		this.display();
	}

	/**
	 * The API-key field — masked input, tri-state only (REQ-SS-011..015). The stored
	 * value is NEVER read back; the field shows only the `secretKeysSet` tri-state.
	 */
	private renderApiKeyField(
		containerEl: HTMLElement,
		control: Extract<SettingsControl, { kind: 'apiKeyField' }>,
		deps: SettingsTabDeps,
	): void {
		const setting = new Setting(containerEl).setName(deps.t('settings.apiKey.label'));
		if (control.state === 'unavailable') {
			setting.setDesc(deps.t('settings.apiKey.unavailable'));
			setting.setDisabled(true);
			return;
		}
		setting.setDesc(
			deps.t(control.state === 'set' ? 'settings.apiKey.set' : 'settings.apiKey.unset'),
		);
		const key = providerSecretKey(control.providerId);
		setting.addText((text) => {
			text.inputEl.type = 'password';
			text.setPlaceholder(deps.t('settings.apiKey.placeholder')).onChange((value) => {
				const trimmed = value.trim();
				if (trimmed === '') return;
				void this.saveSecret(deps, key, trimmed, 'settings.apiKey.saveFailed');
			});
		});
		if (control.state === 'set') {
			setting.addButton((button) =>
				button.setButtonText(deps.t('settings.apiKey.clear')).onClick(() => {
					void this.clearSecret(deps, key);
				}),
			);
		}
	}

	private async saveSecret(
		deps: SettingsTabDeps,
		key: string,
		value: string,
		failKey: string,
	): Promise<void> {
		const result = await deps.secretStore.setSecret(key, value);
		if (!result.ok) {
			deps.notify.showError(deps.t(failKey));
			return;
		}
		this.display();
	}

	private async clearSecret(deps: SettingsTabDeps, key: string): Promise<void> {
		const result = await deps.secretStore.deleteSecret(key);
		if (!result.ok) {
			deps.notify.showError(deps.t('settings.apiKey.clearFailed'));
			return;
		}
		this.display();
	}

	/** The default-model picker → `providerDefaultModel[id]` (REQ-SS-020..022). */
	private renderModelPicker(
		containerEl: HTMLElement,
		control: Extract<SettingsControl, { kind: 'modelPicker' }>,
		deps: SettingsTabDeps,
	): void {
		const setting = new Setting(containerEl).setName(deps.t('settings.model.label'));
		if (control.empty) {
			setting.setDesc(deps.t('settings.model.empty'));
			return;
		}
		setting.setDesc(deps.t('settings.model.desc'));
		setting.addDropdown((dropdown) => {
			for (const model of control.models) dropdown.addOption(model.id, model.label);
			if (control.selectedId !== undefined) dropdown.setValue(control.selectedId);
			dropdown.onChange((value) => {
				void this.saveProviderModel(control.providerId, value);
			});
		});
	}

	private async saveProviderModel(id: ProviderId, modelId: string): Promise<void> {
		const next = { ...(this.plugin.settings.providerDefaultModel ?? {}), [id]: modelId };
		await this.plugin.updateSettings({ providerDefaultModel: next });
	}

	/** The env-scope editor — a textarea persisted via `EnvSnippetService.applyScopeText`. */
	private renderEnvScopeEditor(
		containerEl: HTMLElement,
		scope: EnvironmentScope,
		deps: SettingsTabDeps,
	): void {
		const setting = new Setting(containerEl)
			.setName(deps.t('settings.env.label', { scope }))
			.setDesc(deps.t('settings.env.desc'));
		void this.loadEnvScope(setting, scope, deps);
	}

	private async loadEnvScope(
		setting: Setting,
		scope: EnvironmentScope,
		deps: SettingsTabDeps,
	): Promise<void> {
		const loaded = await deps.envSnippets.readScope(scope);
		const text = loaded.ok ? this.serializeScope(loaded.value) : '';
		setting.addTextArea((area) =>
			area.setValue(text).onChange((value) => {
				void this.applyEnvScope(deps, scope, value);
			}),
		);
	}

	/** Render a scope's entries as `KEY=value` text; a secretRef is masked, never resolved. */
	private serializeScope(entries: readonly EnvEntry[]): string {
		return entries
			.map((entry) => `${entry.key}=${entry.value.kind === 'inline' ? entry.value.text : '••••••'}`)
			.join('\n');
	}

	private async applyEnvScope(
		deps: SettingsTabDeps,
		scope: EnvironmentScope,
		text: string,
	): Promise<void> {
		const result = await deps.envSnippets.applyScopeText(scope, text);
		if (!result.ok) {
			deps.notify.showError(deps.t('settings.env.saveFailed'));
			return;
		}
		if (result.value.reviewKeys.length > 0) {
			deps.notify.showWarning(
				deps.t('settings.env.reviewWarning', { keys: result.value.reviewKeys.join(', ') }),
			);
		}
	}

	/** The env-snippet list — apply / edit / delete rows + a create button (REQ-SS-060..064). */
	private renderEnvSnippetList(containerEl: HTMLElement, deps: SettingsTabDeps): void {
		new Setting(containerEl)
			.setName(deps.t('settings.envSnippets.label'))
			.setDesc(deps.t('settings.envSnippets.desc'))
			.addButton((button) =>
				button.setButtonText(deps.t('settings.envSnippets.add')).onClick(() => {
					void this.createSnippet(deps);
				}),
			);
		void this.loadSnippets(containerEl, deps);
	}

	private async loadSnippets(containerEl: HTMLElement, deps: SettingsTabDeps): Promise<void> {
		const listed = await deps.envSnippets.list();
		if (!listed.ok) {
			deps.notify.showError(deps.t('settings.envSnippets.loadFailed'));
			return;
		}
		if (listed.value.length === 0) {
			new Setting(containerEl).setDesc(deps.t('settings.envSnippets.empty'));
			return;
		}
		for (const snippet of listed.value) {
			new Setting(containerEl)
				.setName(snippet.name)
				.addButton((button) =>
					button
						.setButtonText(deps.t('settings.envSnippets.apply', { name: snippet.name }))
						.onClick(() => {
							void this.applySnippet(deps, snippet.id);
						}),
				)
				.addButton((button) =>
					button
						.setButtonText(deps.t('settings.envSnippets.edit', { name: snippet.name }))
						.onClick(() => {
							void this.editSnippet(deps, snippet);
						}),
				)
				.addButton((button) =>
					button
						.setButtonText(deps.t('settings.envSnippets.delete', { name: snippet.name }))
						.setWarning()
						.onClick(() => {
							void this.deleteSnippet(deps, snippet);
						}),
				);
		}
	}

	private async createSnippet(deps: SettingsTabDeps): Promise<void> {
		if (await deps.snippetLauncher.openCreate()) this.display();
	}

	private async editSnippet(deps: SettingsTabDeps, snippet: EnvSnippetStruct): Promise<void> {
		if (await deps.snippetLauncher.openEdit(snippet)) this.display();
	}

	private async deleteSnippet(deps: SettingsTabDeps, snippet: EnvSnippetStruct): Promise<void> {
		if (await deps.snippetLauncher.openDelete(snippet)) this.display();
	}

	private async applySnippet(deps: SettingsTabDeps, id: string): Promise<void> {
		const result = await deps.envSnippets.apply(id);
		if (!result.ok) deps.notify.showError(deps.t('settings.envSnippets.applyFailed'));
	}

	/** A read-only definition list (agents/skills or slash) — no write affordance (REQ-SS-030/041). */
	private renderDefinitionList(
		containerEl: HTMLElement,
		prefix: string,
		entries: readonly { name: string; description: string }[],
		deps: SettingsTabDeps,
	): void {
		const setting = new Setting(containerEl).setName(deps.t(`${prefix}.label`));
		if (entries.length === 0) {
			setting.setDesc(deps.t(`${prefix}.empty`));
			return;
		}
		const list = setting.descEl.createDiv();
		for (const entry of entries) {
			const row = list.createDiv();
			row.createSpan({ text: entry.name });
			if (entry.description !== '') row.createSpan({ text: ` — ${entry.description}` });
		}
	}

	/** The MCP server manager — list + enable toggles (REQ-SS-080). */
	private renderMcpManager(containerEl: HTMLElement, deps: SettingsTabDeps): void {
		new Setting(containerEl)
			.setName(deps.t('settings.mcp.label'))
			.setDesc(deps.t('settings.mcp.desc'));
		void this.loadMcpServers(containerEl, deps);
	}

	private async loadMcpServers(containerEl: HTMLElement, deps: SettingsTabDeps): Promise<void> {
		const loaded = await deps.mcpConfigStore.load();
		if (!loaded.ok) {
			deps.notify.showError(deps.t('settings.mcp.loadFailed'));
			return;
		}
		const servers = loaded.value;
		if (servers.length === 0) {
			new Setting(containerEl).setDesc(deps.t('settings.mcp.empty'));
			return;
		}
		for (const server of servers) {
			new Setting(containerEl)
				.setName(server.name)
				.addToggle((toggle) =>
					toggle.setValue(server.enabled).onChange((enabled) => {
						void this.setMcpEnabled(deps, servers, server.name, enabled);
					}),
				);
		}
	}

	private async setMcpEnabled(
		deps: SettingsTabDeps,
		servers: readonly ManagedMcpServer[],
		name: string,
		enabled: boolean,
	): Promise<void> {
		const next = servers.map((server) =>
			server.name === name ? { ...server, enabled } : server,
		);
		const result = await deps.mcpConfigStore.save(next);
		if (!result.ok) deps.notify.showError(deps.t('settings.mcp.saveFailed'));
	}

	/** The persisted approval rules — remove-per-rule + clear-all (REQ-SS-082). */
	private renderApprovalRules(containerEl: HTMLElement, deps: SettingsTabDeps): void {
		const setting = new Setting(containerEl)
			.setName(deps.t('settings.approvals.label'))
			.setDesc(deps.t('settings.approvals.desc'));
		void this.loadApprovalRules(containerEl, setting, deps);
	}

	private async loadApprovalRules(
		containerEl: HTMLElement,
		anchor: Setting,
		deps: SettingsTabDeps,
	): Promise<void> {
		const loaded = await deps.approvalRuleStore.loadRules();
		if (!loaded.ok) {
			deps.notify.showError(deps.t('settings.approvals.loadFailed'));
			return;
		}
		const rules = loaded.value;
		if (rules.length === 0) {
			anchor.setDesc(deps.t('settings.approvals.empty'));
			return;
		}
		anchor.addButton((button) =>
			button
				.setButtonText(deps.t('settings.approvals.clear'))
				.setWarning()
				.onClick(() => {
					void this.clearApprovalRules(deps);
				}),
		);
		for (const rule of rules) {
			const summary = `${rule.toolName}${rule.actionPattern !== undefined ? ` ${rule.actionPattern}` : ''} (${rule.decision})`;
			new Setting(containerEl).setName(summary).addButton((button) =>
				button
					.setButtonText(deps.t('settings.approvals.remove'))
					.setWarning()
					.onClick(() => {
						void this.removeApprovalRule(deps, rule.id);
					}),
			);
		}
	}

	private async removeApprovalRule(deps: SettingsTabDeps, id: string): Promise<void> {
		const result = await deps.approvalRuleStore.removeRule(id);
		if (!result.ok) {
			deps.notify.showError(deps.t('settings.approvals.removeFailed'));
			return;
		}
		this.display();
	}

	private async clearApprovalRules(deps: SettingsTabDeps): Promise<void> {
		const result = await deps.approvalRuleStore.clear();
		if (!result.ok) {
			deps.notify.showError(deps.t('settings.approvals.clearFailed'));
			return;
		}
		this.display();
	}

	/** The default permission mode → `defaultPermissionMode` (REQ-SS-083). */
	private renderPermissionMode(
		containerEl: HTMLElement,
		value: PermissionMode,
		deps: SettingsTabDeps,
	): void {
		new Setting(containerEl)
			.setName(deps.t('settings.permissionMode.label'))
			.setDesc(deps.t('settings.permissionMode.desc'))
			.addDropdown((dropdown) => {
				for (const mode of PERMISSION_MODES) {
					dropdown.addOption(mode, deps.t(`settings.permissionMode.${mode}`));
				}
				dropdown.setValue(value).onChange((next) => {
					void this.savePermissionMode(next as PermissionMode);
				});
			});
	}

	private async savePermissionMode(mode: PermissionMode): Promise<void> {
		await this.plugin.updateSettings({ defaultPermissionMode: mode });
	}

	/** The message-pane nav keys → `keyboardNav` via `parseNavMappings` (reject invalid, REQ-SS-070/071). */
	private renderKeyboardNav(
		containerEl: HTMLElement,
		text: string,
		deps: SettingsTabDeps,
	): void {
		new Setting(containerEl)
			.setName(deps.t('settings.keyboardNav.label'))
			.setDesc(deps.t('settings.keyboardNav.desc'))
			.addTextArea((area) =>
				area.setValue(text).onChange((value) => {
					void this.saveKeyboardNav(deps, value);
				}),
			);
	}

	private async saveKeyboardNav(deps: SettingsTabDeps, value: string): Promise<void> {
		if (value.trim() === '') {
			await this.plugin.updateSettings({ keyboardNav: undefined });
			return;
		}
		const parsed = parseNavMappings(value);
		if (parsed.settings === undefined) {
			deps.notify.showWarning(deps.t('settings.keyboardNav.invalid', { reason: parsed.error ?? '' }));
			return;
		}
		await this.plugin.updateSettings({ keyboardNav: parsed.settings });
	}

	/** The device-local provider CLI path → `providerCliPath[id]` (CLAR-SS-006). */
	private renderCliPath(
		containerEl: HTMLElement,
		id: ProviderId,
		path: string,
		deps: SettingsTabDeps,
	): void {
		new Setting(containerEl)
			.setName(deps.t('settings.cliPath.label'))
			.setDesc(deps.t('settings.cliPath.desc'))
			.addText((text) =>
				text
					.setPlaceholder(deps.t('settings.cliPath.placeholder'))
					.setValue(path)
					.onChange((value) => {
						void this.saveCliPath(id, value.trim());
					}),
			);
	}

	private async saveCliPath(id: ProviderId, path: string): Promise<void> {
		const next = { ...(this.plugin.settings.providerCliPath ?? {}), [id]: path };
		await this.plugin.updateSettings({ providerCliPath: next });
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

/** Exhaustiveness guard for the `SettingsControl` union (the renderer's `default` arm). */
function assertNever(control: never): void {
	void control;
}
