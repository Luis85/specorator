/**
 * `buildToolbarViewModel` (P6, SPEC-TC-011/018/029, ADR-TC-003/004) — the pure/total
 * decision function: which toolbar widgets show, their current value, their seam
 * state. Reads ONLY `catalog` + `capabilities` + `controls` + `usage` — never a
 * per-provider branch (SPEC-TC-029). The seam widgets (permission/MCP/external) are
 * decided from `capabilities` + `catalog` descriptors alone (hidden vs visible-disabled
 * per ADR-TC-003/004). Pure + total — never throws (NFR-TC-010); no `obsidian`/
 * `node:*`/Vue import.
 */
import type {
	ToolbarCatalog,
	ModelOption,
	ModeDescriptor,
	ServiceTierDescriptor,
} from '@/domain/chat/toolbar/ToolbarCatalog';
import type { TabControls } from '@/domain/chat/toolbar/TabControls';
import type { ToolbarCapabilities } from '@/domain/ports';
import type { UsageInfo } from '@/domain/chat/UsageInfo';
import type { ReasoningChoice } from '@/domain/chat/Reasoning';

/** The usage-meter warning threshold (percent, SPEC-TC-018). Warning strictly above. */
export const USAGE_WARNING_THRESHOLD = 80;

export type WidgetVisibility =
	| { kind: 'visible'; enabled: boolean }
	| { kind: 'hidden' };

export interface ModelWidgetVm {
	visibility: WidgetVisibility;
	options: readonly ModelOption[];
	selectedId?: string;
	emptyNotice: boolean;
}

export interface ModeWidgetVm {
	visibility: WidgetVisibility;
	descriptor?: ModeDescriptor;
	activeValue?: string;
}

export interface ThinkingWidgetVm {
	visibility: WidgetVisibility;
	control: 'effort' | 'token-budget' | 'none';
	options: readonly ReasoningChoice[];
	selected?: ReasoningChoice;
}

export interface ServiceTierWidgetVm {
	visibility: WidgetVisibility;
	descriptor?: ServiceTierDescriptor;
	active: boolean;
}

export interface PermissionWidgetVm {
	visibility: WidgetVisibility;
	plan: boolean;
	deferred: true;
}

export interface McpWidgetVm {
	visibility: WidgetVisibility;
	empty: true;
}

export interface ExternalWidgetVm {
	visibility: WidgetVisibility;
	deferred: true;
}

export interface UsageWidgetVm {
	visibility: WidgetVisibility;
	percentage: number;
	warning: boolean;
}

export interface ToolbarViewModel {
	model: ModelWidgetVm;
	mode: ModeWidgetVm;
	permission: PermissionWidgetVm;
	thinking: ThinkingWidgetVm;
	serviceTier: ServiceTierWidgetVm;
	mcp: McpWidgetVm;
	external: ExternalWidgetVm;
	usage: UsageWidgetVm;
}

/**
 * Decide every toolbar widget's view-model slice from the catalog + capabilities +
 * the per-tab controls + the current usage. Pure + total — never throws; a partial /
 * empty catalog hides the dependent widget (NFR-TC-010, EC-TC-3). No per-provider
 * branch (SPEC-TC-029).
 */
export function buildToolbarViewModel(
	catalog: ToolbarCatalog,
	capabilities: ToolbarCapabilities,
	controls: TabControls,
	usage: UsageInfo | null,
): ToolbarViewModel {
	return {
		model: buildModel(catalog, controls),
		mode: buildMode(catalog, capabilities, controls),
		permission: buildPermission(capabilities),
		thinking: buildThinking(catalog, capabilities, controls),
		serviceTier: buildServiceTier(catalog, capabilities, controls),
		mcp: buildMcp(capabilities),
		external: buildExternal(),
		usage: buildUsage(usage),
	};
}

function buildModel(catalog: ToolbarCatalog, controls: TabControls): ModelWidgetVm {
	return {
		visibility: { kind: 'visible', enabled: true },
		options: catalog.models,
		selectedId: controls.model ?? catalog.defaultModelId,
		emptyNotice: catalog.models.length === 0,
	};
}

function buildMode(
	catalog: ToolbarCatalog,
	capabilities: ToolbarCapabilities,
	controls: TabControls,
): ModeWidgetVm {
	const descriptor = catalog.mode;
	if (!capabilities.hasModeToggle || descriptor === undefined) {
		return { visibility: { kind: 'hidden' } };
	}
	return {
		visibility: { kind: 'visible', enabled: true },
		descriptor,
		activeValue: controls.mode ?? descriptor.inactiveValue,
	};
}

function buildThinking(
	catalog: ToolbarCatalog,
	capabilities: ToolbarCapabilities,
	controls: TabControls,
): ThinkingWidgetVm {
	const descriptor = catalog.reasoning;
	if (
		capabilities.reasoningControl === 'none' ||
		descriptor === undefined ||
		descriptor.options.length < 2
	) {
		return { visibility: { kind: 'hidden' }, control: capabilities.reasoningControl, options: [] };
	}
	return {
		visibility: { kind: 'visible', enabled: true },
		control: capabilities.reasoningControl,
		options: descriptor.options,
		selected: controls.reasoning ?? descriptor.defaultChoice,
	};
}

function buildServiceTier(
	catalog: ToolbarCatalog,
	capabilities: ToolbarCapabilities,
	controls: TabControls,
): ServiceTierWidgetVm {
	const descriptor = catalog.serviceTier;
	if (!capabilities.hasServiceTier || descriptor === undefined) {
		return { visibility: { kind: 'hidden' }, active: false };
	}
	return {
		visibility: { kind: 'visible', enabled: true },
		descriptor,
		active: controls.serviceTier === descriptor.activeValue,
	};
}

function buildPermission(capabilities: ToolbarCapabilities): PermissionWidgetVm {
	return {
		visibility: { kind: 'visible', enabled: false },
		plan: capabilities.permissionMode === 'plan',
		deferred: true,
	};
}

function buildMcp(capabilities: ToolbarCapabilities): McpWidgetVm {
	if (!capabilities.supportsMcpTools) {
		return { visibility: { kind: 'hidden' }, empty: true };
	}
	return { visibility: { kind: 'visible', enabled: false }, empty: true };
}

function buildExternal(): ExternalWidgetVm {
	return { visibility: { kind: 'visible', enabled: false }, deferred: true };
}

function buildUsage(usage: UsageInfo | null): UsageWidgetVm {
	if (usage === null) {
		return { visibility: { kind: 'hidden' }, percentage: 0, warning: false };
	}
	return {
		visibility: { kind: 'visible', enabled: true },
		percentage: usage.percentage,
		warning: usage.percentage > USAGE_WARNING_THRESHOLD,
	};
}
