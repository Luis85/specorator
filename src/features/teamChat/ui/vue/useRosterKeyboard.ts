import { computed, type ComputedRef, ref } from 'vue';

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
 *  - **Focus follows the AGENT, not the slot.** The rail's default `recent` order re-sorts
 *    whenever a thread saves, so a numeric index silently re-points at a different agent:
 *    the focused row would lose `tabindex="0"` and Enter would open whichever agent slid
 *    into that position. Tracking the id and deriving the index makes reordering,
 *    filtering, and deletion all fall out for free.
 */
export interface RosterKeyboard {
  /** Index of the row carrying `tabindex="0"`; every other row carries `-1`. Derived from
   *  the focused id, so it re-points at the same agent across a re-sort. */
  focusedIndex: ComputedRef<number>;
  /** Keydown handler for the listbox container. */
  onKeydown: (event: KeyboardEvent) => void;
  /** Point the roving focus at an agent (e.g. on click) without opening it. */
  focusRow: (id: string) => void;
}

/** The index a navigation key moves focus to, or null when the key isn't one of them.
 *  Split out so `onKeydown` stays a flat dispatcher rather than a five-arm switch. */
function navigationTarget(key: string, current: number, length: number): number | null {
  switch (key) {
    case 'ArrowDown': return current + 1;
    case 'ArrowUp': return current - 1;
    case 'Home': return 0;
    case 'End': return length - 1;
    default: return null;
  }
}

/** Shift+F10 and the dedicated ContextMenu key are the standard "open this item's menu"
 *  gestures for a composite widget — the row's `⋯` button is deliberately out of the tab
 *  order, so these are how a keyboard user reaches it. */
function isContextMenuKey(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
}

export function useRosterKeyboard(
  /** Row ids in render order. Re-read on every access, so a re-sort is picked up live. */
  ids: () => readonly string[],
  onActivate: (id: string) => void,
  /** DOM focus mover, so the composable stays testable without a real listbox. */
  focusRowElement: (index: number) => void,
  /** Row-level menu gesture (Shift+F10 / ContextMenu key). */
  onContextMenu: (id: string) => void = () => {},
): RosterKeyboard {
  const focusedId = ref<string | null>(null);

  // Falls back to the first row whenever the focused agent is absent — filtered out,
  // deleted, or never set. That keeps exactly one row tabbable at all times; an
  // out-of-range index would leave the whole list unreachable by Tab.
  const focusedIndex = computed(() => {
    const index = focusedId.value === null ? -1 : ids().indexOf(focusedId.value);
    return index === -1 ? 0 : index;
  });

  function move(next: number): void {
    const list = ids();
    if (list.length === 0) return;
    // Clamp rather than wrap: wrapping from the last row to the first on ArrowDown
    // reads as a jump in a list this short, and Home/End already cover the ends.
    const target = Math.min(list.length - 1, Math.max(0, next));
    focusedId.value = list[target];
    focusRowElement(target);
  }

  function onKeydown(event: KeyboardEvent): void {
    const list = ids();
    if (list.length === 0) return;
    // Keystrokes that originated in an interactive descendant (the row's `⋯` menu button)
    // belong to that control, not the list. Without this, Enter/Space on the focused menu
    // button bubbles here, gets preventDefault'd, and opens the DM instead of the menu —
    // which would make the "keyboard-reachable" action menu unreachable by keyboard.
    if (isInteractiveDescendant(event.target)) return;
    // `focusedIndex` is always in range here: the empty list returned above, and it falls
    // back to 0 whenever the focused id is absent.
    const focusedId = list[focusedIndex.value];

    if (isContextMenuKey(event)) {
      event.preventDefault();
      onContextMenu(focusedId);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate(focusedId);
      return;
    }
    const target = navigationTarget(event.key, focusedIndex.value, list.length);
    if (target === null) return; // every other key (including typing into search) passes through
    // preventDefault only on keys we handle: otherwise the arrow scrolls the pane underneath
    // while the focus ring moves, which reads as two things happening at once.
    event.preventDefault();
    move(target);
  }

  function focusRow(id: string): void {
    focusedId.value = id;
  }

  return { focusedIndex, onKeydown, focusRow };
}

/**
 * True when the event started on a focusable control INSIDE a row, rather than on the row
 * itself. `closest` walks up from the target, and a row is a `div[role=option]`, so only a
 * real nested control matches.
 *
 * Checks `nodeType` rather than `instanceof Element`: an Obsidian POPOUT leaf lives in
 * another window, so its nodes are built from that realm's constructors and would fail
 * `instanceof` against this one — silently letting the menu button's Enter/Space fall
 * through to the listbox and open the DM. The `closest` typeof guard covers the same
 * cross-realm concern for the method itself.
 */
function isInteractiveDescendant(target: EventTarget | null): boolean {
  const node = target as Node | null;
  if (!node || node.nodeType !== 1 /* Node.ELEMENT_NODE */) return false;
  const element = node as Element;
  return typeof element.closest === 'function'
    && element.closest('button, a, input, select, textarea') !== null;
}
