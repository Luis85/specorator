/**
 * T-RR-033 (RED) — `SubagentBlock.vue` lifecycle + nested tools (TEST-RR-020, EC-RR-10/11).
 *
 * SPEC-RR-030. A collapsible block (accent icon) with collapsible prompt/result/
 * tools sections; nested `toolCalls` reuse `ToolCallBlock`; the result body
 * scrolls within `--sp-subagent-result-max-height`. The async status pill is
 * coloured by `subagent.asyncStatus` via `--sp-state-*` tokens
 * (pending/running/completed/error/orphaned) and NAMES the state (never
 * colour-only — NFR-RR-008); the lifecycle is classified by
 * `resolveSubagentLifecycle` (SPEC-RR-017). EC-RR-10: `error` + no result →
 * error pill, empty result. EC-RR-11: spawn with no result → orphaned pill. Sync
 * subagents show nested tools inline, no pill. Queried by `data-testid` only.
 *
 * Traces: REQ-RR-021/021a, NFR-RR-006/007/008.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SubagentBlock from '@/ui/chat/SubagentBlock.vue';
import type { SubagentInfo } from '@/domain/chat/Subagent';
import { ICON_PORT } from '@/infrastructure/bridge/ports';
import { MARKDOWN_RENDER_PORT } from '@/infrastructure/bridge/ports';
import { staticIconPort } from '@/infrastructure/icons/staticIconPort';
import { safeMarkdownRenderPort } from '@/application/chat/safeMarkdownRenderPort';
import { SubagentBlockPageObject } from './SubagentBlock.po';

function mountBlock(subagent: SubagentInfo) {
	const wrapper = mount(SubagentBlock, {
		props: { subagent },
		global: {
			provide: {
				[ICON_PORT as symbol]: staticIconPort,
				[MARKDOWN_RENDER_PORT as symbol]: safeMarkdownRenderPort,
			},
		},
	});
	return { wrapper, po: new SubagentBlockPageObject(wrapper) };
}

const asyncCompleted: SubagentInfo = {
	id: 's1',
	description: 'Investigate the failing test',
	prompt: 'Find why the test fails',
	mode: 'async',
	agentId: 'agent-1',
	status: 'completed',
	asyncStatus: 'completed',
	result: 'Found the bug in foo.ts',
	toolCalls: [
		{ id: 't1', name: 'Read', input: { file_path: 'foo.ts' }, status: 'completed', result: 'src' },
		{ id: 't2', name: 'Grep', input: { pattern: 'bug' }, status: 'completed', result: 'match' },
	],
};

describe('SubagentBlock (TEST-RR-020)', () => {
	it('renders the block with an async status pill that names the state (completed)', () => {
		const { po } = mountBlock(asyncCompleted);
		expect(po.exists()).toBe(true);
		expect(po.statusExists()).toBe(true);
		expect(po.statusText().toLowerCase()).toContain('completed');
		expect(po.statusState()).toBe('completed');
	});

	it('renders the nested toolCalls via ToolCallBlock', async () => {
		const { po } = mountBlock(asyncCompleted);
		await po.expandAll();
		expect(po.nestedToolCount()).toBe(2);
	});

	it('shows the prompt and result sections', async () => {
		const { po } = mountBlock(asyncCompleted);
		await po.expandAll();
		expect(po.promptExists()).toBe(true);
		expect(po.resultExists()).toBe(true);
		expect(po.resultText()).toContain('Found the bug');
	});

	it('EC-RR-10: error status with no result → error pill, empty result section', async () => {
		const errored: SubagentInfo = {
			id: 's2',
			description: 'task',
			mode: 'async',
			agentId: 'a2',
			status: 'error',
			asyncStatus: 'error',
			toolCalls: [],
		};
		const { po } = mountBlock(errored);
		expect(po.statusText().toLowerCase()).toContain('error');
		expect(po.statusState()).toBe('error');
		await po.expandAll();
		// No result text — the result section is empty or absent.
		expect(po.resultText()).not.toContain('Found');
	});

	it('EC-RR-11: spawn with no result → orphaned pill (resolveSubagentLifecycle)', () => {
		const orphaned: SubagentInfo = {
			id: 's3',
			description: 'task',
			mode: 'async',
			agentId: 'a3',
			status: 'running',
			asyncStatus: 'orphaned',
			toolCalls: [],
		};
		const { po } = mountBlock(orphaned);
		expect(po.statusText().toLowerCase()).toContain('orphaned');
		expect(po.statusState()).toBe('orphaned');
	});

	it('sync subagents show nested tools inline with no async pill', async () => {
		const sync: SubagentInfo = {
			id: 's4',
			description: 'sync task',
			status: 'completed',
			toolCalls: [{ id: 't3', name: 'Read', input: { file_path: 'a.ts' }, status: 'completed' }],
		};
		const { po } = mountBlock(sync);
		expect(po.statusExists()).toBe(false);
		await po.expandAll();
		expect(po.nestedToolCount()).toBe(1);
	});
});
