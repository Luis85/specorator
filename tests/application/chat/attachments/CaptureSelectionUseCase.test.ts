/**
 * T-CA-025 (RED) — `CaptureSelectionUseCase` (SPEC-CA-016). Coordinates
 * `SelectionSourcePort` reads with `SelectionHighlightPort` paint/clear + the
 * focus-hand-off retain:
 *   - an `EditorSelectionContext` drives `highlight.show(sel)` (REQ-CA-014);
 *   - `sel === null` AND `focusWithinChat === false` → drop + `highlight.clear()`
 *     + result `null` (REQ-CA-015, EC-CA-5-clear);
 *   - `sel === null` AND `focusWithinChat === true` → the previously-captured
 *     selection is RETAINED, highlight stays (REQ-CA-016, EC-CA-11);
 *   - a `canvas`/`browser` selection captures but paints NO highlight;
 *   - `current()` returns the latest captured selection or `null`;
 *   - all `Result.ok`, never throws (NFR-CA-010).
 *
 * Fails (RED) until T-CA-026 implements
 * `src/application/chat/attachments/CaptureSelectionUseCase.ts`.
 *
 * Traces: TEST-CA-013/014/015/016 (U legs), TEST-CA-018b (U leg), SPEC-CA-016,
 * REQ-CA-013..018, NFR-CA-010, EC-CA-5-clear, EC-CA-11.
 */
import { describe, it, expect } from 'vitest';
import { CaptureSelectionUseCase } from '@/application/chat/attachments/CaptureSelectionUseCase';
import { MockSelectionSource, MockSelectionHighlight } from '@/infrastructure/mock/MockSelectionPorts';
import type {
	EditorSelectionContext,
	CanvasSelectionContext,
	BrowserSelectionContext,
} from '@/domain/chat/attachments';

const editorSel: EditorSelectionContext = {
	kind: 'editor',
	notePath: 'notes/a.md',
	selectedText: 'The bank was steep',
	startLine: 3,
	lineCount: 1,
};

const canvasSel: CanvasSelectionContext = {
	kind: 'canvas',
	canvasPath: 'board.canvas',
	nodeIds: ['n1', 'n2'],
};

const browserSel: BrowserSelectionContext = {
	kind: 'browser',
	source: 'webview:example.com',
	selectedText: 'hello',
};

function makeUseCase(): {
	useCase: CaptureSelectionUseCase;
	highlight: MockSelectionHighlight;
	source: MockSelectionSource;
} {
	const source = new MockSelectionSource();
	const highlight = new MockSelectionHighlight();
	return { useCase: new CaptureSelectionUseCase(source, highlight), highlight, source };
}

describe('TEST-CA-014 CaptureSelectionUseCase — editor selection', () => {
	it('REQ-CA-014: an editor selection drives highlight.show and is captured', () => {
		const { useCase, highlight } = makeUseCase();
		const result = useCase.onChange(editorSel, false);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual(editorSel);
		expect(useCase.current()).toEqual(editorSel);
		expect(highlight.calls).toEqual([{ kind: 'show', target: editorSel }]);
	});
});

describe('TEST-CA-015 CaptureSelectionUseCase — deselection (focus not in chat)', () => {
	it('EC-CA-5-clear: null + focusWithinChat false → drop + highlight.clear + null', () => {
		const { useCase, highlight } = makeUseCase();
		useCase.onChange(editorSel, false); // capture first
		const result = useCase.onChange(null, false);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toBeNull();
		expect(useCase.current()).toBeNull();
		// show then clear.
		expect(highlight.calls).toEqual([
			{ kind: 'show', target: editorSel },
			{ kind: 'clear' },
		]);
	});
});

describe('TEST-CA-016 CaptureSelectionUseCase — focus hand-off into the composer', () => {
	it('EC-CA-11: null + focusWithinChat true → retain prior selection, highlight stays', () => {
		const { useCase, highlight } = makeUseCase();
		useCase.onChange(editorSel, false); // capture first
		const result = useCase.onChange(null, true);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// Retained — NOT a deselection.
		expect(result.value).toEqual(editorSel);
		expect(useCase.current()).toEqual(editorSel);
		// No extra clear — only the original show.
		expect(highlight.calls).toEqual([{ kind: 'show', target: editorSel }]);
	});
});

describe('TEST-CA-013 / TEST-CA-018b CaptureSelectionUseCase — canvas + browser', () => {
	it('a canvas selection captures but paints NO highlight', () => {
		const { useCase, highlight } = makeUseCase();
		const result = useCase.onChange(canvasSel, false);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual(canvasSel);
		expect(useCase.current()).toEqual(canvasSel);
		expect(highlight.calls).toEqual([]);
	});

	it('TEST-CA-018b: a browser selection captures but paints NO highlight', () => {
		const { useCase, highlight } = makeUseCase();
		const result = useCase.onChange(browserSel, false);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual(browserSel);
		expect(useCase.current()).toEqual(browserSel);
		expect(highlight.calls).toEqual([]);
	});

	it('current() starts null before any capture', () => {
		const { useCase } = makeUseCase();
		expect(useCase.current()).toBeNull();
	});

	it('never throws across the onChange boundary', () => {
		const { useCase } = makeUseCase();
		expect(() => useCase.onChange(null, false)).not.toThrow();
		expect(() => useCase.onChange(editorSel, true)).not.toThrow();
	});
});
