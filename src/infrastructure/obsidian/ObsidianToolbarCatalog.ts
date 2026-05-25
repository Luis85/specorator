import type { ToolbarCatalogPort } from '@/domain/ports';
import type { ToolbarCatalog } from '@/domain/chat/toolbar/ToolbarCatalog';
import type { ProviderId } from '@/domain/chat/ProviderId';

/**
 * The real Claude toolbar catalog (SPEC-TC-007, ADR-TC-004 §1) — a STATIC-FOR-NOW
 * load-or-default constant: the Claude model list + the mode descriptor + the effort
 * `ReasoningDescriptor`; NO service-tier descriptor (Claude has no Codex fast-mode, so
 * the service-tier toggle is capability-hidden). Multi-provider catalogs + env-derived
 * custom models are P9/P10 (NG4/NG5). Frozen so the constant cannot be mutated across
 * the boundary.
 */
const CLAUDE_CATALOG: ToolbarCatalog = {
	models: [
		{ id: 'claude-sonnet', label: 'Sonnet', group: 'Recommended' },
		{ id: 'claude-opus', label: 'Opus', group: 'Recommended' },
		{ id: 'claude-haiku', label: 'Haiku', group: 'Fast' },
	],
	defaultModelId: 'claude-sonnet',
	mode: {
		activeValue: 'acceptEdits',
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
 * The real Claude `ToolbarCatalogPort` (SPEC-TC-007). Lives under
 * `src/infrastructure/obsidian/**` (coverage-excluded, §10) — its behavioural gate is
 * the MANUAL leg TEST-TC-M1 (the `ToolbarCatalogPort` wires end-to-end in Obsidian).
 * The Mock/LocalStorage halves (T-TC-010/011) carry the automated proof.
 *
 * Static-for-now: `getCatalog('claude')` returns the {@link CLAUDE_CATALOG} constant.
 * Synchronous + total — NEVER throws across the boundary (NFR-TC-010), the same for
 * every `providerId` (P6 ships only `'claude'`). No `obsidian` symbol leaks past this
 * file — it imports only domain types.
 */
export class ObsidianToolbarCatalog implements ToolbarCatalogPort {
	getCatalog(_providerId: ProviderId): ToolbarCatalog {
		return CLAUDE_CATALOG;
	}
}
