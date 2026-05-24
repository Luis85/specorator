/**
 * T-RR-027 (RED) — `ToolCallBlock.vue` (TEST-RR-013/015, EC-RR-XSS).
 *
 * SPEC-RR-026. Wraps `SpCollapsible` (collapsed by default). Header: per-tool
 * `SpIcon`, monospace `toolName(...)`, one-line `toolSummary(...)` (empty summary
 * → no summary element), an end-pinned status indicator coloured + iconned by
 * status with an `aria-label` (never colour-only — NFR-RR-008). Expanded body
 * renders input/result as escaped, monospace, pre-wrapped declarative text — a
 * literal `<script>` shows verbatim (REQ-RR-020a); NO `v-html`. The collapsible
 * aria-label = `toolLabel(...)`. Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-RR-019/020/020a, NFR-RR-006/007.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ToolCallBlock from '@/ui/chat/ToolCallBlock.vue';
import type { ToolCall } from '@/domain/chat/ToolCall';
import { ICON_PORT } from '@/infrastructure/bridge/ports';
import { staticIconPort } from '@/infrastructure/icons/staticIconPort';
import { ToolCallBlockPageObject } from './ToolCallBlock.po';

function mountBlock(toolCall: ToolCall) {
	const wrapper = mount(ToolCallBlock, {
		props: { toolCall },
		global: { provide: { [ICON_PORT as symbol]: staticIconPort } },
	});
	return { wrapper, po: new ToolCallBlockPageObject(wrapper) };
}

const readRunning: ToolCall = {
	id: 't1',
	name: 'Read',
	input: { file_path: 'src/a.ts' },
	status: 'running',
};

describe('ToolCallBlock (TEST-RR-013/015)', () => {
	it('renders the header with the monospace tool name + summary', () => {
		const { po } = mountBlock(readRunning);
		expect(po.headerExists()).toBe(true);
		expect(po.name()).toBe('Read');
		expect(po.summary()).toBe('a.ts');
	});

	it('hides the summary element when the summary is empty (EC-RR-6 parity)', () => {
		const { po } = mountBlock({ id: 't2', name: 'TodoWrite', input: {}, status: 'running' });
		expect(po.name()).toBe('Tasks');
		expect(po.summaryExists()).toBe(false);
	});

	it('renders an end-pinned status with an aria-label (never colour-only, NFR-RR-008)', () => {
		const completed: ToolCall = { ...readRunning, status: 'completed', result: 'ok' };
		const { po } = mountBlock(completed);
		expect(po.statusExists()).toBe(true);
		expect(po.statusLabel().toLowerCase()).toContain('completed');
	});

	it('sets the collapsible aria-label from toolLabel(...)', () => {
		const { po } = mountBlock(readRunning);
		// toolLabel for Read → "Read: <shortPath>"; collapsed → "... - click to expand".
		expect(po.collapsibleAriaLabel()).toContain('Read:');
		expect(po.collapsibleAriaLabel()).toContain('click to expand');
	});

	it('renders input/result as escaped text — a <script> payload shows verbatim (REQ-RR-020a)', async () => {
		const xss: ToolCall = {
			id: 't3',
			name: 'Bash',
			input: { command: 'echo hi' },
			status: 'completed',
			result: '<script>alert(1)</script>',
		};
		const { po } = mountBlock(xss);
		await po.expand();
		expect(po.resultExists()).toBe(true);
		expect(po.resultText()).toContain('<script>alert(1)</script>');
		// No injected element — the literal is text, never markup (NFR-RR-006).
		expect(po.html()).not.toContain('<script>alert(1)</script>');
	});
});
