/**
 * The read-only agent/skill + slash discovery mapping (P10, SPEC-SS-008). Reads
 * the P4 `ProviderCommandCatalogPort` (`getEntries('command'|'skill')`) and maps
 * its entries to the read-only `slashList` `{name, description}` + `agentList`
 * `{name, description, kind}` shapes the view-model emits (SPEC-SS-007). There is
 * NO P9 agent/subagent discovery seam, so the agent list falls back to the
 * catalog's `skill` entries and `hasProviderDefinitions(id).agent` is always
 * `false` (REQ-SS-031); the list is OMITTED entirely when both catalogs are empty.
 *
 * Load-or-default — a catalog miss / a rejected `getEntries` resolves `[]`, never
 * throws (NFR-SS-006). Read-only: the mapped rows carry NO write affordance (NG1,
 * REQ-SS-041). No `obsidian`/`node:*`/Vue/class (ADR-001).
 */
import type {
	ProviderCommandCatalogPort,
	CatalogEntry,
} from '@/domain/ports/ProviderCommandCatalogPort';
import { tryAsync } from '@/domain/shared/tryAsync';
import type { ProviderId } from '@/domain/chat/ProviderId';
import type {
	DefinitionEntry,
	AgentDefinitionEntry,
	ProviderDefinitionPresence,
} from './buildSettingsViewModel';

/** The read-only definition lists discovered for a provider section (SPEC-SS-008). */
export interface DiscoveredDefinitions {
	readonly slash: readonly DefinitionEntry[];
	readonly agent: readonly AgentDefinitionEntry[];
}

/** Load `kind` entries, resolving `[]` on any failure (load-or-default, never throws). */
async function loadEntries(
	catalog: ProviderCommandCatalogPort,
	kind: 'command' | 'skill',
): Promise<readonly CatalogEntry[]> {
	const result = await tryAsync(() => catalog.getEntries(kind));
	return result.ok ? result.value : [];
}

/**
 * Map the P4 catalog to the read-only slash + agent (skill-backed) lists
 * (SPEC-SS-008). Total / load-or-default — never throws.
 */
export async function discoverDefinitions(
	catalog: ProviderCommandCatalogPort,
): Promise<DiscoveredDefinitions> {
	const [commands, skills] = await Promise.all([
		loadEntries(catalog, 'command'),
		loadEntries(catalog, 'skill'),
	]);

	const slash: DefinitionEntry[] = commands.map((entry) => ({
		name: entry.name,
		description: entry.description ?? '',
	}));
	const agent: AgentDefinitionEntry[] = skills.map((entry) => ({
		name: entry.name,
		description: entry.description ?? '',
		kind: entry.kind,
	}));

	return { slash, agent };
}

/**
 * Build the `hasProviderDefinitions(id)` predicate `buildSettingsViewModel`
 * consumes (SPEC-SS-006/008). `slash`/`skill` reflect the non-empty catalogs;
 * `agent` is always `false` (no P9 seam, REQ-SS-031) — the agent list is sourced
 * from `skill` entries and omitted when both catalogs are empty. The catalog is
 * provider-agnostic in P4, so the predicate is the same for every provider.
 */
export async function makeHasProviderDefinitions(
	catalog: ProviderCommandCatalogPort,
): Promise<(id: ProviderId) => ProviderDefinitionPresence> {
	const { slash, agent } = await discoverDefinitions(catalog);
	const presence: ProviderDefinitionPresence = {
		slash: slash.length > 0,
		skill: agent.length > 0,
		agent: false,
	};
	return (_id: ProviderId): ProviderDefinitionPresence => presence;
}
