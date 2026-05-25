/**
 * Toolbar catalog descriptors (P6, SPEC-TC-003, ADR-TC-004 §1) — the static-for-now
 * per-provider option lists + descriptors the strip renders. Mirrors claudian-main
 * `core/providers/types.ts` (`ProviderChatUIConfig`, `ProviderUIOption`,
 * `ProviderModeSelectorConfig`, `ProviderReasoningOption`,
 * `ProviderServiceTierToggleConfig`). Plain `readonly` DTOs — no class, no
 * `obsidian`, no `node:*`, no Vue (so they cross the Pinia store boundary cleanly,
 * NFR-TC-005). No secret, no path outside the catalog (NFR-TC-011).
 */
import type { ReasoningChoice } from '../Reasoning';

/**
 * One selectable model (REQ-TC-010/011). `group` lets the listbox render group
 * separators. `id` is the {@link import('../ChatTurn').ChatRuntimeQueryOptions.model}
 * value; both `id` + `label` are non-empty (the provider/i18n owns localisation).
 */
export interface ModelOption {
	readonly id: string;
	readonly label: string;
	/** Optional group heading; absent → ungrouped. */
	readonly group?: string;
}

/**
 * A two-option mode descriptor (REQ-TC-013/014); absent on the catalog → the mode
 * selector hides. The two option values must be non-empty and distinct.
 */
export interface ModeDescriptor {
	/** The mode value when the toggle is "on" (REQ-TC-014). */
	readonly activeValue: string;
	/** The mode value when the toggle is "off". */
	readonly inactiveValue: string;
	readonly activeLabel: string;
	readonly inactiveLabel: string;
}

/**
 * The reasoning option set (REQ-TC-017/018); absent / fewer than two options → the
 * thinking selector hides (treated as "no reasoning control" by the view-model).
 */
export interface ReasoningDescriptor {
	/** Matches {@link import('@/domain/ports').ToolbarCapabilities.reasoningControl} when not `'none'`. */
	readonly control: 'effort' | 'token-budget';
	/** `>= 2` to render; a 0/1-option set is treated as "no reasoning control" (REQ-TC-017). */
	readonly options: readonly ReasoningChoice[];
	/** The catalog default (the view-model "selected" mark + the non-default fold). */
	readonly defaultChoice?: ReasoningChoice;
}

/**
 * A service-tier toggle descriptor (REQ-TC-019/020); absent (Claude) → the toggle is
 * capability-hidden. The active/inactive values must be distinct.
 */
export interface ServiceTierDescriptor {
	readonly activeValue: string;
	readonly inactiveValue: string;
	readonly label: string;
}

/**
 * The full per-provider toolbar catalog (static-for-now for Claude, ADR-TC-004 §1).
 * A missing model list / descriptor degrades the dependent widget (the view-model is
 * total, NFR-TC-010).
 */
export interface ToolbarCatalog {
	/** May be empty → the model selector shows the persisted value + an empty notice. */
	readonly models: readonly ModelOption[];
	/** The provider default (the view-model "selected" fallback). */
	readonly defaultModelId?: string;
	/** Absent → the mode selector hidden (REQ-TC-013). */
	readonly mode?: ModeDescriptor;
	/** Absent / `'none'` / single → the thinking selector hidden (REQ-TC-017). */
	readonly reasoning?: ReasoningDescriptor;
	/** Absent → the service-tier toggle hidden (REQ-TC-019). */
	readonly serviceTier?: ServiceTierDescriptor;
}
