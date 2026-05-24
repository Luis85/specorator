/**
 * T-CC-023 (RED) — `MessageTurn.vue` role-distinct render + streaming/interrupted
 * markers (TEST-CC-008, TEST-CC-011 render leg, EC-8).
 *
 * SPEC-CC-019. User turn → `message-user`; assistant turn → `message-assistant`;
 * `data-streaming="true"` on the live assistant message; an Interrupted badge
 * (`message-interrupted`) when the message is the interrupted one; `dir="auto"`.
 * Content renders through `MarkdownBlock` (markdown port provided). Queried by
 * `data-testid` only (ADR-009).
 *
 * Traces: REQ-CC-004, 006, 010.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MessageTurn from '@/ui/chat/MessageTurn.vue';
import { i18n } from '@/ui/i18n';
import { MARKDOWN_RENDER_PORT } from '@/infrastructure/bridge/ports';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import type { ChatMessage } from '@/domain/ports';
import { MessageTurnPageObject } from './MessageTurn.po';

function msg(partial: Partial<ChatMessage>): ChatMessage {
	return { id: 'm1', role: 'assistant', content: '', timestamp: 0, ...partial };
}

function mountTurn(props: {
	message: ChatMessage;
	streaming?: boolean;
	interrupted?: boolean;
}) {
	const wrapper = mount(MessageTurn, {
		props: {
			message: props.message,
			streaming: props.streaming ?? false,
			interrupted: props.interrupted ?? false,
		},
		global: {
			plugins: [i18n],
			provide: { [MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort },
		},
	});
	return { wrapper, po: new MessageTurnPageObject(wrapper) };
}

describe('MessageTurn (TEST-CC-008/011)', () => {
	it('renders a user turn under data-testid="message-user"', () => {
		const { po } = mountTurn({ message: msg({ role: 'user', content: 'Hi' }) });
		expect(po.isUser()).toBe(true);
		expect(po.isAssistant()).toBe(false);
		expect(po.text()).toContain('Hi');
	});

	it('renders an assistant turn under data-testid="message-assistant"', () => {
		const { po } = mountTurn({ message: msg({ role: 'assistant', content: 'Reply' }) });
		expect(po.isAssistant()).toBe(true);
		expect(po.isUser()).toBe(false);
		expect(po.text()).toContain('Reply');
	});

	it('sets data-streaming="true" on the live assistant message', () => {
		const { po } = mountTurn({ message: msg({ role: 'assistant' }), streaming: true });
		expect(po.streamingAttr()).toBe('true');
	});

	it('does not set data-streaming when not the live message', () => {
		const { po } = mountTurn({ message: msg({ role: 'assistant' }), streaming: false });
		expect(po.streamingAttr()).toBeUndefined();
	});

	it('EC-8: shows the Interrupted badge when the message is interrupted (REQ-CC-010)', () => {
		const { po } = mountTurn({ message: msg({ role: 'assistant' }), interrupted: true });
		expect(po.hasInterruptedBadge()).toBe(true);
	});

	it('does not show the Interrupted badge otherwise', () => {
		const { po } = mountTurn({ message: msg({ role: 'assistant' }) });
		expect(po.hasInterruptedBadge()).toBe(false);
	});

	it('carries dir="auto" for mixed RTL/LTR content', () => {
		const { po } = mountTurn({ message: msg({ role: 'assistant', content: 'hi' }) });
		expect(po.dirAttr()).toBe('auto');
	});
});
