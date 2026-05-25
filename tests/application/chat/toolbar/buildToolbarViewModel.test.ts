/**
 * TEST-TC-003/010/013/017/019/021/027/030 (VM legs) + the EC-TC-2/3/4/5/7 legs —
 * `buildToolbarViewModel` pure/total per-widget decision.
 *
 * SPEC-TC-011: `buildToolbarViewModel(catalog, capabilities, controls, usage)` decides
 * per-widget `visible`/`enabled`/`selected` + the usage-meter view, reading ONLY
 * `capabilities` + `catalog` + `controls` + `usage` — never a `providerId` branch
 * (SPEC-TC-029). The usage warning is strictly above `USAGE_WARNING_THRESHOLD = 80`.
 * A partial/empty catalog hides the dependent widget without throwing (NFR-TC-010).
 *
 * Traces: TEST-TC-003, TEST-TC-010 (VM leg), TEST-TC-013 (VM leg), TEST-TC-017 (VM
 * leg), TEST-TC-019 (VM leg), TEST-TC-021 (VM leg), TEST-TC-027 (VM leg),
 * TEST-TC-030, SPEC-TC-011, SPEC-TC-018, SPEC-TC-029, REQ-TC-003/010/013/015/016/017/
 * 019/021/023/027, NFR-TC-010, EC-TC-2/3/4/5/7.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
	buildToolbarViewModel,
	USAGE_WARNING_THRESHOLD,
} from '@/application/chat/toolbar/buildToolbarViewModel';
import type { ToolbarCatalog } from '@/domain/chat/toolbar/ToolbarCatalog';
import type { TabControls } from '@/domain/chat/toolbar/TabControls';
import type { ToolbarCapabilities } from '@/domain/ports';
import type { UsageInfo } from '@/domain/chat/UsageInfo';

const CLAUDE_CAPS: ToolbarCapabilities = {
	supportsMcpTools: false,
	reasoningControl: 'effort',
	hasServiceTier: false,
	hasModeToggle: true,
	permissionMode: 'default',
};

const FULL_CATALOG: ToolbarCatalog = {
	models: [
		{ id: 'opus', label: 'Opus', group: 'Claude' },
		{ id: 'sonnet', label: 'Sonnet', group: 'Claude' },
	],
	defaultModelId: 'sonnet',
	mode: { activeValue: 'verbose', inactiveValue: 'concise', activeLabel: 'Verbose', inactiveLabel: 'Concise' },
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

const EMPTY_CATALOG: ToolbarCatalog = { models: [] };

const usage = (percentage: number): UsageInfo => ({
	inputTokens: 100,
	contextWindow: 200000,
	contextTokens: 1000,
	percentage,
});

describe('USAGE_WARNING_THRESHOLD', () => {
	it('is exactly 80 (SPEC-TC-018)', () => {
		expect(USAGE_WARNING_THRESHOLD).toBe(80);
	});
});

describe('buildToolbarViewModel — model widget (TEST-TC-010 VM leg)', () => {
	it('always visible/enabled with the catalog options', () => {
		const vm = buildToolbarViewModel(FULL_CATALOG, CLAUDE_CAPS, {}, null);
		expect(vm.model.visibility).toEqual({ kind: 'visible', enabled: true });
		expect(vm.model.options).toEqual(FULL_CATALOG.models);
		expect(vm.model.emptyNotice).toBe(false);
	});

	it('selectedId = controls.model when set', () => {
		const controls: TabControls = { model: 'opus' };
		const vm = buildToolbarViewModel(FULL_CATALOG, CLAUDE_CAPS, controls, null);
		expect(vm.model.selectedId).toBe('opus');
	});

	it('selectedId falls back to catalog.defaultModelId', () => {
		const vm = buildToolbarViewModel(FULL_CATALOG, CLAUDE_CAPS, {}, null);
		expect(vm.model.selectedId).toBe('sonnet');
	});

	it('empty model list -> visible with emptyNotice (EC-TC-3, NFR-TC-010)', () => {
		const vm = buildToolbarViewModel(EMPTY_CATALOG, CLAUDE_CAPS, { model: 'persisted' }, null);
		expect(vm.model.visibility).toEqual({ kind: 'visible', enabled: true });
		expect(vm.model.options).toEqual([]);
		expect(vm.model.emptyNotice).toBe(true);
		expect(vm.model.selectedId).toBe('persisted');
	});
});

describe('buildToolbarViewModel — mode widget (TEST-TC-013 VM leg, EC-TC-2)', () => {
	it('visible when hasModeToggle && catalog.mode present', () => {
		const vm = buildToolbarViewModel(FULL_CATALOG, CLAUDE_CAPS, {}, null);
		expect(vm.mode.visibility).toEqual({ kind: 'visible', enabled: true });
		expect(vm.mode.descriptor).toEqual(FULL_CATALOG.mode);
		expect(vm.mode.activeValue).toBe('concise');
	});

	it('activeValue = controls.mode when set', () => {
		const vm = buildToolbarViewModel(FULL_CATALOG, CLAUDE_CAPS, { mode: 'verbose' }, null);
		expect(vm.mode.activeValue).toBe('verbose');
	});

	it('hidden when hasModeToggle is false', () => {
		const caps: ToolbarCapabilities = { ...CLAUDE_CAPS, hasModeToggle: false };
		const vm = buildToolbarViewModel(FULL_CATALOG, caps, {}, null);
		expect(vm.mode.visibility).toEqual({ kind: 'hidden' });
	});

	it('hidden when catalog.mode absent', () => {
		const vm = buildToolbarViewModel(EMPTY_CATALOG, CLAUDE_CAPS, {}, null);
		expect(vm.mode.visibility).toEqual({ kind: 'hidden' });
	});
});

describe('buildToolbarViewModel — thinking widget (TEST-TC-017 VM leg, EC-TC-4)', () => {
	it('visible with options + selected default', () => {
		const vm = buildToolbarViewModel(FULL_CATALOG, CLAUDE_CAPS, {}, null);
		expect(vm.thinking.visibility).toEqual({ kind: 'visible', enabled: true });
		expect(vm.thinking.control).toBe('effort');
		expect(vm.thinking.options).toEqual(FULL_CATALOG.reasoning?.options);
		expect(vm.thinking.selected).toEqual({ kind: 'effort', value: 'medium' });
	});

	it('selected = controls.reasoning when set', () => {
		const controls: TabControls = { reasoning: { kind: 'effort', value: 'high' } };
		const vm = buildToolbarViewModel(FULL_CATALOG, CLAUDE_CAPS, controls, null);
		expect(vm.thinking.selected).toEqual({ kind: 'effort', value: 'high' });
	});

	it('hidden when reasoningControl is none (EC-TC-4)', () => {
		const caps: ToolbarCapabilities = { ...CLAUDE_CAPS, reasoningControl: 'none' };
		const vm = buildToolbarViewModel(FULL_CATALOG, caps, {}, null);
		expect(vm.thinking.visibility).toEqual({ kind: 'hidden' });
	});

	it('hidden when catalog.reasoning absent', () => {
		const vm = buildToolbarViewModel(EMPTY_CATALOG, CLAUDE_CAPS, {}, null);
		expect(vm.thinking.visibility).toEqual({ kind: 'hidden' });
	});

	it('hidden when fewer than 2 options (single, EC-TC-4)', () => {
		const single: ToolbarCatalog = {
			models: [],
			reasoning: { control: 'effort', options: [{ kind: 'effort', value: 'high' }] },
		};
		const vm = buildToolbarViewModel(single, CLAUDE_CAPS, {}, null);
		expect(vm.thinking.visibility).toEqual({ kind: 'hidden' });
	});
});

describe('buildToolbarViewModel — serviceTier widget (TEST-TC-019 VM leg, EC-TC-2)', () => {
	const TIER_CATALOG: ToolbarCatalog = {
		models: [],
		serviceTier: { activeValue: 'priority', inactiveValue: 'standard', label: 'Priority' },
	};

	it('hidden on Claude (!hasServiceTier, EC-TC-2)', () => {
		const vm = buildToolbarViewModel(TIER_CATALOG, CLAUDE_CAPS, {}, null);
		expect(vm.serviceTier.visibility).toEqual({ kind: 'hidden' });
	});

	it('hidden when descriptor absent even if capable', () => {
		const caps: ToolbarCapabilities = { ...CLAUDE_CAPS, hasServiceTier: true };
		const vm = buildToolbarViewModel(EMPTY_CATALOG, caps, {}, null);
		expect(vm.serviceTier.visibility).toEqual({ kind: 'hidden' });
	});

	it('visible/enabled with active reflecting controls.serviceTier', () => {
		const caps: ToolbarCapabilities = { ...CLAUDE_CAPS, hasServiceTier: true };
		const vm = buildToolbarViewModel(TIER_CATALOG, caps, { serviceTier: 'priority' }, null);
		expect(vm.serviceTier.visibility).toEqual({ kind: 'visible', enabled: true });
		expect(vm.serviceTier.descriptor).toEqual(TIER_CATALOG.serviceTier);
		expect(vm.serviceTier.active).toBe(true);
	});

	it('active false when controls.serviceTier is the inactive value', () => {
		const caps: ToolbarCapabilities = { ...CLAUDE_CAPS, hasServiceTier: true };
		const vm = buildToolbarViewModel(TIER_CATALOG, caps, { serviceTier: 'standard' }, null);
		expect(vm.serviceTier.active).toBe(false);
	});
});

describe('buildToolbarViewModel — permission widget (EC-TC-5)', () => {
	it('always visible-disabled, deferred true', () => {
		const vm = buildToolbarViewModel(FULL_CATALOG, CLAUDE_CAPS, {}, null);
		expect(vm.permission.visibility).toEqual({ kind: 'visible', enabled: false });
		expect(vm.permission.deferred).toBe(true);
		expect(vm.permission.plan).toBe(false);
	});

	it('plan true when permissionMode is plan (EC-TC-5)', () => {
		const caps: ToolbarCapabilities = { ...CLAUDE_CAPS, permissionMode: 'plan' };
		const vm = buildToolbarViewModel(FULL_CATALOG, caps, {}, null);
		expect(vm.permission.plan).toBe(true);
	});
});

describe('buildToolbarViewModel — mcp widget (TEST-TC-021 VM leg, EC-TC-2)', () => {
	it('hidden when !supportsMcpTools', () => {
		const vm = buildToolbarViewModel(FULL_CATALOG, CLAUDE_CAPS, {}, null);
		expect(vm.mcp.visibility).toEqual({ kind: 'hidden' });
	});

	it('visible-empty when supportsMcpTools', () => {
		const caps: ToolbarCapabilities = { ...CLAUDE_CAPS, supportsMcpTools: true };
		const vm = buildToolbarViewModel(FULL_CATALOG, caps, {}, null);
		expect(vm.mcp.visibility).toEqual({ kind: 'visible', enabled: false });
		expect(vm.mcp.empty).toBe(true);
	});
});

describe('buildToolbarViewModel — external widget', () => {
	it('always visible-disabled, deferred true', () => {
		const vm = buildToolbarViewModel(FULL_CATALOG, CLAUDE_CAPS, {}, null);
		expect(vm.external.visibility).toEqual({ kind: 'visible', enabled: false });
		expect(vm.external.deferred).toBe(true);
	});
});

describe('buildToolbarViewModel — usage widget (TEST-TC-027 VM leg, EC-TC-7)', () => {
	it('hidden when usage is null (EC-TC-7)', () => {
		const vm = buildToolbarViewModel(FULL_CATALOG, CLAUDE_CAPS, {}, null);
		expect(vm.usage.visibility).toEqual({ kind: 'hidden' });
	});

	it('visible with percentage, no warning at or below 80', () => {
		const at = buildToolbarViewModel(FULL_CATALOG, CLAUDE_CAPS, {}, usage(80));
		expect(at.usage.visibility).toEqual({ kind: 'visible', enabled: true });
		expect(at.usage.percentage).toBe(80);
		expect(at.usage.warning).toBe(false);

		const below = buildToolbarViewModel(FULL_CATALOG, CLAUDE_CAPS, {}, usage(42));
		expect(below.usage.warning).toBe(false);
	});

	it('warning strictly above 80', () => {
		const vm = buildToolbarViewModel(FULL_CATALOG, CLAUDE_CAPS, {}, usage(81));
		expect(vm.usage.warning).toBe(true);
		expect(vm.usage.percentage).toBe(81);
	});
});

describe('buildToolbarViewModel — degrade + totality (EC-TC-3, NFR-TC-010)', () => {
	it('empty catalog hides the dependent widgets, never throws', () => {
		expect(() => buildToolbarViewModel(EMPTY_CATALOG, CLAUDE_CAPS, {}, null)).not.toThrow();
		const vm = buildToolbarViewModel(EMPTY_CATALOG, CLAUDE_CAPS, {}, null);
		expect(vm.mode.visibility).toEqual({ kind: 'hidden' });
		expect(vm.thinking.visibility).toEqual({ kind: 'hidden' });
		expect(vm.serviceTier.visibility).toEqual({ kind: 'hidden' });
		expect(vm.model.visibility.kind).toBe('visible');
	});
});

describe('buildToolbarViewModel — no providerId branch (SPEC-TC-029, TEST-TC-003)', () => {
	it('source references no providerId and no "claude" literal', () => {
		const src = readFileSync(
			fileURLToPath(new URL('../../../../src/application/chat/toolbar/buildToolbarViewModel.ts', import.meta.url)),
			'utf8',
		);
		expect(src).not.toMatch(/providerId/);
		expect(src).not.toMatch(/['"`]claude['"`]/i);
	});
});
