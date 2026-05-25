import type { ProviderId } from '@/domain/chat/ProviderId';
import type { ToolbarCatalog } from '@/domain/chat/toolbar/ToolbarCatalog';

/**
 * The toolbar option-list + descriptor source (SPEC-TC-004, ADR-TC-004 §1).
 * Claudian ground-truth: `ProviderChatUIConfig` (the per-provider UI config no
 * existing port supplies). New narrow port — one consumer (the toolbar view-model);
 * one port (ADR-008). Static-for-now: the Claude catalog is a load-or-default
 * constant; multi-provider + env-derived custom models are P9/P10 (NG4/NG5).
 */
export interface ToolbarCatalogPort {
	/**
	 * The toolbar option lists + descriptors for `providerId` (model list, mode /
	 * reasoning / service-tier descriptors). Synchronous + total: never throws — an
	 * unknown provider or a load miss resolves a safe default (an empty-models /
	 * no-descriptor catalog the view-model degrades from, NFR-TC-010). NEVER branched
	 * on by the consumer (REQ-TC-003) — the consumer reads the returned catalog. The
	 * result is **stable** for the same provider (a pure read of a constant in P6).
	 */
	getCatalog(providerId: ProviderId): ToolbarCatalog;
}
