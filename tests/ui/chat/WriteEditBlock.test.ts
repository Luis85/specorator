/**
 * T-RR-031 (RED) — `WriteEditBlock.vue` header + diff body (TEST-RR-019, EC-RR-3).
 *
 * SPEC-RR-029. Wraps `SpCollapsible` (collapsed by default). Header: file icon
 * (`SpIcon`), the tool name (`Write`/`Edit`), the filename summary (`toolSummary`),
 * an end-pinned status, and a stat chip (`+N` in `--sp-diff-add-fg`, `-N` in
 * `--sp-diff-del-fg`) — only non-zero counts shown (parity `renderDiffStats`,
 * REQ-RR-027). Body embeds `DiffView` with `toolCall.diffData`. EC-RR-3: no
 * `diffData` → a generic body (no diff), not a crash. NO `v-html` (NFR-RR-006).
 * Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-RR-025/027, NFR-RR-006/007.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import WriteEditBlock from '@/ui/chat/WriteEditBlock.vue';
import type { ToolCall } from '@/domain/chat/ToolCall';
import { ICON_PORT } from '@/infrastructure/bridge/ports';
import { staticIconPort } from '@/infrastructure/icons/staticIconPort';
import { WriteEditBlockPageObject } from './WriteEditBlock.po';

function mountBlock(toolCall: ToolCall) {
	const wrapper = mount(WriteEditBlock, {
		props: { toolCall },
		global: { provide: { [ICON_PORT as symbol]: staticIconPort } },
	});
	return { wrapper, po: new WriteEditBlockPageObject(wrapper) };
}

const writeWithDiff: ToolCall = {
	id: 'w1',
	name: 'Write',
	input: { file_path: 'src/new.ts' },
	status: 'completed',
	result: 'ok',
	diffData: {
		filePath: 'src/new.ts',
		diffLines: [
			{ type: 'insert', text: 'a', newLineNum: 1 },
			{ type: 'insert', text: 'b', newLineNum: 2 },
			{ type: 'insert', text: 'c', newLineNum: 3 },
		],
		stats: { added: 3, removed: 0 },
	},
};

describe('WriteEditBlock (TEST-RR-019)', () => {
	it('renders the header with the tool name + filename summary', () => {
		const { po } = mountBlock(writeWithDiff);
		expect(po.headerExists()).toBe(true);
		expect(po.name()).toBe('Write');
		expect(po.summary()).toBe('new.ts');
	});

	it('renders an end-pinned status with an aria-label (NFR-RR-008)', () => {
		const { po } = mountBlock(writeWithDiff);
		expect(po.statusLabel().toLowerCase()).toContain('completed');
	});

	it('shows the +N stat chip and hides the -N chip when removed === 0 (REQ-RR-027)', () => {
		const { po } = mountBlock(writeWithDiff);
		expect(po.statsExists()).toBe(true);
		expect(po.addedExists()).toBe(true);
		expect(po.addedText()).toContain('3');
		expect(po.removedExists()).toBe(false);
	});

	it('shows both +N and -N when both are non-zero (Edit)', () => {
		const edit: ToolCall = {
			id: 'e1',
			name: 'Edit',
			input: { file_path: 'src/a.ts' },
			status: 'completed',
			diffData: {
				filePath: 'src/a.ts',
				diffLines: [
					{ type: 'delete', text: 'old', oldLineNum: 1 },
					{ type: 'insert', text: 'new', newLineNum: 1 },
				],
				stats: { added: 1, removed: 1 },
			},
		};
		const { po } = mountBlock(edit);
		expect(po.addedExists()).toBe(true);
		expect(po.removedExists()).toBe(true);
		expect(po.addedText()).toContain('1');
		expect(po.removedText()).toContain('1');
	});

	it('embeds DiffView with the diffData when expanded', async () => {
		const { po } = mountBlock(writeWithDiff);
		await po.expand();
		expect(po.diffViewExists()).toBe(true);
		expect(po.genericExists()).toBe(false);
	});

	it('EC-RR-3: renders a generic body (no diff) when diffData is absent', async () => {
		const noDiff: ToolCall = {
			id: 'w2',
			name: 'Write',
			input: { file_path: 'src/x.ts' },
			status: 'completed',
			result: 'DONE',
		};
		const { po } = mountBlock(noDiff);
		expect(po.statsExists()).toBe(false);
		await po.expand();
		expect(po.diffViewExists()).toBe(false);
		expect(po.genericExists()).toBe(true);
		expect(po.genericText()).toContain('DONE');
	});

	it('sets the collapsible aria-label from toolLabel(...)', () => {
		const { po } = mountBlock(writeWithDiff);
		expect(po.collapsibleAriaLabel()).toContain('Write:');
	});
});
