/**
 * T-CA-012 (RED) — `MockSelectionSource` + `MockSelectionHighlight`
 * (SPEC-CA-008 selection leg, TEST-CA-013/014/015 backing).
 *
 * The Mock `SelectionSourcePort` is INERT by default but SCRIPTABLE:
 *   - `getCurrentSelection()` → `null` until a `setSelection(captured)`;
 *   - `supportsBrowserSelection` is a fixed `false` (parity ADR-CA-003 §2);
 *   - `setSelection(captured)` pushes the value to every `onSelectionChange`
 *     listener AND makes `getCurrentSelection()` return it (drives the editor +
 *     canvas capture path; `setSelection(null)` models a deselection);
 *   - `onSelectionChange` returns an unsubscriber that stops further pushes.
 * The Mock `SelectionHighlightPort` is a RECORDING no-op — `show`/`clear` push to
 * an inspectable array so a test asserts the highlight was driven (no real CM6).
 *
 * Fails until T-CA-013 supplies the Mock selection ports. No `obsidian`/`node:*`.
 *
 * Traces: TEST-CA-013 (capture backing), TEST-CA-014/015 (recording highlight),
 * SPEC-CA-008, REQ-CA-013/017/018, NFR-CA-010.
 */
import { describe, it, expect, vi } from 'vitest';
import {
	MockSelectionSource,
	MockSelectionHighlight,
} from '@/infrastructure/mock/MockSelectionPorts';
import type {
	SelectionSourcePort,
	SelectionHighlightPort,
} from '@/domain/ports';
import type {
	CapturedSelection,
	EditorSelectionContext,
	CanvasSelectionContext,
} from '@/domain/chat/attachments/Selection';

const editorSel: EditorSelectionContext = {
	kind: 'editor',
	notePath: 'notes/a.md',
	selectedText: 'The bank was steep',
	startLine: 10,
	lineCount: 1,
};

const canvasSel: CanvasSelectionContext = {
	kind: 'canvas',
	canvasPath: 'boards/b.canvas',
	nodeIds: ['n1', 'n2'],
};

describe('MockSelectionSource (TEST-CA-013 capture backing)', () => {
	it('is a SelectionSourcePort', () => {
		const source: SelectionSourcePort = new MockSelectionSource();
		expect(typeof source.getCurrentSelection).toBe('function');
		expect(typeof source.onSelectionChange).toBe('function');
	});

	it('is inert by default — getCurrentSelection() returns null', () => {
		const source = new MockSelectionSource();
		expect(source.getCurrentSelection()).toBeNull();
	});

	it('ships supportsBrowserSelection: false', () => {
		const source = new MockSelectionSource();
		expect(source.supportsBrowserSelection).toBe(false);
	});

	it('setSelection(captured) makes getCurrentSelection() return it', () => {
		const source = new MockSelectionSource();
		source.setSelection(editorSel);
		expect(source.getCurrentSelection()).toEqual(editorSel);
	});

	it('setSelection(captured) pushes to onSelectionChange listeners', () => {
		const source = new MockSelectionSource();
		const listener = vi.fn<(sel: CapturedSelection | null) => void>();
		source.onSelectionChange(listener);
		source.setSelection(editorSel);
		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith(editorSel);
	});

	it('drives the canvas capture path too (a canvas selection)', () => {
		const source = new MockSelectionSource();
		const listener = vi.fn<(sel: CapturedSelection | null) => void>();
		source.onSelectionChange(listener);
		source.setSelection(canvasSel);
		expect(source.getCurrentSelection()).toEqual(canvasSel);
		expect(listener).toHaveBeenCalledWith(canvasSel);
	});

	it('setSelection(null) models a deselection (pushed + read as null)', () => {
		const source = new MockSelectionSource();
		source.setSelection(editorSel);
		const listener = vi.fn<(sel: CapturedSelection | null) => void>();
		source.onSelectionChange(listener);
		source.setSelection(null);
		expect(source.getCurrentSelection()).toBeNull();
		expect(listener).toHaveBeenCalledWith(null);
	});

	it('the unsubscriber stops further pushes', () => {
		const source = new MockSelectionSource();
		const listener = vi.fn<(sel: CapturedSelection | null) => void>();
		const unsubscribe = source.onSelectionChange(listener);
		unsubscribe();
		source.setSelection(editorSel);
		expect(listener).not.toHaveBeenCalled();
	});
});

describe('MockSelectionHighlight (TEST-CA-014/015 recording highlight)', () => {
	it('is a SelectionHighlightPort', () => {
		const highlight: SelectionHighlightPort = new MockSelectionHighlight();
		expect(typeof highlight.show).toBe('function');
		expect(typeof highlight.clear).toBe('function');
	});

	it('records show(target) calls for assertion', () => {
		const highlight = new MockSelectionHighlight();
		highlight.show(editorSel);
		expect(highlight.calls).toEqual([{ kind: 'show', target: editorSel }]);
	});

	it('records clear() calls for assertion', () => {
		const highlight = new MockSelectionHighlight();
		highlight.show(editorSel);
		highlight.clear();
		expect(highlight.calls).toEqual([
			{ kind: 'show', target: editorSel },
			{ kind: 'clear' },
		]);
	});

	it('clear() is a no-op when nothing is painted (still recorded, never throws)', () => {
		const highlight = new MockSelectionHighlight();
		expect(() => {
			highlight.clear();
		}).not.toThrow();
		expect(highlight.calls).toEqual([{ kind: 'clear' }]);
	});
});
