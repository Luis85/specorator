/**
 * T-CA-035 (RED) — `SelectionIndicator.vue` (TEST-CA-015 A leg, TEST-CA-018b A leg).
 *
 * SPEC-CA-021. When `selection` is present, render a chip with a TEXT label (not
 * colour alone, NFR-CA-008) per kind (editor / canvas / browser) + a labelled
 * clear control emitting `clear` (REQ-CA-015). The browser affordance is GATED:
 * when `supportsBrowserSelection` is `false` no browser-capture affordance renders
 * and no error surfaces (REQ-CA-018, EC-CA-7, SPEC-CA-029). Queried by
 * `data-testid` only (ADR-009).
 *
 * Traces: REQ-CA-015/018, NFR-CA-005/008.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SelectionIndicator from '@/ui/chat/SelectionIndicator.vue';
import { i18n } from '@/ui/i18n';
import type {
	CapturedSelection,
	EditorSelectionContext,
	CanvasSelectionContext,
	BrowserSelectionContext,
} from '@/domain/chat/attachments/Selection';
import { SelectionIndicatorPageObject } from './SelectionIndicator.po';

const editorSel: EditorSelectionContext = {
	kind: 'editor',
	notePath: 'notes/a.md',
	selectedText: 'hello',
	startLine: 4,
	lineCount: 3,
};
const canvasSel: CanvasSelectionContext = {
	kind: 'canvas',
	canvasPath: 'boards/plan.canvas',
	nodeIds: ['n1', 'n2'],
};
const browserSel: BrowserSelectionContext = {
	kind: 'browser',
	source: 'webview://docs',
	selectedText: 'quote',
	title: 'API Docs',
};

function mountIndicator(
	selection: CapturedSelection | null,
	supportsBrowserSelection = false,
) {
	const wrapper = mount(SelectionIndicator, {
		props: { selection, supportsBrowserSelection },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new SelectionIndicatorPageObject(wrapper) };
}

describe('SelectionIndicator (SPEC-CA-021)', () => {
	it('renders an editor chip with a text label naming the note + lines (TEST-CA-015 A leg)', () => {
		const { po } = mountIndicator(editorSel);
		expect(po.rootExists()).toBe(true);
		expect(po.labelExists()).toBe(true);
		expect(po.labelText()).toContain('notes/a.md');
		expect(po.labelText()).toContain('4');
		expect(po.labelText()).toContain('3');
	});

	it('renders a canvas chip naming the canvas + node count', () => {
		const { po } = mountIndicator(canvasSel);
		expect(po.labelText()).toContain('boards/plan.canvas');
		expect(po.labelText()).toContain('2');
	});

	it('renders a browser chip with title ?? source', () => {
		const { po } = mountIndicator(browserSel, true);
		expect(po.labelText()).toContain('API Docs');
	});

	it('the clear control is labelled and emits clear (REQ-CA-015)', async () => {
		const { wrapper, po } = mountIndicator(editorSel);
		expect(po.clearAriaLabel().length).toBeGreaterThan(0);
		await po.clickClear();
		expect(wrapper.emitted('clear')).toHaveLength(1);
	});

	it('renders nothing when there is no selection', () => {
		const { po } = mountIndicator(null);
		expect(po.rootExists()).toBe(false);
	});

	it('EC-CA-7: when supportsBrowserSelection is false no browser-capture affordance renders', () => {
		const { po } = mountIndicator(editorSel, false);
		expect(po.browserCaptureExists()).toBe(false);
	});

	it('the browser-capture affordance renders only when supportsBrowserSelection is true', () => {
		const { po } = mountIndicator(editorSel, true);
		expect(po.browserCaptureExists()).toBe(true);
	});
});
