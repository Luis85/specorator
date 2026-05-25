import { ok, type Result } from '@/domain/shared/Result';
import type { SelectionSourcePort, SelectionHighlightPort } from '@/domain/ports';
import type { CapturedSelection } from '@/domain/chat/attachments';

/**
 * Coordinate `SelectionSourcePort` reads with `SelectionHighlightPort` paint/clear
 * + the focus-hand-off retain (SPEC-CA-016, ADR-CA-003, REQ-CA-013..019). The
 * **focus-within-chat** signal is computed by the UI composable (SPEC-CA-025) and
 * passed in — the port stays a pure capture/paint seam. `Result`-returning, never
 * throws (NFR-CA-010); no provider branch; no `obsidian`/Vue import.
 */
export class CaptureSelectionUseCase {
	private captured: CapturedSelection | null = null;
	private observed = false;

	constructor(
		private readonly source: SelectionSourcePort,
		private readonly highlight: SelectionHighlightPort,
	) {}

	/**
	 * The latest captured selection (or `null`). Before the first `onChange` tick is
	 * observed it seeds from the source's current read, so a freshly-mounted consumer
	 * sees the live selection without waiting for the next poll; once a tick (capture
	 * OR explicit clear/retain) has been observed, the tracked value is authoritative
	 * — an explicit deselection never resurrects a stale source read.
	 */
	current(): CapturedSelection | null {
		return this.observed ? this.captured : this.source.getCurrentSelection();
	}

	/**
	 * A selection-change tick. When `sel` is an `EditorSelectionContext`, paint the
	 * highlight (REQ-CA-014); a `canvas`/`browser` selection captures but paints no
	 * highlight. When `sel` is `null` AND focus has NOT moved into the chat surface,
	 * the selection is dropped → `highlight.clear()` + `null` (REQ-CA-015,
	 * EC-CA-5-clear). When `sel` is `null` BUT focus moved INTO the chat surface,
	 * the previously-captured selection is RETAINED (a focus hand-off is not a
	 * deselection — REQ-CA-016, EC-CA-11); the highlight stays.
	 */
	onChange(
		sel: CapturedSelection | null,
		focusWithinChat: boolean,
	): Result<CapturedSelection | null> {
		this.observed = true;
		if (sel === null) {
			// Focus hand-off into the composer is not a deselection — retain (EC-CA-11).
			if (focusWithinChat) return ok(this.captured);
			// A genuine deselection — drop the capture + clear the highlight.
			this.captured = null;
			this.highlight.clear();
			return ok(null);
		}

		this.captured = sel;
		if (sel.kind === 'editor') {
			this.highlight.show(sel);
		}
		return ok(sel);
	}
}
