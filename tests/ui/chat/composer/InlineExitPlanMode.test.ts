/**
 * T-CP-037 (RED) — `InlineExitPlanMode.vue` (TEST-CP-024 exit-plan A leg).
 *
 * SPEC-CP-023, SPEC-CP-032. Renders an `ExitPlanModeRequest` as a "Plan complete"
 * card with a scrollable plan preview + implement / revise / cancel actions
 * (REQ-CP-024). The chosen decision → respondExitPlanMode(decision); revise
 * carries the feedback text ({kind:'revise'; feedback}); Escape → cancel (null).
 * Capability-gated identically to SPEC-CP-022 (read-only + notice when
 * supportsInlineResponse:false, EC-CP-6). Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-CP-024/025/027/028, NFR-CP-003/007/008.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import InlineExitPlanMode from '@/ui/chat/composer/InlineExitPlanMode.vue';
import { RespondToInlineBlockUseCase } from '@/application/chat/composer/RespondToInlineBlockUseCase';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { i18n } from '@/ui/i18n';
import type { ExitPlanModeRequest } from '@/domain/chat/inline';
import type { NotificationPort } from '@/domain/ports';

function fakeNotify(): NotificationPort {
	return {
		showError: vi.fn(),
		showWarning: vi.fn(),
		showSuccess: vi.fn(),
		showInfo: vi.fn(),
	};
}

const REQUEST: ExitPlanModeRequest = {
	requestId: 'plan-1',
	plan: 'Step 1: do the thing.\nStep 2: verify it.',
};

function mountExit(opts: { capable?: boolean } = {}) {
	const runtime = new MockChatRuntime([]);
	runtime.setSupportsInlineResponse(opts.capable ?? true);
	const respond = new RespondToInlineBlockUseCase(runtime);
	const pending = runtime.emitExitPlanMode(REQUEST);
	const notify = fakeNotify();
	const wrapper = mount(InlineExitPlanMode, {
		props: { request: REQUEST, respond, supportsInlineResponse: opts.capable ?? true, notify },
		global: { plugins: [i18n] },
	});
	return { wrapper, respond, notify, pending };
}

describe('InlineExitPlanMode render (TEST-CP-024)', () => {
	it('renders the Plan complete card with the plan preview + implement/revise/cancel', () => {
		const { wrapper } = mountExit();
		expect(wrapper.find('[data-testid="inline-exit-plan"]').exists()).toBe(true);
		expect(wrapper.find('[data-testid="inline-exit-plan-preview"]').text()).toContain('Step 1');
		expect(wrapper.find('[data-testid="inline-exit-plan-implement"]').exists()).toBe(true);
		expect(wrapper.find('[data-testid="inline-exit-plan-revise"]').exists()).toBe(true);
		expect(wrapper.find('[data-testid="inline-exit-plan-cancel"]').exists()).toBe(true);
	});
});

describe('InlineExitPlanMode respond (TEST-CP-024)', () => {
	it('implement → respondExitPlanMode({kind:implement}) + emits resolve', async () => {
		const { wrapper, pending } = mountExit();
		await wrapper.get('[data-testid="inline-exit-plan-implement"]').trigger('click');
		const decision = await pending;
		expect(decision).toEqual({ kind: 'implement' });
		expect(wrapper.emitted('resolve')).toBeTruthy();
	});

	it('revise carries the feedback text ({kind:revise; feedback})', async () => {
		const { wrapper, pending } = mountExit();
		await wrapper.get('[data-testid="inline-exit-plan-revise"]').trigger('click');
		const input = wrapper.get('[data-testid="inline-exit-plan-feedback"]');
		await input.setValue('please add tests');
		await input.trigger('keydown', { key: 'Enter' });
		const decision = await pending;
		expect(decision).toEqual({ kind: 'revise', feedback: 'please add tests' });
	});

	it('Escape → cancel (null) + emits resolve', async () => {
		const { wrapper, pending } = mountExit();
		const root = wrapper.get('[data-testid="inline-exit-plan"]');
		root.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
		await wrapper.vm.$nextTick();
		const decision = await pending;
		expect(decision).toBeNull();
		expect(wrapper.emitted('resolve')).toBeTruthy();
	});
});

describe('InlineExitPlanMode capability gate (EC-CP-6)', () => {
	it('renders read-only + showInfo when supportsInlineResponse is false; no action buttons', async () => {
		const { wrapper, notify, pending } = mountExit({ capable: false });
		expect(wrapper.find('[data-testid="inline-exit-plan-readonly"]').exists()).toBe(true);
		expect(wrapper.find('[data-testid="inline-exit-plan-implement"]').exists()).toBe(false);
		expect(notify.showInfo).toHaveBeenCalledTimes(1);
		const sentinel = Symbol('pending');
		expect(await Promise.race([pending, Promise.resolve(sentinel)])).toBe(sentinel);
	});
});
