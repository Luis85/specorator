/**
 * The `CapturedSelection` discriminated union (SPEC-CA-003, ADR-CA-003 §1). A pure
 * domain union — the DTOs whose `ChatTurnRequest` slots SPEC-CA-001 reserves.
 * Mirrors claudian-main `features/chat/controllers/SelectionController.ts`
 * (`getContext`), `CanvasSelectionController.ts`, `BrowserSelectionController.ts`.
 * No class, no `obsidian`, no `node:*` (NFR-CA-004).
 */

/** An editor (CM6) text selection (REQ-CA-013/019). */
export interface EditorSelectionContext {
	readonly kind: 'editor';
	/** Non-empty, vault-relative. */
	readonly notePath: string;
	/** Non-empty — an empty selection is never captured (REQ-CA-013 precondition, EC-CA-5). */
	readonly selectedText: string;
	/** 0-based CM6 editor line (RESOLVED open item #1) — carried verbatim, no re-base. */
	readonly startLine: number;
	/** >= 1 for any non-empty selection. */
	readonly lineCount: number;
}

/** An Obsidian canvas node selection (REQ-CA-017/019). */
export interface CanvasSelectionContext {
	readonly kind: 'canvas';
	/** Non-empty. */
	readonly canvasPath: string;
	/** Non-empty for a capture. */
	readonly nodeIds: readonly string[];
}

/** A capability-gated embedded-view (browser) selection (REQ-CA-018/019, ADR-CA-003 §2). */
export interface BrowserSelectionContext {
	readonly kind: 'browser';
	/** The view source (e.g. the webview url host / view id) — non-empty. */
	readonly source: string;
	/** Non-empty. */
	readonly selectedText: string;
	/** Best-effort. */
	readonly title?: string;
	/** Best-effort. */
	readonly url?: string;
}

/** At most one captured selection at a time — the member matching the active source. */
export type CapturedSelection =
	| EditorSelectionContext
	| CanvasSelectionContext
	| BrowserSelectionContext;
