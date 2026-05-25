/**
 * T-TS-032 (RED) — `MessageTurn.vue` P3 fork/rewind affordance extension
 * (TEST-TS-017 A leg + TEST-TS-023).
 *
 * SPEC-TS-024/025, REQ-TS-016/019/020/021/022, EC-TS-8/9/15. Each user message's
 * hover toolbar gains a fork control (shown iff `canFork`) and a rewind control
 * (shown iff `canRewind`) — both gates are computed by the parent THROUGH the
 * runtime port (never a provider branch). Activating rewind opens a two-mode menu
 * with exactly two distinctly-iconed options; conversation-only emits
 * `rewind-conversation`, code-and-conversation emits `rewind-code`. Fork emits
 * `fork`. Queried by `data-testid` only (ADR-009).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MessageTurn from '@/ui/chat/MessageTurn.vue';
import { i18n } from '@/ui/i18n';
import { MARKDOWN_RENDER_PORT, ICON_PORT } from '@/infrastructure/bridge/ports';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { ChatMessage } from '@/domain/ports';
import { MessageTurnPageObject } from './MessageTurn.po';

const bridge = new MockBridge();

function userMsg(): ChatMessage {
	return { id: 'u1', role: 'user', content: 'Do the thing', timestamp: 1 };
}

function assistantMsg(): ChatMessage {
	return { id: 'a1', role: 'assistant', content: 'Done', timestamp: 2 };
}

function mountTurn(props: {
	message: ChatMessage;
	canFork?: boolean;
	canRewind?: boolean;
}) {
	const wrapper = mount(MessageTurn, {
		props: {
			message: props.message,
			streaming: false,
			interrupted: false,
			canFork: props.canFork ?? false,
			canRewind: props.canRewind ?? false,
		},
		global: {
			plugins: [i18n],
			provide: {
				[MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort,
				[ICON_PORT as symbol]: bridge.createIconPort(),
			},
		},
	});
	return { wrapper, po: new MessageTurnPageObject(wrapper) };
}

describe('MessageTurn P3 affordances (SPEC-TS-024/025)', () => {
	it('EC-TS-15: fork control hidden when canFork is false', () => {
		const { po } = mountTurn({ message: userMsg(), canFork: false, canRewind: false });
		expect(po.hasForkButton()).toBe(false);
	});

	it('REQ-TS-016: fork control shown on a user message when canFork is true', () => {
		const { po } = mountTurn({ message: userMsg(), canFork: true });
		expect(po.hasForkButton()).toBe(true);
	});

	it('TEST-TS-023: fork control is absent on assistant messages', () => {
		const { po } = mountTurn({ message: assistantMsg(), canFork: true, canRewind: true });
		expect(po.hasForkButton()).toBe(false);
		expect(po.hasRewindButton()).toBe(false);
	});

	it('EC-TS-8/15: rewind control hidden when canRewind is false', () => {
		const { po } = mountTurn({ message: userMsg(), canRewind: false });
		expect(po.hasRewindButton()).toBe(false);
	});

	it('REQ-TS-019: rewind control shown when canRewind is true', () => {
		const { po } = mountTurn({ message: userMsg(), canRewind: true });
		expect(po.hasRewindButton()).toBe(true);
	});

	it('REQ-TS-016: clicking fork emits a fork event with the message id', async () => {
		const { wrapper, po } = mountTurn({ message: userMsg(), canFork: true });
		await po.clickFork();
		expect(wrapper.emitted('fork')?.[0]).toEqual(['u1']);
	});

	it('TEST-TS-023: rewind opens a two-mode menu with exactly two distinct options', async () => {
		const { po } = mountTurn({ message: userMsg(), canRewind: true });
		expect(po.rewindMenuOpen()).toBe(false);
		await po.clickRewind();
		expect(po.rewindMenuOpen()).toBe(true);
		expect(po.rewindOptionCount()).toBe(2);
	});

	it('REQ-TS-021: choosing conversation-only emits rewind-conversation with the id', async () => {
		const { wrapper, po } = mountTurn({ message: userMsg(), canRewind: true });
		await po.clickRewind();
		await po.clickRewindConversation();
		expect(wrapper.emitted('rewind-conversation')?.[0]).toEqual(['u1']);
	});

	it('TEST-TS-017 / EC-TS-9: choosing code-and-conversation emits rewind-code (no fs by the component)', async () => {
		const { wrapper, po } = mountTurn({ message: userMsg(), canRewind: true });
		await po.clickRewind();
		await po.clickRewindCode();
		expect(wrapper.emitted('rewind-code')?.[0]).toEqual(['u1']);
	});
});
