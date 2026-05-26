/**
 * The PURE, TOTAL provider chooser + capability-gated widget view-model (P9,
 * SPEC-PV-015, ADR-PV-001 §4). Derives the chooser rows + the toolbar/composer
 * widget visibility DTO from the enabled descriptors + the ACTIVE provider's frozen
 * capability bag.
 *
 * DTO only — no domain instance crosses the store boundary (NFR-PV-002). The widget
 * flags read the capability bag field-for-field; the gating is the bag, never branched
 * on the provider id (NFR-PV-014, SPEC-PV-029). Pure + total — never throws.
 * No class, no `obsidian`, no `node:*`, no Vue (application layer, ADR-001).
 */
import type { ProviderId } from '@/domain/chat/ProviderId';
import type {
	ProviderCapabilities,
	ProviderDescriptor,
} from '@/domain/chat/providers/ProviderDescriptor';
import { DEFAULT_CHAT_PROVIDER_ID } from '@/domain/chat/providers/ProviderDescriptor';

/** One chooser row (REQ-PV-090). DTO. */
export interface ProviderOptionVM {
	readonly id: ProviderId;
	readonly displayNameKey: string;
	readonly isActive: boolean;
	/** `id === DEFAULT_CHAT_PROVIDER_ID` (Claude is the complete default). */
	readonly isDefault: boolean;
}

/** Which toolbar/composer affordances render for the active provider (REQ-PV-013/024). DTO. */
export interface ProviderWidgetVM {
	readonly showRewind: boolean; // capabilities.supportsRewind
	readonly showFork: boolean; // capabilities.supportsFork
	readonly showTurnSteer: boolean; // capabilities.supportsTurnSteer
	readonly showProviderCommands: boolean; // capabilities.supportsProviderCommands
	readonly showMcp: boolean; // capabilities.supportsMcpTools
	/** The service-tier toggle — backed only by a turn-steer provider (Codex), REQ-PV-064. */
	readonly showServiceTier: boolean;
	readonly reasoningControl: ProviderCapabilities['reasoningControl'];
}

/** The chooser + widget view-model (REQ-PV-006/090). DTO. */
export interface ProviderViewModel {
	/** The chooser rows in blank-tab order; `[]` when nothing is enabled. */
	readonly options: readonly ProviderOptionVM[];
	/** True only when the chooser renders at all (> 1 enabled); false ⇒ byte-identical P8. */
	readonly showChooser: boolean;
	readonly active: ProviderId;
	readonly widgets: ProviderWidgetVM;
}

/**
 * Build the chooser + widget VM from the enabled descriptors (already blank-tab-
 * ordered, SPEC-PV-003) + the active capability bag (REQ-PV-006/013/024/090). Pure +
 * total.
 */
export function buildProviderViewModel(
	enabled: readonly ProviderDescriptor[],
	active: ProviderId,
	activeCapabilities: ProviderCapabilities,
): ProviderViewModel {
	const options: ProviderOptionVM[] = enabled.map((descriptor) => ({
		id: descriptor.id,
		displayNameKey: descriptor.displayNameKey,
		isActive: descriptor.id === active,
		isDefault: descriptor.id === DEFAULT_CHAT_PROVIDER_ID,
	}));

	return {
		options,
		showChooser: enabled.length > 1,
		active,
		widgets: {
			showRewind: activeCapabilities.supportsRewind,
			showFork: activeCapabilities.supportsFork,
			showTurnSteer: activeCapabilities.supportsTurnSteer,
			showProviderCommands: activeCapabilities.supportsProviderCommands,
			showMcp: activeCapabilities.supportsMcpTools,
			showServiceTier: activeCapabilities.supportsTurnSteer,
			reasoningControl: activeCapabilities.reasoningControl,
		},
	};
}
