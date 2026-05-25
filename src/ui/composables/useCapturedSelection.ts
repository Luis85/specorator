import { shallowRef, onScopeDispose, type Ref } from 'vue';
import type { SelectionSourcePort, SelectionHighlightPort } from '@/domain/ports';
import type { CapturedSelection } from '@/domain/chat/attachments';
import { CaptureSelectionUseCase } from '@/application/chat/attachments/CaptureSelectionUseCase';

/** The reactive captured-selection handle a `SelectionIndicator` host reads. */
export interface CapturedSelectionApi {
	/** The latest captured selection (or `null`) — reactive. */
	readonly current: Ref<CapturedSelection | null>;
	/** Explicitly drop the captured selection + clear the highlight (REQ-CA-015). */
	clear(): void;
}

/**
 * The selection composable (SPEC-CA-025, REQ-CA-013/016). Subscribes
 * `source.onSelectionChange`, computes the **focus-within-chat** signal (whether
 * the active element is inside the chat surface — the focus hand-off retain,
 * REQ-CA-016), feeds `CaptureSelectionUseCase.onChange(sel, focusWithinChat)`,
 * and exposes the reactive `current` selection + a `clear()`. No `obsidian`
 * import (NFR-CA-002); DTO-only across any store boundary (NFR-CA-004).
 *
 * `chatRoot` is the chat-surface element ref; a `null` source tick is a genuine
 * deselection only when focus is NOT inside it (a focus hand-off into the
 * composer must not deselect — EC-CA-11). The subscription is torn down with the
 * owning scope.
 */
export function useCapturedSelection(
	source: SelectionSourcePort,
	highlight: SelectionHighlightPort,
	chatRoot: Ref<HTMLElement | null>,
): CapturedSelectionApi {
	const useCase = new CaptureSelectionUseCase(source, highlight);
	const current = shallowRef<CapturedSelection | null>(useCase.current());

	function focusWithinChat(): boolean {
		const root = chatRoot.value;
		const active = typeof document === 'undefined' ? null : document.activeElement;
		return root !== null && active !== null && root.contains(active);
	}

	function apply(sel: CapturedSelection | null): void {
		const result = useCase.onChange(sel, focusWithinChat());
		current.value = result.ok ? result.value : current.value;
	}

	const unsubscribe = source.onSelectionChange(apply);

	function clear(): void {
		// An explicit clear is a deselection regardless of focus.
		useCase.onChange(null, false);
		current.value = null;
	}

	onScopeDispose(unsubscribe);

	return { current, clear };
}
