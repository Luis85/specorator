/**
 * `buildSettingsViewModel` (P10, SPEC-SS-006/007, ADR-SS-002) — the PURE, total,
 * deterministic settings-shell view-model. Derives the ordered, capability-gated
 * `SettingsViewModel` from the settings + the provider registry + the toolbar
 * catalog + the secret-key SET (keys, never values) + the read-only definition
 * predicate.
 *
 * DTO only — no domain instance, no Obsidian/DOM reference crosses the boundary
 * (REQ-SS-002, NFR-SS-002). **No member carries a secret value** — `apiKeyField`
 * carries only a tri-state; `envScopeEditor`/`envSnippetList` carry masked
 * `secretRef` placeholders only (SPEC-SS-017/019). Provider-varying behaviour gates
 * on the capability bag + the registry's enabled list — **no `switch (providerId)`
 * / `if (provider === …)`** (NFR-SS-008, SPEC-SS-021). Pure + total — never throws;
 * no class, no `obsidian`, no `node:*`, no Vue (application layer, ADR-001).
 */
import type { ProviderId } from '@/domain/chat/ProviderId';
import type { PermissionMode } from '@/domain/chat/PermissionMode';
import type { ProviderRegistryPort } from '@/domain/ports/ProviderRegistryPort';
import { providerSecretKey } from '@/domain/ports/SecretStorePort';
import type { ToolbarCatalog, ModelOption } from '@/domain/chat/toolbar/ToolbarCatalog';
import type { PluginSettings } from '@/domain/settings/PluginSettings';
import { DEFAULT_CHAT_PROVIDER_ID } from '@/domain/chat/providers/ProviderDescriptor';
import type { EnvironmentScope } from '@/domain/chat/environment/EnvSnippet';

/** The state of the per-provider API-key field (the value NEVER crosses, REQ-SS-014). */
export type ApiKeyFieldState = 'unavailable' | 'set' | 'unset';

/** One read-only discovered-definition row (agent/skill or slash). No write affordance. */
export interface DefinitionEntry {
	readonly name: string;
	readonly description: string;
}

/** One read-only agent/skill row carrying its kind (REQ-SS-030). */
export interface AgentDefinitionEntry extends DefinitionEntry {
	readonly kind: string;
}

/** One persisted snippet's listed identity (the secret values are never carried). */
export interface SnippetListEntry {
	readonly id: string;
	readonly name: string;
	readonly scope?: EnvironmentScope;
}

/**
 * The 14-member discriminated union the DOM renders (SPEC-SS-007). Each member
 * carries its i18n keys + the data the control needs — never a secret value. The
 * renderer `switch (control.kind)`es exhaustively over `kind` (the ONE allowed
 * switch, SPEC-SS-021); it never branches on `providerId`.
 */
export type SettingsControl =
	| { readonly kind: 'coreField'; readonly fieldKey: string }
	| { readonly kind: 'providerToggle'; readonly providerId: ProviderId; readonly enabled: boolean }
	| { readonly kind: 'apiKeyField'; readonly providerId: ProviderId; readonly state: ApiKeyFieldState }
	| {
			readonly kind: 'modelPicker';
			readonly providerId: ProviderId;
			readonly models: readonly ModelOption[];
			readonly selectedId?: string;
			readonly empty: boolean;
	  }
	| { readonly kind: 'envScopeEditor'; readonly scope: EnvironmentScope }
	| { readonly kind: 'envSnippetList'; readonly snippets: readonly SnippetListEntry[] }
	| { readonly kind: 'agentList'; readonly providerId: ProviderId; readonly entries: readonly AgentDefinitionEntry[] }
	| { readonly kind: 'slashList'; readonly providerId: ProviderId; readonly entries: readonly DefinitionEntry[] }
	| { readonly kind: 'mcpManager'; readonly providerId: ProviderId }
	| { readonly kind: 'mcpDocNote'; readonly providerId: ProviderId; readonly noteKey: string }
	| { readonly kind: 'approvalRules' }
	| { readonly kind: 'permissionMode'; readonly value: PermissionMode }
	| { readonly kind: 'keyboardNav'; readonly text: string }
	| { readonly kind: 'cliPath'; readonly providerId: ProviderId; readonly path: string };

/** One settings section — the shared section, a provider section, or the environment section. */
export interface SettingsSection {
	readonly key: 'shared' | `provider:${ProviderId}` | 'environment';
	readonly titleKey: string;
	readonly controls: readonly SettingsControl[];
}

export interface SettingsViewModel {
	readonly sections: readonly SettingsSection[];
}

/** Which read-only definition lists a provider exposes (SPEC-SS-008, supplied by the caller). */
export interface ProviderDefinitionPresence {
	readonly slash: boolean;
	readonly skill: boolean;
	readonly agent: boolean;
}

export interface BuildSettingsViewModelInput {
	readonly settings: PluginSettings;
	readonly registry: ProviderRegistryPort;
	readonly getCatalog: (id: ProviderId) => ToolbarCatalog;
	/** From `SecretStorePort.listKeys()` — keys, never values (REQ-SS-014). */
	readonly secretKeysSet: ReadonlySet<string>;
	/** From `SecretStorePort.isAvailable()` (REQ-SS-015). */
	readonly secretStorageAvailable: boolean;
	/** From the P4 discovery mapping (SPEC-SS-008). */
	readonly hasProviderDefinitions: (id: ProviderId) => ProviderDefinitionPresence;
}

const DEFAULT_PERMISSION_MODE: PermissionMode = 'normal';

/** Build the shared/core section — the P0 core fields, then the cross-provider prefs. */
function buildSharedSection(settings: PluginSettings): SettingsSection {
	const controls: SettingsControl[] = [
		{ kind: 'coreField', fieldKey: 'locale' },
		{ kind: 'coreField', fieldKey: 'logLevel' },
		{ kind: 'permissionMode', value: settings.defaultPermissionMode ?? DEFAULT_PERMISSION_MODE },
		{ kind: 'keyboardNav', text: buildKeyboardNavText(settings) },
	];
	return { key: 'shared', titleKey: 'settings.section.shared', controls };
}

/** The persisted nav mappings rendered as the canonical text (empty when unset → defaults apply). */
function buildKeyboardNavText(settings: PluginSettings): string {
	const nav = settings.keyboardNav;
	if (nav === undefined) return '';
	return `map ${nav.scrollUpKey} scrollUp\nmap ${nav.scrollDownKey} scrollDown\nmap ${nav.focusInputKey} focusInput`;
}

/** The API-key tri-state for a needs-key provider (REQ-SS-011..015). */
function resolveApiKeyState(
	id: ProviderId,
	secretKeysSet: ReadonlySet<string>,
	secretStorageAvailable: boolean,
): ApiKeyFieldState {
	if (!secretStorageAvailable) return 'unavailable';
	return secretKeysSet.has(providerSecretKey(id)) ? 'set' : 'unset';
}

/** The model picker for a provider — preselect the persisted default else the catalog default. */
function buildModelPicker(id: ProviderId, catalog: ToolbarCatalog, settings: PluginSettings): SettingsControl {
	const selectedId = settings.providerDefaultModel?.[id] ?? catalog.defaultModelId;
	return {
		kind: 'modelPicker',
		providerId: id,
		models: catalog.models,
		empty: catalog.models.length === 0,
		...(selectedId !== undefined ? { selectedId } : {}),
	};
}

/** Build one provider section's controls, gated entirely on the capability bag. */
function buildProviderSection(id: ProviderId, input: BuildSettingsViewModelInput): SettingsSection {
	const { settings, registry, getCatalog, secretKeysSet, secretStorageAvailable, hasProviderDefinitions } = input;
	const caps = registry.getCapabilities(id);
	const definitions = hasProviderDefinitions(id);
	const controls: SettingsControl[] = [];

	// A non-Claude provider leads with its enable toggle; Claude (always enabled,
	// its membership implicit) carries none (REQ-SS-003/004). Read from the
	// descriptor's enablement predicate — never a provider-id branch.
	const descriptor = registry.getDescriptor(id);
	if (id !== DEFAULT_CHAT_PROVIDER_ID) {
		controls.push({ kind: 'providerToggle', providerId: id, enabled: descriptor.isEnabled(settings) });
	}

	if (caps.needsApiKey) {
		controls.push({
			kind: 'apiKeyField',
			providerId: id,
			state: resolveApiKeyState(id, secretKeysSet, secretStorageAvailable),
		});
	}

	controls.push(buildModelPicker(id, getCatalog(id), settings));

	if (caps.supportsProviderCommands && definitions.slash) {
		controls.push({ kind: 'slashList', providerId: id, entries: [] });
	}

	if (definitions.agent || definitions.skill) {
		controls.push({ kind: 'agentList', providerId: id, entries: [] });
	}

	if (caps.supportsMcpTools) {
		controls.push({ kind: 'mcpManager', providerId: id });
	} else {
		controls.push({ kind: 'mcpDocNote', providerId: id, noteKey: 'settings.mcp.codexNote' });
	}

	// Approvals + permission mode are provider-agnostic (P7); the approvals list
	// renders unconditionally in every provider section (REQ-SS-082).
	controls.push({ kind: 'approvalRules' });

	return { key: `provider:${id}`, titleKey: 'settings.section.provider', controls };
}

/** Build the environment section — shared + per-enabled-provider editors, then the snippet list. */
function buildEnvironmentSection(
	enabledIds: readonly ProviderId[],
	settings: PluginSettings,
): SettingsSection {
	const controls: SettingsControl[] = [{ kind: 'envScopeEditor', scope: 'shared' }];
	for (const id of enabledIds) {
		controls.push({ kind: 'envScopeEditor', scope: `provider:${id}` });
	}
	const snippets: SnippetListEntry[] = (settings.envSnippets ?? []).map((struct) => ({
		id: struct.id,
		name: struct.name,
		...(struct.scope !== undefined ? { scope: struct.scope } : {}),
	}));
	controls.push({ kind: 'envSnippetList', snippets });
	return { key: 'environment', titleKey: 'settings.section.environment', controls };
}

/**
 * Build the ordered, capability-gated settings view-model (SPEC-SS-006). The
 * section order is `[shared, …enabled providers in blank-tab order, environment]`;
 * each section emits only the controls its capability bag supports. Pure + total.
 */
export function buildSettingsViewModel(input: BuildSettingsViewModelInput): SettingsViewModel {
	const enabled = input.registry.listEnabledProviders(input.settings);
	const enabledIds = enabled.map((descriptor) => descriptor.id);

	const sections: SettingsSection[] = [buildSharedSection(input.settings)];
	for (const descriptor of enabled) {
		sections.push(buildProviderSection(descriptor.id, input));
	}
	sections.push(buildEnvironmentSection(enabledIds, input.settings));

	return { sections };
}
