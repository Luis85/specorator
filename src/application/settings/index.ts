/**
 * Barrel for the settings-shell application layer (SPEC-SS-006..009). Pure /
 * port-driven — no `obsidian`/`node:*`/Vue (ADR-001, NFR-SS-003).
 */
export {
	buildSettingsViewModel,
	type SettingsViewModel,
	type SettingsSection,
	type SettingsControl,
	type ApiKeyFieldState,
	type DefinitionEntry,
	type AgentDefinitionEntry,
	type SnippetListEntry,
	type ProviderDefinitionPresence,
	type BuildSettingsViewModelInput,
} from './buildSettingsViewModel';
export {
	discoverDefinitions,
	makeHasProviderDefinitions,
	type DiscoveredDefinitions,
} from './discoverDefinitions';
