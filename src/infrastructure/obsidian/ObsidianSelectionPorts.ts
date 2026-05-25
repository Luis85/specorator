import { MarkdownView, type App, type Editor } from 'obsidian';
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import type { SelectionSourcePort, SelectionHighlightPort } from '@/domain/ports';
import type {
	CapturedSelection,
	EditorSelectionContext,
	CanvasSelectionContext,
} from '@/domain/chat/attachments/Selection';
import type { Unsubscriber } from '@/domain/ports/shared';

/**
 * Production `SelectionSourcePort` / `SelectionHighlightPort` (SPEC-CA-007,
 * ADR-CA-003 §1). Coverage-excluded infra (`src/infrastructure/obsidian/**`);
 * the behavioural gate is the MANUAL legs TEST-CA-M1/M3 + TEST-CA-017. Ported
 * from claudian-main `SelectionController` / `CanvasSelectionController` +
 * `shared/components/SelectionHighlight`. No `obsidian`/CM6 symbol leaks past
 * this file (the ports expose only domain DTOs).
 */

/** Parity poll cadence (claudian `SELECTION_POLL_INTERVAL`). */
const SELECTION_POLL_INTERVAL_MS = 250;

/** The shape of an Obsidian canvas leaf view we read node selection from. */
interface CanvasViewLike {
	getViewType?: () => string;
	file?: { path?: string };
	canvas?: { selection?: Set<{ id?: string }> };
}

/** Resolve the CM6 `EditorView` behind an Obsidian `Editor`, or `null`. */
function getEditorView(editor: Editor): EditorView | null {
	// Obsidian's `Editor` exposes the CM6 view on a non-public `cm` field.
	const cm = (editor as unknown as { cm?: unknown }).cm;
	return cm instanceof EditorView ? cm : null;
}

/** Extract the non-empty string node ids from a canvas selection set. */
function readCanvasNodeIds(selection: Set<{ id?: string }>): string[] {
	return [...selection]
		.map((node) => node.id)
		.filter((id): id is string => typeof id === 'string' && id !== '');
}

/** A view is a canvas view iff it exposes `getViewType() === 'canvas'`. */
function isCanvasView(view: CanvasViewLike | null): view is CanvasViewLike {
	return view !== null && typeof view.getViewType === 'function' && view.getViewType() === 'canvas';
}

/**
 * CM6 editor + Obsidian canvas selection reader, polled at 250 ms (parity
 * claudian). Fires `onSelectionChange` on a change; a transient read error is
 * swallowed → `null` (NFR-CA-010, EC-CA-12). `supportsBrowserSelection` is an
 * honest fixed `false` for P5 — the fragile embedded-view (browser) leg is an
 * explicit defer (REQ-CA-018), never silently dropped.
 */
export class ObsidianSelectionSource implements SelectionSourcePort {
	readonly supportsBrowserSelection = false;
	private readonly listeners = new Set<(sel: CapturedSelection | null) => void>();
	private lastKey = '';
	private pollHandle: number | null = null;

	constructor(private readonly app: App) {}

	getCurrentSelection(): CapturedSelection | null {
		try {
			return this.read();
		} catch {
			// A transient read error degrades to null (NFR-CA-010, EC-CA-12).
			return null;
		}
	}

	onSelectionChange(listener: (sel: CapturedSelection | null) => void): Unsubscriber {
		this.listeners.add(listener);
		this.ensurePolling();
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0) this.stopPolling();
		};
	}

	private ensurePolling(): void {
		if (this.pollHandle !== null) return;
		this.pollHandle = window.setInterval(() => {
			this.poll();
		}, SELECTION_POLL_INTERVAL_MS);
	}

	private stopPolling(): void {
		if (this.pollHandle === null) return;
		window.clearInterval(this.pollHandle);
		this.pollHandle = null;
	}

	private poll(): void {
		const next = this.getCurrentSelection();
		const key = next === null ? '' : JSON.stringify(next);
		if (key === this.lastKey) return;
		this.lastKey = key;
		for (const listener of this.listeners) listener(next);
	}

	/** Read the live editor or canvas selection (canvas takes the active-view branch). */
	private read(): CapturedSelection | null {
		const editorSel = this.readEditor();
		if (editorSel !== null) return editorSel;
		return this.readCanvas();
	}

	private readEditor(): EditorSelectionContext | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view === null || view.getMode() === 'preview') return null;
		const editor = view.editor;
		if (getEditorView(editor) === null) return null;
		const selectedText = editor.getSelection();
		if (selectedText.trim() === '') return null;
		const from = editor.getCursor('from');
		// 0-based CM6 line carried verbatim (SPEC-CA-003, open item #1 resolved).
		const startLine = from.line;
		const lineCount = selectedText.split(/\r?\n/).length;
		const notePath = view.file?.path ?? 'unknown';
		return { kind: 'editor', notePath, selectedText, startLine, lineCount };
	}

	private readCanvas(): CanvasSelectionContext | null {
		const leaf = this.app.workspace.getMostRecentLeaf();
		const view = (leaf?.view ?? null) as CanvasViewLike | null;
		if (!isCanvasView(view)) return null;
		const canvasPath = view.file?.path;
		const selection = view.canvas?.selection;
		if (canvasPath === undefined || canvasPath === '' || selection === undefined) return null;
		const nodeIds = readCanvasNodeIds(selection);
		if (nodeIds.length === 0) return null;
		return { kind: 'canvas', canvasPath, nodeIds };
	}
}

const showHighlight = StateEffect.define<{ from: number; to: number }>();
const hideHighlight = StateEffect.define<null>();

const selectionHighlightField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update: (deco, tr) => {
		for (const effect of tr.effects) {
			if (effect.is(showHighlight)) {
				const builder = new RangeSetBuilder<Decoration>();
				builder.add(
					effect.value.from,
					effect.value.to,
					Decoration.mark({ class: 'sp-selection-highlight' }),
				);
				return builder.finish();
			}
			if (effect.is(hideHighlight)) return Decoration.none;
		}
		return deco.map(tr.changes);
	},
	provide: (field) => EditorView.decorations.from(field),
});

/**
 * Paints/removes a CM6 decoration over a captured editor range (SPEC-CA-007,
 * ported from claudian `SelectionHighlight.showSelectionHighlight`). `show`
 * resolves the active editor's CM6 view + the captured range offsets and paints
 * the decoration; `clear` removes it. `clear` is idempotent (no painted editor →
 * no-op). Coverage-excluded; gated by the manual leg TEST-CA-M1.
 */
export class ObsidianSelectionHighlight implements SelectionHighlightPort {
	private readonly installed = new WeakSet<EditorView>();
	private painted: EditorView | null = null;

	constructor(private readonly app: App) {}

	show(target: EditorSelectionContext): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view === null) return;
		const editor = view.editor;
		const editorView = getEditorView(editor);
		if (editorView === null) return;
		const selectedText = editor.getSelection();
		const fromOffset = editor.posToOffset(editor.getCursor('from'));
		const toOffset = editor.posToOffset(editor.getCursor('to'));
		// Defensive: only paint a non-empty range matching the captured text.
		if (toOffset <= fromOffset || selectedText !== target.selectedText) return;
		this.ensureField(editorView);
		editorView.dispatch({ effects: showHighlight.of({ from: fromOffset, to: toOffset }) });
		this.painted = editorView;
	}

	clear(): void {
		const editorView = this.painted;
		if (editorView === null) return;
		if (this.installed.has(editorView)) {
			editorView.dispatch({ effects: hideHighlight.of(null) });
		}
		this.painted = null;
	}

	private ensureField(editorView: EditorView): void {
		if (this.installed.has(editorView)) return;
		editorView.dispatch({ effects: StateEffect.appendConfig.of(selectionHighlightField) });
		this.installed.add(editorView);
	}
}
