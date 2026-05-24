/**
 * T-RR-037 (RED) — `MessageBlocks.vue` ordered dispatcher (TEST-RR-008, EC-RR-1).
 *
 * SPEC-RR-022. The thin dispatcher: iterates `message.contentBlocks` IN ORDER
 * (`v-for` keyed by index) and renders one child per `block.type` —
 * `text`→`MarkdownBlock`, `tool_use`→`ToolCallBlock` (Write/Edit→`WriteEditBlock`,
 * TodoWrite→`TodoList` in the body) resolving `toolCalls.find(t=>t.id===toolId)`
 * (a dangling reference renders nothing, EC-RR-1), `thinking`→`ThinkingBlock`,
 * `subagent`→`SubagentBlock`, `context_compacted`→`ContextCompactedBlock`. Block
 * order is asserted by the `data-block-kind` sequence. Queried by `data-testid`
 * only (ADR-009).
 *
 * Traces: REQ-RR-011/012, NFR-RR-006.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MessageBlocks from '@/ui/chat/MessageBlocks.vue';
import type { ChatMessage } from '@/domain/ports';
import { ICON_PORT, MARKDOWN_RENDER_PORT } from '@/infrastructure/bridge/ports';
import { staticIconPort } from '@/infrastructure/icons/staticIconPort';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { MessageBlocksPageObject } from './MessageBlocks.po';

function mountBlocks(message: ChatMessage) {
	const wrapper = mount(MessageBlocks, {
		props: { message },
		global: {
			provide: {
				[ICON_PORT as symbol]: staticIconPort,
				[MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort,
			},
		},
	});
	return { wrapper, po: new MessageBlocksPageObject(wrapper) };
}

function msg(partial: Partial<ChatMessage>): ChatMessage {
	return { id: 'm1', role: 'assistant', content: '', timestamp: 0, ...partial };
}

describe('MessageBlocks (TEST-RR-008)', () => {
	it('dispatches each block kind IN ORDER (REQ-RR-011)', () => {
		const message = msg({
			contentBlocks: [
				{ type: 'text', content: 'before' },
				{ type: 'thinking', content: 'hmm' },
				{ type: 'tool_use', toolId: 'r1' },
				{ type: 'text', content: 'after' },
				{ type: 'context_compacted' },
			],
			toolCalls: [{ id: 'r1', name: 'Read', input: { file_path: 'a.ts' }, status: 'completed' }],
		});
		const { po } = mountBlocks(message);
		expect(po.exists()).toBe(true);
		expect(po.blockKinds()).toEqual([
			'text',
			'thinking',
			'tool_use',
			'text',
			'context_compacted',
		]);
	});

	it('routes a Read tool_use to ToolCallBlock', () => {
		const message = msg({
			contentBlocks: [{ type: 'tool_use', toolId: 'r1' }],
			toolCalls: [{ id: 'r1', name: 'Read', input: { file_path: 'a.ts' }, status: 'completed' }],
		});
		const { po } = mountBlocks(message);
		expect(po.hasTestid('tool-call-header')).toBe(true);
		expect(po.hasTestid('write-edit-header')).toBe(false);
	});

	it('routes a Write tool_use to WriteEditBlock', () => {
		const message = msg({
			contentBlocks: [{ type: 'tool_use', toolId: 'w1' }],
			toolCalls: [{ id: 'w1', name: 'Write', input: { file_path: 'a.ts' }, status: 'completed' }],
		});
		const { po } = mountBlocks(message);
		expect(po.hasTestid('write-edit-header')).toBe(true);
		expect(po.hasTestid('tool-call-header')).toBe(false);
	});

	it('routes a subagent block to SubagentBlock', () => {
		const message = msg({
			contentBlocks: [{ type: 'subagent', subagentId: 's1' }],
			toolCalls: [
				{
					id: 'task1',
					name: 'Task',
					input: {},
					status: 'completed',
					subagent: {
						id: 's1',
						description: 'sub',
						status: 'completed',
						toolCalls: [],
					},
				},
			],
		});
		const { po } = mountBlocks(message);
		expect(po.hasTestid('subagent-block')).toBe(true);
	});

	it('renders the context_compacted notice', () => {
		const message = msg({ contentBlocks: [{ type: 'context_compacted' }] });
		const { po } = mountBlocks(message);
		expect(po.hasTestid('context-compacted')).toBe(true);
	});

	it('EC-RR-1: a dangling tool_use reference renders nothing', () => {
		const message = msg({
			contentBlocks: [{ type: 'tool_use', toolId: 'missing' }],
			toolCalls: [],
		});
		const { po } = mountBlocks(message);
		expect(po.hasTestid('tool-call-header')).toBe(false);
		expect(po.hasTestid('write-edit-header')).toBe(false);
		expect(po.blockCount()).toBe(0);
	});
});
