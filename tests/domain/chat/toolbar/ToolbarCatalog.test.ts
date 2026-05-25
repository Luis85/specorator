/**
 * T-TC-002 (TEST-TC-010/013/017/019 type-shape legs) — RED: the `ToolbarCatalog`
 * descriptor DTOs (`ModelOption`/`ModeDescriptor`/`ReasoningDescriptor`/
 * `ServiceTierDescriptor`/`ToolbarCatalog`) match SPEC-TC-003 shapes — all
 * `readonly`, re-exported from `@/domain/chat/toolbar/index`.
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-TC-004 adds the descriptor DTOs.
 *
 * Traces: TEST-TC-010, TEST-TC-013, TEST-TC-017, TEST-TC-019, SPEC-TC-003,
 * REQ-TC-010, REQ-TC-011, REQ-TC-013, REQ-TC-017, REQ-TC-019.
 */
import { describe, it, expect } from 'vitest';
import type {
	ModelOption,
	ModeDescriptor,
	ReasoningDescriptor,
	ServiceTierDescriptor,
	ToolbarCatalog,
} from '@/domain/chat/toolbar';
import type { ReasoningChoice } from '@/domain/chat/Reasoning';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- ModelOption: id / label / group? (REQ-TC-010/011) ----
const _modelKeys: Equals<keyof ModelOption, 'id' | 'label' | 'group'> = true;
const _modelId: Equals<ModelOption['id'], string> = true;
const _modelLabel: Equals<ModelOption['label'], string> = true;
const _modelGroup: Equals<ModelOption['group'], string | undefined> = true;
void _modelKeys;
void _modelId;
void _modelLabel;
void _modelGroup;

// ---- ModeDescriptor: activeValue / inactiveValue / activeLabel / inactiveLabel ----
const _modeKeys: Equals<
	keyof ModeDescriptor,
	'activeValue' | 'inactiveValue' | 'activeLabel' | 'inactiveLabel'
> = true;
const _modeActive: Equals<ModeDescriptor['activeValue'], string> = true;
const _modeInactive: Equals<ModeDescriptor['inactiveValue'], string> = true;
void _modeKeys;
void _modeActive;
void _modeInactive;

// ---- ReasoningDescriptor: control / options / defaultChoice? ----
const _reasoningKeys: Equals<
	keyof ReasoningDescriptor,
	'control' | 'options' | 'defaultChoice'
> = true;
const _reasoningControl: Equals<ReasoningDescriptor['control'], 'effort' | 'token-budget'> = true;
const _reasoningOptions: Equals<ReasoningDescriptor['options'], readonly ReasoningChoice[]> = true;
const _reasoningDefault: Equals<ReasoningDescriptor['defaultChoice'], ReasoningChoice | undefined> =
	true;
void _reasoningKeys;
void _reasoningControl;
void _reasoningOptions;
void _reasoningDefault;

// ---- ServiceTierDescriptor: activeValue / inactiveValue / label ----
const _tierKeys: Equals<keyof ServiceTierDescriptor, 'activeValue' | 'inactiveValue' | 'label'> =
	true;
void _tierKeys;

// ---- ToolbarCatalog: models / defaultModelId? / mode? / reasoning? / serviceTier? ----
const _catalogKeys: Equals<
	keyof ToolbarCatalog,
	'models' | 'defaultModelId' | 'mode' | 'reasoning' | 'serviceTier'
> = true;
const _catalogModels: Equals<ToolbarCatalog['models'], readonly ModelOption[]> = true;
const _catalogDefault: Equals<ToolbarCatalog['defaultModelId'], string | undefined> = true;
const _catalogMode: Equals<ToolbarCatalog['mode'], ModeDescriptor | undefined> = true;
const _catalogReasoning: Equals<ToolbarCatalog['reasoning'], ReasoningDescriptor | undefined> = true;
const _catalogTier: Equals<ToolbarCatalog['serviceTier'], ServiceTierDescriptor | undefined> = true;
void _catalogKeys;
void _catalogModels;
void _catalogDefault;
void _catalogMode;
void _catalogReasoning;
void _catalogTier;

describe('ToolbarCatalog descriptor DTOs (TEST-TC-010/013/017/019)', () => {
	it('constructs a full Claude-shaped catalog', () => {
		const catalog: ToolbarCatalog = {
			models: [
				{ id: 'sonnet', label: 'Claude Sonnet', group: 'Claude' },
				{ id: 'opus', label: 'Claude Opus', group: 'Claude' },
			],
			defaultModelId: 'sonnet',
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
		expect(catalog.models).toHaveLength(2);
		expect(catalog.reasoning?.options).toHaveLength(3);
		expect(catalog.serviceTier).toBeUndefined();
	});

	it('allows an empty model list (degrade path)', () => {
		const catalog: ToolbarCatalog = { models: [] };
		expect(catalog.models).toHaveLength(0);
		expect(catalog.mode).toBeUndefined();
	});
});
