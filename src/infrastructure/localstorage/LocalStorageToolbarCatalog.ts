import type { ToolbarCatalogPort } from '@/domain/ports';
import type { ToolbarCatalog } from '@/domain/chat/toolbar/ToolbarCatalog';
import type { ProviderId } from '@/domain/chat/ProviderId';

/**
 * The fixed inert Claude-shaped catalog the GitHub Pages demo renders (SPEC-TC-009):
 * a small model list + the mode descriptor + the effort `ReasoningDescriptor`; NO
 * service-tier (so the demo shows the backed model/mode widgets + the honest-defer
 * seams, never a live service-tier). Frozen so the browser-safe constant cannot be
 * mutated across the boundary.
 */
const DEMO_CATALOG: ToolbarCatalog = {
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
 * Inert `ToolbarCatalogPort` for the (deferred) GitHub Pages demo (SPEC-TC-009,
 * ADR-TC-003 §3). A fixed browser-safe canned Claude catalog so the demo renders the
 * full strip with the backed widgets + the honest seams; it reads no provider state
 * and is the same for every `providerId`. Synchronous + total — NEVER throws across
 * the boundary (NFR-TC-010). No `obsidian`, no `node:*`.
 */
export class LocalStorageToolbarCatalog implements ToolbarCatalogPort {
	getCatalog(_providerId: ProviderId): ToolbarCatalog {
		return DEMO_CATALOG;
	}
}
