import type { EditorSelectionContext } from '@/domain/chat/attachments/Selection';

/**
 * Paints/removes a highlight over a captured editor range (SPEC-CA-005,
 * ADR-CA-003 §1). Claudian ground-truth:
 * `shared/components/SelectionHighlight.showSelectionHighlight`. The paint half
 * of the selection seam — capture is `SelectionSourcePort`. Only an
 * `EditorSelectionContext` carries an editor range (canvas/browser do not —
 * DESIGN-CA-001 A.3). No `obsidian`/Vue in the contract.
 */
export interface SelectionHighlightPort {
	/** Paint over the captured editor range (REQ-CA-014). */
	show(target: EditorSelectionContext): void;
	/** Remove the highlight; idempotent — clearing when nothing is painted is a no-op (REQ-CA-015). */
	clear(): void;
}
