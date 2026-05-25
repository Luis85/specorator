/**
 * T-CP-035 (RED) — `InlineAskUserQuestion.vue` (TEST-CP-019, TEST-CP-024 ask-user A leg).
 *
 * SPEC-CP-022, SPEC-CP-032. Renders an `AskUserQuestionRequest` in place of the
 * composer (REQ-CP-027). Arrow navigates items, Left/Right or Tab/Shift+Tab switch
 * question tabs (REQ-CP-022), Enter selects/advances, Escape cancels (resolve
 * `null`). `allowCustomInput` offers a free-text field. A complete answer →
 * `RespondToInlineBlockUseCase.respondAskUserQuestion(answer)`. Capability-gated:
 * when `supportsInlineResponse === false` the block renders read-only + a
 * `NotificationPort.showInfo` note — not answerable, callback never reached, no
 * lost response (EC-CP-6). Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-CP-022/023/027/028, NFR-CP-003/007/008.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import InlineAskUserQuestion from '@/ui/chat/composer/InlineAskUserQuestion.vue';
import { RespondToInlineBlockUseCase } from '@/application/chat/composer/RespondToInlineBlockUseCase';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { i18n } from '@/ui/i18n';
import type { AskUserQuestionRequest } from '@/domain/chat/inline';
import type { NotificationPort } from '@/domain/ports';

function fakeNotify(): NotificationPort {
	return {
		showError: vi.fn(),
		showWarning: vi.fn(),
		showSuccess: vi.fn(),
		showInfo: vi.fn(),
	};
}

const SINGLE: AskUserQuestionRequest = {
	requestId: 'req-1',
	questions: [
		{
			id: 'colour',
			question: 'Pick a colour',
			options: [
				{ id: 'red', label: 'Red' },
				{ id: 'blue', label: 'Blue' },
			],
		},
	],
};

const MULTI: AskUserQuestionRequest = {
	requestId: 'req-2',
	questions: [
		{ id: 'q1', question: 'First', options: [{ id: 'a', label: 'Alpha' }] },
		{ id: 'q2', question: 'Second', options: [{ id: 'b', label: 'Beta' }] },
	],
};

const CUSTOM: AskUserQuestionRequest = {
	requestId: 'req-3',
	questions: [
		{
			id: 'name',
			question: 'Your name?',
			options: [{ id: 'anon', label: 'Anonymous' }],
			allowCustomInput: true,
		},
	],
};

function mountAsk(
	request: AskUserQuestionRequest,
	opts: { capable?: boolean } = {},
) {
	const runtime = new MockChatRuntime([]);
	runtime.setSupportsInlineResponse(opts.capable ?? true);
	const respond = new RespondToInlineBlockUseCase(runtime);
	// Bind a pending callback so a resolved answer is observable.
	const pending = runtime.emitAskUserQuestion(request);
	const notify = fakeNotify();
	const wrapper = mount(InlineAskUserQuestion, {
		props: {
			request,
			respond,
			supportsInlineResponse: opts.capable ?? true,
			notify,
		},
		global: { plugins: [i18n] },
	});
	return { wrapper, runtime, respond, notify, pending };
}

describe('InlineAskUserQuestion render (TEST-CP-019)', () => {
	it('renders the question in place of the composer', () => {
		const { wrapper } = mountAsk(SINGLE);
		expect(wrapper.find('[data-testid="inline-ask"]').exists()).toBe(true);
		expect(wrapper.text()).toContain('Pick a colour');
		expect(wrapper.findAll('[data-testid^="inline-ask-option-"]')).toHaveLength(2);
	});

	it('renders one tab per question for a multi-question block (REQ-CP-022)', () => {
		const { wrapper } = mountAsk(MULTI);
		expect(wrapper.findAll('[data-testid^="inline-ask-tab-"]').length).toBeGreaterThanOrEqual(2);
	});

	it('offers a free-text field when allowCustomInput is set', () => {
		const { wrapper } = mountAsk(CUSTOM);
		expect(wrapper.find('[data-testid="inline-ask-custom"]').exists()).toBe(true);
	});
});

describe('InlineAskUserQuestion respond (TEST-CP-019/024 ask-user A leg)', () => {
	it('a complete answer routes to respondAskUserQuestion and emits resolve', async () => {
		const { wrapper, pending } = mountAsk(SINGLE);
		await wrapper.get('[data-testid="inline-ask-option-1"]').trigger('click');
		const answer = await pending;
		expect(answer).not.toBeNull();
		expect(answer?.answers.colour).toBe('blue');
		expect(wrapper.emitted('resolve')).toBeTruthy();
	});

	it('Escape cancels — resolves null and emits resolve (REQ-CP-022)', async () => {
		const { wrapper, pending } = mountAsk(SINGLE);
		const root = wrapper.get('[data-testid="inline-ask"]');
		const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
		root.element.dispatchEvent(event);
		await wrapper.vm.$nextTick();
		const answer = await pending;
		expect(answer).toBeNull();
		expect(wrapper.emitted('resolve')).toBeTruthy();
	});
});

describe('InlineAskUserQuestion capability gate (EC-CP-6, TEST-CP-024)', () => {
	it('renders read-only + a showInfo notice when supportsInlineResponse is false', () => {
		const { wrapper, notify } = mountAsk(SINGLE, { capable: false });
		expect(wrapper.find('[data-testid="inline-ask-readonly"]').exists()).toBe(true);
		expect(notify.showInfo).toHaveBeenCalledTimes(1);
	});

	it('the read-only block never reaches the callback (no lost response)', async () => {
		const { wrapper, pending } = mountAsk(SINGLE, { capable: false });
		// No clickable options in read-only mode — options are not rendered as actionable.
		expect(wrapper.findAll('[data-testid^="inline-ask-option-"]')).toHaveLength(0);
		// The pending callback is still unresolved (no decision routed). Race it against a tick.
		const sentinel = Symbol('pending');
		const winner = await Promise.race([
			pending,
			Promise.resolve(sentinel),
		]);
		expect(winner).toBe(sentinel);
	});
});
