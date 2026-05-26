/**
 * T-AS-026 (RED) — `InlinePlanApproval.vue` +`deny-always` option (TEST-AS-016
 * option-row leg, TEST-AS-022 four-option-row leg, TEST-AS-025 cancel leg).
 *
 * SPEC-AS-015, SPEC-AS-018. The option row gains ONE entry driven by the additive
 * `'deny-always'` `ApprovalDecision` member; the four options render in the fixed
 * SPEC-AS-018 order — Allow once (`allow`) · Always allow (`allow-always`) · Deny once
 * (`deny`) · Always deny (`deny-always`) — each keyboard-operable, Escape cancels
 * (`null`, REQ-AS-025); the tool + `request.context` + layout + focus model are
 * byte-identical to P4 (NG4). Each option carries a `data-decision` attribute (additive)
 * so the surface can target it. Queried by `data-testid`/`data-decision` only (ADR-009).
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import InlinePlanApproval from '@/ui/chat/composer/InlinePlanApproval.vue';
import { RespondToInlineBlockUseCase } from '@/application/chat/composer/RespondToInlineBlockUseCase';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { i18n } from '@/ui/i18n';
import type { ApprovalRequest } from '@/domain/chat/inline';
import type { NotificationPort } from '@/domain/ports';

function fakeNotify(): NotificationPort {
	return {
		showError: vi.fn(),
		showWarning: vi.fn(),
		showSuccess: vi.fn(),
		showInfo: vi.fn(),
	};
}

/** The four options in the fixed SPEC-AS-018 order. */
const FOUR_OPTION_REQUEST: ApprovalRequest = {
	requestId: 'appr-da',
	tool: 'Bash',
	context: 'Run: rm -rf build',
	options: [
		{ decision: 'allow', label: 'Allow once' },
		{ decision: 'allow-always', label: 'Always allow' },
		{ decision: 'deny', label: 'Deny once' },
		{ decision: 'deny-always', label: 'Always deny' },
	],
};

function mountApproval() {
	const runtime = new MockChatRuntime([]);
	runtime.setSupportsInlineResponse(true);
	const respond = new RespondToInlineBlockUseCase(runtime);
	const pending = runtime.emitApprovalRequest(FOUR_OPTION_REQUEST);
	const notify = fakeNotify();
	const wrapper = mount(InlinePlanApproval, {
		props: { request: FOUR_OPTION_REQUEST, respond, supportsInlineResponse: true, notify },
		global: { plugins: [i18n] },
	});
	return { wrapper, pending };
}

describe('InlinePlanApproval +deny-always (SPEC-AS-015/018)', () => {
	it('renders all four options including deny-always with data-decision (TEST-AS-016/022)', () => {
		const { wrapper } = mountApproval();
		const options = wrapper.findAll('[data-decision]');
		expect(options).toHaveLength(4);
		expect(options.map((o) => o.attributes('data-decision'))).toEqual([
			'allow',
			'allow-always',
			'deny',
			'deny-always',
		]);
	});

	it('routes deny-always when its option is activated (TEST-AS-016)', async () => {
		const { wrapper, pending } = mountApproval();
		await wrapper.get('[data-decision="deny-always"]').trigger('click');
		expect(await pending).toBe('deny-always');
		expect(wrapper.emitted('resolve')).toBeTruthy();
	});

	it('Escape cancels with null even with the four-option row (TEST-AS-025)', async () => {
		const { wrapper, pending } = mountApproval();
		const root = wrapper.get('[data-testid="inline-plan-approval"]');
		root.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
		await wrapper.vm.$nextTick();
		expect(await pending).toBeNull();
		expect(wrapper.emitted('resolve')).toBeTruthy();
	});
});
