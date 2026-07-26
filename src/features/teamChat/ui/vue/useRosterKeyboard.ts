import { type Ref, ref, watch } from 'vue';

/**
 * Roving-tabindex keyboard navigation for the roster listbox (design §1.4).
 *
 * Replaces "every row is a tab stop" with the standard listbox model: the list is ONE
 * tab stop, arrows move focus within it, and Enter/Space commits. Two properties matter:
 *
 *  - **Browse-then-commit.** Arrowing moves FOCUS, not selection. Arrowing through a
 *    20-agent roster must not open 20 DMs — each open resolves a thread, spawns a
 *    runtime, and consumes an LRU slot, so select-follows-focus would be actively
 *    destructive here (unlike in a plain filter list).
 *  - **The focused index survives list changes.** Rows re-sort as previews arrive and
 *    re-filter as the user types, so the index is clamped against the live length
 *    rather than assumed valid.
 */
export interface RosterKeyboard {
  /** Index of the row carrying `tabindex="0"`; every other row carries `-1`. */
  focusedIndex: Ref<number>;
  /** Keydown handler for the listbox container. */
  onKeydown: (event: KeyboardEvent) => void;
  /** Point the roving focus at a row (e.g. on click/mousedown) without opening it. */
  focusRow: (index: number) => void;
}

export function useRosterKeyboard(
  count: () => number,
  onActivate: (index: number) => void,
  /** DOM focus mover, so the composable stays testable without a real listbox. */
  focusRowElement: (index: number) => void,
): RosterKeyboard {
  const focusedIndex = ref(0);

  // A shrinking or re-filtered list must never leave the roving index past the end —
  // that would make the list untabbable (no row would carry tabindex="0").
  watch(count, (length) => {
    if (focusedIndex.value > length - 1) focusedIndex.value = Math.max(0, length - 1);
  });

  function move(next: number): void {
    const length = count();
    if (length === 0) return;
    // Clamp rather than wrap: wrapping from the last row to the first on ArrowDown
    // reads as a jump in a list this short, and Home/End already cover the ends.
    focusedIndex.value = Math.min(length - 1, Math.max(0, next));
    focusRowElement(focusedIndex.value);
  }

  function onKeydown(event: KeyboardEvent): void {
    const length = count();
    if (length === 0) return;
    switch (event.key) {
      case 'ArrowDown':
        // preventDefault on every handled key: otherwise the arrow scrolls the pane
        // underneath while the focus ring moves, which reads as two things happening.
        event.preventDefault();
        move(focusedIndex.value + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(focusedIndex.value - 1);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        onActivate(focusedIndex.value);
        break;
      default:
        break; // every other key (including typing into the search box) passes through
    }
  }

  function focusRow(index: number): void {
    if (index >= 0 && index < count()) focusedIndex.value = index;
  }

  return { focusedIndex, onKeydown, focusRow };
}
