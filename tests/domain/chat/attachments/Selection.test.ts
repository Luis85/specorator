/**
 * T-CA-002 (TEST-CA-013 type-shape leg) — RED: the `CapturedSelection`
 * discriminated union covers EXACTLY the three members
 * `EditorSelectionContext` / `CanvasSelectionContext` / `BrowserSelectionContext`,
 * narrowing on `kind`, `startLine` 0-based, `lineCount` >= 1, re-exported from
 * `@/domain/chat/attachments/index` (SPEC-CA-003).
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-CA-003 supplies the union.
 *
 * Traces: TEST-CA-013 (type-shape), SPEC-CA-003, REQ-CA-013/017/018/019, NFR-CA-001.
 */
import { describe, it, expect } from 'vitest';
import type {
	EditorSelectionContext,
	CanvasSelectionContext,
	BrowserSelectionContext,
	CapturedSelection,
} from '@/domain/chat/attachments';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- editor member ----
const _editorShape: Equals<
	EditorSelectionContext,
	{
		readonly kind: 'editor';
		readonly notePath: string;
		readonly selectedText: string;
		readonly startLine: number;
		readonly lineCount: number;
	}
> = true;
void _editorShape;

// ---- canvas member ----
const _canvasShape: Equals<
	CanvasSelectionContext,
	{
		readonly kind: 'canvas';
		readonly canvasPath: string;
		readonly nodeIds: readonly string[];
	}
> = true;
void _canvasShape;

// ---- browser member (title?/url? optional) ----
const _browserShape: Equals<
	BrowserSelectionContext,
	{
		readonly kind: 'browser';
		readonly source: string;
		readonly selectedText: string;
		readonly title?: string;
		readonly url?: string;
	}
> = true;
void _browserShape;

// ---- the union is EXACTLY the three discriminants ----
const _unionKinds: Equals<CapturedSelection['kind'], 'editor' | 'canvas' | 'browser'> = true;
void _unionKinds;

describe('CapturedSelection union (TEST-CA-013 type-shape)', () => {
	// A union-typed array so the `kind` discriminant is genuinely narrowed (not a literal).
	const cases: CapturedSelection[] = [
		{ kind: 'editor', notePath: 'a.md', selectedText: 'hello', startLine: 10, lineCount: 1 },
		{ kind: 'canvas', canvasPath: 'board.canvas', nodeIds: ['n1', 'n2'] },
		{ kind: 'browser', source: 'webview:example.com', selectedText: 'quote' },
	];

	it('narrows on kind for the editor member', () => {
		const sel = cases[0];
		if (sel.kind === 'editor') {
			expect(sel.startLine).toBe(10);
			expect(sel.lineCount).toBeGreaterThanOrEqual(1);
		} else {
			throw new Error('expected an editor selection');
		}
	});

	it('narrows on kind for the canvas + browser members', () => {
		const canvas = cases[1];
		const browser = cases[2];
		expect(canvas.kind).toBe('canvas');
		expect(browser.kind).toBe('browser');
		if (canvas.kind === 'canvas') expect(canvas.nodeIds).toHaveLength(2);
	});
});
