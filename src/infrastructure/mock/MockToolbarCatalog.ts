import type { ToolbarCatalogPort } from '@/domain/ports';
import type { ToolbarCatalog } from '@/domain/chat/toolbar/ToolbarCatalog';
import type { ProviderId } from '@/domain/chat/ProviderId';

/**
 * The default small Claude-shaped catalog the Mock returns before any
 * `setToolbarCatalog` (SPEC-TC-008): a two-model list, a mode descriptor, and an
 * effort `ReasoningDescriptor` (≥ 2 options so the thinking selector renders); NO
 * service-tier (Claude → the service-tier toggle is capability-hidden).
 */
const DEFAULT_MOCK_CATALOG: ToolbarCatalog = {
	models: [
		{ id: 'claude-sonnet', label: 'Sonnet', group: 'Recommended' },
		{ id: 'claude-opus', label: 'Opus', group: 'Recommended' },
	],
	defaultModelId: 'claude-sonnet',
	mode: {
		activeValue: 'accept-edits',
		inactiveValue: 'default',
		activeLabel: 'Accept edits',
		inactiveLabel: 'Default',
	},
	reasoning: {
		control: 'effort',
		options: [
			{ kind: 'effort', value: 'high' },
			{ kind: 'effort', value: 'medium' },
			{ kind: 'effort', value: 'low' },
		],
		defaultChoice: { kind: 'effort', value: 'medium' },
	},
};

/**
 * Scriptable Mock `ToolbarCatalogPort` (SPEC-TC-008 catalog leg, ADR-TC-004 §1) for
 * `npm run dev` + unit tests. The view-model + widget tests inject every catalog
 * shape through this stub instead of a real provider — custom models, grouped
 * models, effort vs token-budget reasoning, with/without a mode descriptor,
 * with/without a service-tier descriptor, an EMPTY model list for the degrade path
 * (NFR-TC-010, EC-TC-3).
 *
 * Scripting (mirrors `MockAuxModel`'s `setAuxResponse` idiom):
 *   - default `getCatalog('claude')` → {@link DEFAULT_MOCK_CATALOG};
 *   - `setToolbarCatalog(catalog)` → `getCatalog` returns the injected catalog.
 *
 * Synchronous + total: NEVER throws across the boundary (NFR-TC-010); the result is
 * stable for repeated reads of the same scripted catalog. No `obsidian`, no `node:*`.
 */
export class MockToolbarCatalog implements ToolbarCatalogPort {
	private scripted: ToolbarCatalog | null = null;

	/** Test hook: the next `getCatalog` returns the injected `catalog`. */
	setToolbarCatalog(catalog: ToolbarCatalog): void {
		this.scripted = catalog;
	}

	getCatalog(_providerId: ProviderId): ToolbarCatalog {
		// Total — no provider branch, no throw: the scripted catalog when set, else the
		// Claude-shaped default (NFR-TC-010, REQ-TC-003).
		return this.scripted ?? DEFAULT_MOCK_CATALOG;
	}
}
