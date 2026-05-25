import type { CapturedSelection } from '@/domain/chat/attachments/Selection';
import type { Unsubscriber } from './shared';

/**
 * Reads the active editor/canvas/(capability-permitting) browser selection
 * (SPEC-CA-005, ADR-CA-003 §1). Claudian ground-truth: `SelectionController` /
 * `CanvasSelectionController` / `BrowserSelectionController`. The capture half of
 * the selection seam — the paint half is `SelectionHighlightPort` (capture vs
 * paint are two different Obsidian couplings; interface segregation, ADR-008).
 * Never throws — a transient poll error degrades to `null` (NFR-CA-010, EC-CA-12).
 */
export interface SelectionSourcePort {
	/** The current editor/canvas/browser selection, or null. Synchronous read; never throws. */
	getCurrentSelection(): CapturedSelection | null;
	/**
	 * Subscribe to selection changes; the listener fires with the new selection
	 * (or `null` on deselection). The impl owns the poll cadence (250 ms parity —
	 * impl detail, not contract). Returns an unsubscriber.
	 */
	onSelectionChange(listener: (sel: CapturedSelection | null) => void): Unsubscriber;
	/**
	 * Honest capability flag for the fragile embedded-view (browser) leg
	 * (REQ-CA-018). Fixed per bridge: `ObsidianBridge` sets it `true` only where it
	 * can read an embedded-view selection (P5 may ship `false` — an honest defer);
	 * `MockBridge`/`LocalStorageBridge` ship `false`.
	 */
	readonly supportsBrowserSelection: boolean;
}
