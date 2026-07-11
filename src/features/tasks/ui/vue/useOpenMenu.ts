// "One overflow menu open at a time" coordination: opening card B's menu first
// tears down whatever is open (its body-portaled node + listeners).
//
// SCOPE (deliberate divergence): `activeClose` is MODULE-GLOBAL, so the invariant
// spans ALL Agent Board leaves/windows — one open card ⋯ menu across the entire
// app, not one per board leaf. This module-global choice is
// intentional and low-impact: a transient popover is only ever open under the
// pointer, so two side-by-side boards each holding a menu open is a marginal case,
// and "close any stray popover anywhere" is benign (arguably better) UX. If a
// future need for per-view scoping arises, thread the closer through provide/inject
// keyed per board leaf rather than this module singleton.
let activeClose: (() => void) | null = null;

export function useOpenMenu(): {
  open: (close: () => void) => void;
  release: (close: () => void) => void;
} {
  return {
    /** Close any other open menu, then register `close` as the active one. */
    open(close: () => void): void {
      if (activeClose && activeClose !== close) activeClose();
      activeClose = close;
    },
    /** Clear the active menu, but only if `close` still owns the slot. */
    release(close: () => void): void {
      if (activeClose === close) activeClose = null;
    },
  };
}
