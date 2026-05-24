/**
 * T-RR-037 (RED) — `MessageTurn.vue` blocks-vs-content fork (TEST-RR-023, EC-RR-13).
 *
 * SPEC-RR-023. The only P2 change: when `message.contentBlocks` is present the
 * turn renders `MessageBlocks`; otherwise it falls back to the P1 `MarkdownBlock`
 * over `message.content` (stored-vs-live parity, collapsed by default — EC-RR-13).
 * All other P1 behaviour (role-distinct treatment, `data-streaming`, the
 * Interrupted badge, `dir="auto"`) is unchanged — the existing P1 MessageTurn
 * tests stay green. Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-RR-012/018, NFR-RR-006.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MessageTurn from '@/ui/chat/MessageTurn.vue';
import { i18n } from '@/ui/i18n';
import { ICON_PORT, MARKDOWN_RENDER_PORT } from '@/infrastructure/bridge/ports';
import { staticIconPort } from '@/infrastructure/icons/staticIconPort';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import type { ChatMessage } from '@/domain/ports';
import { MessageTurnPageObject } from './MessageTurn.po';

function msg(partial: Partial<ChatMessage>): ChatMessage {
	return { id: 'm1', role: 'assistant', content: '', timestamp: 0, ...partial };
}

function mountTurn(props: { message: ChatMessage; streaming?: boolean; interrupted?: boolean }) {
	const wrapper = mount(MessageTurn, {
		props: {
			message: props.message,
			streaming: props.streaming ?? false,
			interrupted: props.interrupted ?? false,
		},
		global: {
			plugins: [i18n],
			provide: {
				[MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort,
				[ICON_PORT as symbol]: staticIconPort,
			},
		},
	});
	return { wrapper, po: new MessageTurnPageObject(wrapper) };
}

describe('MessageTurn fork (TEST-RR-023)', () => {
	it('renders via MessageBlocks when contentBlocks is present', () => {
		const { po } = mountTurn({
			message: msg({
				content: 'fallback',
				contentBlocks: [{ type: 'text', content: 'block text' }],
			}),
		});
		expect(po.hasBlocks()).toBe(true);
	});

	it('falls back to the P1 MarkdownBlock/content path when contentBlocks is absent', () => {
		const { po } = mountTurn({ message: msg({ content: 'plain reply' }) });
		expect(po.hasBlocks()).toBe(false);
		expect(po.hasMarkdownBlock()).toBe(true);
		expect(po.text()).toContain('plain reply');
	});

	it('keeps the assistant marker + data-streaming on the blocks path', () => {
		const { po } = mountTurn({
			message: msg({ contentBlocks: [{ type: 'text', content: 'x' }] }),
			streaming: true,
		});
		expect(po.isAssistant()).toBe(true);
		expect(po.streamingAttr()).toBe('true');
	});

	it('EC-RR-13: keeps the Interrupted badge on the blocks path', () => {
		const { po } = mountTurn({
			message: msg({ contentBlocks: [{ type: 'text', content: 'x' }] }),
			interrupted: true,
		});
		expect(po.hasInterruptedBadge()).toBe(true);
	});

	it('a user turn with contentBlocks still renders the user bubble', () => {
		const { po } = mountTurn({
			message: msg({ role: 'user', content: 'hi', contentBlocks: [{ type: 'text', content: 'hi' }] }),
		});
		expect(po.isUser()).toBe(true);
	});
});
