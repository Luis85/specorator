import { ref, type Ref } from 'vue';

/**
 * Ephemeral expand-state for a collapsible block (SPEC-RR-024). The expand state
 * is UI-only — it NEVER lives on the DTO (ADR-003); a stored message renders
 * collapsed by default (EC-RR-13). `collapse()` is the programmatic path the
 * thinking block calls on finalise (REQ-RR-014).
 *
 * Mirrors claudian-main `collapsible.ts` `setupCollapsible`/`collapseElement`
 * (the imperative DOM version) as a declarative Vue composable.
 */
export interface UseCollapsible {
	isExpanded: Ref<boolean>;
	/** Function-property syntax (not method) so destructured callers stay unbound-method clean. */
	toggle: () => void;
	collapse: () => void;
	expand: () => void;
}

export function useCollapsible(options?: { initiallyExpanded?: boolean }): UseCollapsible {
	const isExpanded = ref(options?.initiallyExpanded ?? false);

	return {
		isExpanded,
		toggle(): void {
			isExpanded.value = !isExpanded.value;
		},
		collapse(): void {
			isExpanded.value = false;
		},
		expand(): void {
			isExpanded.value = true;
		},
	};
}
