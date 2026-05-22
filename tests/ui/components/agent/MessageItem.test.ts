/**
 * Tests for `<MessageItem>` — single transcript turn (REQ-AUX-014).
 *
 * Acceptance scope:
 *   - assistant turn renders the bot icon + the resolved model name.
 *   - user turn renders the user icon + the localised "You" label.
 *   - `showTimestamp=false` (default) hides the relative-time element.
 *   - `showTimestamp=true` renders a relative-time string and `<time datetime>`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MessageItem from '@/ui/components/agent/MessageItem.vue';
import { i18n } from '@/ui/i18n';
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { ChatMessage } from '@/domain/chat/ChatMessage';
import type { IconPort, LoggerPort } from '@/domain/ports';
import { MessageItemPageObject } from './MessageItem.po';

function fakeLogger(): LoggerPort {
	return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

function itemProvides() {
	const bridge = new MockBridge() as unknown as IconPort;
	return {
		[ICON_PORT as symbol]: bridge,
		[LOGGER_PORT as symbol]: fakeLogger(),
	};
}

function mkMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
	return {
		id: overrides.id ?? 'm-1',
		threadId: overrides.threadId ?? 't-1',
		role: overrides.role ?? 'assistant',
		text: overrides.text ?? 'hi',
		createdAt: overrides.createdAt ?? new Date('2026-05-22T12:00:00Z').toISOString(),
		truncated: overrides.truncated,
	};
}

interface MountProps {
	message: ChatMessage;
	isLatest?: boolean;
	showTimestamp?: boolean;
	modelName?: string;
	now?: Date;
}

function mountItem(props: MountProps) {
	const wrapper = mount(MessageItem, {
		global: { plugins: [i18n], provide: itemProvides() },
		props,
	});
	return { wrapper, po: new MessageItemPageObject(wrapper) };
}

describe('MessageItem (REQ-AUX-014)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('renders the bot icon and model name for an assistant turn', () => {
		const message = mkMessage({ role: 'assistant' });
		const { po } = mountItem({ message, modelName: 'claude-sonnet-4' });
		expect(po.rootExistsAssistant()).toBe(true);
		expect(po.roleIconName()).toBe('bot');
		expect(po.roleLabelText()).toBe('claude-sonnet-4');
	});

	it('falls back to the localised assistant label when modelName is empty', () => {
		const message = mkMessage({ role: 'assistant' });
		const { po } = mountItem({ message, modelName: '' });
		expect(po.roleIconName()).toBe('bot');
		expect(po.roleLabelText()).toBe('Claude');
	});

	it('renders the user icon and "You" label for a user turn (no model name)', () => {
		const message = mkMessage({ role: 'user', text: 'hello' });
		const { po } = mountItem({ message, modelName: 'should-be-ignored' });
		expect(po.rootExistsUser()).toBe(true);
		expect(po.roleIconName()).toBe('user');
		expect(po.roleLabelText()).toBe('You');
	});

	it('hides the timestamp element by default (showTimestamp omitted)', () => {
		const message = mkMessage({ role: 'assistant' });
		const { po } = mountItem({ message });
		expect(po.timestampExists()).toBe(false);
	});

	it('renders a relative-time stamp when showTimestamp=true', () => {
		const createdAt = new Date('2026-05-22T11:55:00Z').toISOString();
		const now = new Date('2026-05-22T12:00:00Z');
		const message = mkMessage({ role: 'assistant', createdAt });
		const { po } = mountItem({ message, showTimestamp: true, now });
		expect(po.timestampExists()).toBe(true);
		expect(po.timestampDatetime()).toBe(createdAt);
		// 5 minutes ago — the exact phrasing is locale-dependent, but the
		// formatter must produce a non-empty string distinct from the ISO input.
		const text = po.timestampText();
		expect(text.length).toBeGreaterThan(0);
		expect(text).not.toBe(createdAt);
	});

	it('renders the trim notice when the message was truncated', () => {
		const message = mkMessage({ role: 'assistant', truncated: true });
		const { po } = mountItem({ message });
		expect(po.trimExists()).toBe(true);
	});

	it('renders the empty placeholder when the assistant text is empty', () => {
		const message = mkMessage({ role: 'assistant', text: '' });
		const { po } = mountItem({ message });
		expect(po.emptyExists()).toBe(true);
	});
});
