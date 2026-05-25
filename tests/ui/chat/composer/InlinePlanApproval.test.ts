/**
 * T-CP-039 (RED) — `InlinePlanApproval.vue` (TEST-CP-021 A leg, TEST-CP-024 approval A leg).
 *
 * SPEC-CP-024, SPEC-CP-032. Renders an `ApprovalRequest` (tool + context
 * render-only) + the Deny / Allow once / Always allow options
 * (deny/allow/allow-always, REQ-CP-026); the chosen decision →
 * respondApproval(decision). **'allow-always' routes the decision for the CURRENT
 * request only and writes NO persistent rule** (NG3, TEST-CP-021) — the use case
 * has no SettingsPort/history dependency. Escape → cancel (null). Capability-gated
 * identically (read-only + notice when supportsInlineResponse:false, EC-CP-6).
 * Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-CP-026/027/028, NFR-CP-003/007/008.
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

const REQUEST: ApprovalRequest = {
	requestId: 'appr-1',
	tool: 'Bash',
	context: 'Run: rm -rf build',
	options: [
		{ decision: 'deny', label: 'Deny' },
		{ decision: 'allow', label: 'Allow once' },
		{ decision: 'allow-always', label: 'Always allow' },
	],
};

function mountApproval(opts: { capable?: boolean } = {}) {
	const runtime = new MockChatRuntime([]);
	runtime.setSupportsInlineResponse(opts.capable ?? true);
	const respond = new RespondToInlineBlockUseCase(runtime);
	const pending = runtime.emitApprovalRequest(REQUEST);
	const notify = fakeNotify();
	const wrapper = mount(InlinePlanApproval, {
		props: { request: REQUEST, respond, supportsInlineResponse: opts.capable ?? true, notify },
		global: { plugins: [i18n] },
	});
	return { wrapper, respond, runtime, notify, pending };
}

describe('InlinePlanApproval render (TEST-CP-024)', () => {
	it('renders the action context (render-only) + deny/allow/allow-always options', () => {
		const { wrapper } = mountApproval();
		expect(wrapper.find('[data-testid="inline-plan-approval"]').exists()).toBe(true);
		expect(wrapper.find('[data-testid="inline-plan-approval-context"]').text()).toContain(
			'rm -rf build',
		);
		expect(wrapper.find('[data-testid="inline-plan-approval-option-deny"]').exists()).toBe(true);
		expect(wrapper.find('[data-testid="inline-plan-approval-option-allow"]').exists()).toBe(true);
		expect(
			wrapper.find('[data-testid="inline-plan-approval-option-allow-always"]').exists(),
		).toBe(true);
	});
});

describe('InlinePlanApproval respond (TEST-CP-024)', () => {
	it('allow once → respondApproval("allow") + emits resolve', async () => {
		const { wrapper, pending } = mountApproval();
		await wrapper.get('[data-testid="inline-plan-approval-option-allow"]').trigger('click');
		expect(await pending).toBe('allow');
		expect(wrapper.emitted('resolve')).toBeTruthy();
	});

	it('Escape → cancel (null) + emits resolve', async () => {
		const { wrapper, pending } = mountApproval();
		const root = wrapper.get('[data-testid="inline-plan-approval"]');
		root.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
		await wrapper.vm.$nextTick();
		expect(await pending).toBeNull();
		expect(wrapper.emitted('resolve')).toBeTruthy();
	});
});

describe('InlinePlanApproval NG3 — allow-always persists no rule (TEST-CP-021)', () => {
	it('allow-always routes the decision for the current request and writes nothing', async () => {
		const { wrapper, pending } = mountApproval();
		await wrapper
			.get('[data-testid="inline-plan-approval-option-allow-always"]')
			.trigger('click');
		// The decision is routed for THIS request only…
		expect(await pending).toBe('allow-always');
		// …and the component takes no SettingsPort/history collaborator — the only
		// injected collaborators are the use case + the capability flag + notify.
		// The use case (RespondToInlineBlockUseCase) has no settings dependency:
		// constructing it requires only the runtime (no saveSettings call exists).
		const propKeys = Object.keys(wrapper.props() as unknown as Record<string, unknown>);
		expect(propKeys).not.toContain('settings');
		expect(propKeys).not.toContain('history');
		expect(wrapper.emitted('resolve')).toBeTruthy();
	});
});

describe('InlinePlanApproval capability gate (EC-CP-6)', () => {
	it('renders read-only + showInfo when supportsInlineResponse is false; no option buttons', async () => {
		const { wrapper, notify, pending } = mountApproval({ capable: false });
		expect(wrapper.find('[data-testid="inline-plan-approval-readonly"]').exists()).toBe(true);
		expect(wrapper.findAll('[data-testid^="inline-plan-approval-option-"]')).toHaveLength(0);
		expect(notify.showInfo).toHaveBeenCalledTimes(1);
		const sentinel = Symbol('pending');
		expect(await Promise.race([pending, Promise.resolve(sentinel)])).toBe(sentinel);
	});
});
