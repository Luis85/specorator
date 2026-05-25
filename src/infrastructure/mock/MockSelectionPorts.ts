import type { SelectionSourcePort, SelectionHighlightPort } from '@/domain/ports';
import type { CapturedSelection, EditorSelectionContext } from '@/domain/chat/attachments/Selection';
import type { Unsubscriber } from '@/domain/ports/shared';

/**
 * Scriptable Mock `SelectionSourcePort` (SPEC-CA-008 selection leg) for
 * `npm run dev` + unit tests. INERT by default (`getCurrentSelection() → null`,
 * `supportsBrowserSelection: false`) but SCRIPTABLE: `setSelection(captured)`
 * pushes the value to every `onSelectionChange` listener AND makes
 * `getCurrentSelection()` return it (drives the editor + canvas capture paths;
 * `setSelection(null)` models a deselection). Never throws (NFR-CA-010). No
 * `obsidian`, no `node:*` — the real CM6 + canvas poll is the Obsidian leg
 * (SPEC-CA-007, T-CA-014, coverage-excluded).
 */
export class MockSelectionSource implements SelectionSourcePort {
	readonly supportsBrowserSelection = false;
	private current: CapturedSelection | null = null;
	private readonly listeners = new Set<(sel: CapturedSelection | null) => void>();

	getCurrentSelection(): CapturedSelection | null {
		return this.current;
	}

	onSelectionChange(listener: (sel: CapturedSelection | null) => void): Unsubscriber {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/** Test hook: set the current selection (or `null` to deselect) and notify listeners. */
	setSelection(captured: CapturedSelection | null): void {
		this.current = captured;
		for (const listener of this.listeners) listener(captured);
	}
}

/** A recorded highlight call (SPEC-CA-008 selection leg). */
export type RecordedHighlightCall =
	| { kind: 'show'; target: EditorSelectionContext }
	| { kind: 'clear' };

/**
 * Recording no-op Mock `SelectionHighlightPort` (SPEC-CA-008 selection leg). The
 * real CM6 decoration is the Obsidian leg (SPEC-CA-007, T-CA-014); here `show`/
 * `clear` push to an inspectable array so a test asserts the highlight was driven
 * (TEST-CA-014/015). Never throws. No `obsidian`.
 */
export class MockSelectionHighlight implements SelectionHighlightPort {
	private readonly _calls: RecordedHighlightCall[] = [];

	show(target: EditorSelectionContext): void {
		this._calls.push({ kind: 'show', target });
	}

	clear(): void {
		this._calls.push({ kind: 'clear' });
	}

	/** Test-facing accessor for the recorded calls. */
	get calls(): readonly RecordedHighlightCall[] {
		return this._calls;
	}
}
