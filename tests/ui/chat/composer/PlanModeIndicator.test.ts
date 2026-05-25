/**
 * T-CP-033 (RED) — `PlanModeIndicator.vue` + the plan-mode toggle (TEST-CP-018).
 *
 * SPEC-CP-021, SPEC-CP-032. When `active`, the indicator renders the teal "PLAN"
 * label (the non-colour cue is the label TEXT, NFR-CP-008); when not active it
 * renders nothing. The `Shift+Tab` toggle lives in `useComposerMode.handleKeydown`
 * (SPEC-CP-018): it toggles `planActive` iff `runtime.getCapabilities()
 * .supportsPlanMode` (capability-gated, never a provider branch) and consumes the
 * keydown so focus stays in the composer; inert when `supportsPlanMode === false`
 * (honest gating, EC-CP-7). Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-CP-020/021, NFR-CP-007/008.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PlanModeIndicator from '@/ui/chat/composer/PlanModeIndicator.vue';
import { useComposerMode } from '@/ui/chat/composer/useComposerMode';
import { RunCommandUseCase } from '@/application/chat/composer/RunCommandUseCase';
import { ResolveMentionUseCase } from '@/application/chat/composer/ResolveMentionUseCase';
import { SubmitBangBashUseCase } from '@/application/chat/composer/SubmitBangBashUseCase';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import {
	MockMentionDataProvider,
	MockProviderCommandCatalog,
	MockShellExec,
} from '@/infrastructure/mock/MockComposerPorts';
import { PlanModeIndicatorPageObject } from './PlanModeIndicator.po';

function mountIndicator(active: boolean) {
	const wrapper = mount(PlanModeIndicator, { props: { active } });
	return { wrapper, po: new PlanModeIndicatorPageObject(wrapper) };
}

function makeArbiter(runtime: MockChatRuntime) {
	return useComposerMode({
		runCommand: new RunCommandUseCase(),
		resolveMention: new ResolveMentionUseCase(new MockMentionDataProvider()),
		submitBangBash: new SubmitBangBashUseCase(new MockShellExec()),
		catalog: new MockProviderCommandCatalog(),
		runtime,
		onInsert: vi.fn(),
		onAction: vi.fn(),
		onBangBashOutput: vi.fn(),
		getValue: () => '',
		getCaret: () => 0,
	});
}

describe('PlanModeIndicator render (TEST-CP-018)', () => {
	it('renders the "PLAN" label when active (the non-colour cue is the text)', () => {
		const { po } = mountIndicator(true);
		expect(po.exists()).toBe(true);
		expect(po.label()).toContain('PLAN');
	});

	it('renders nothing when not active (honest gating)', () => {
		const { po } = mountIndicator(false);
		expect(po.exists()).toBe(false);
	});
});

describe('PlanModeIndicator toggle via useComposerMode (TEST-CP-018, EC-CP-7)', () => {
	it('Shift+Tab toggles planActive on a capable runtime and the indicator appears', async () => {
		const runtime = new MockChatRuntime();
		runtime.setSupportsPlanMode(true);
		const arbiter = makeArbiter(runtime);
		const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
		const handled = arbiter.handleKeydown(event);
		expect(handled).toBe(true);
		expect(event.defaultPrevented).toBe(true); // focus stays in the composer
		expect(arbiter.mode.value.planActive).toBe(true);
		const { po } = mountIndicator(arbiter.mode.value.planActive);
		expect(po.exists()).toBe(true);
	});

	it('EC-CP-7: Shift+Tab is inert when supportsPlanMode is false (no toggle, indicator hidden)', () => {
		const runtime = new MockChatRuntime();
		runtime.setSupportsPlanMode(false);
		const arbiter = makeArbiter(runtime);
		const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
		const handled = arbiter.handleKeydown(event);
		expect(handled).toBe(false);
		expect(arbiter.mode.value.planActive).toBe(false);
		const { po } = mountIndicator(arbiter.mode.value.planActive);
		expect(po.exists()).toBe(false);
	});
});
