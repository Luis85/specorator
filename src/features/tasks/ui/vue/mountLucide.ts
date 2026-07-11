import { setIcon } from 'obsidian';
import type { ComponentPublicInstance } from 'vue';

/**
 * Function-ref host for a Lucide glyph, mirroring the imperative board renderer:
 * it records the glyph intent as `data-icon` (the mock `setIcon` is a no-op, so
 * this is what the characterization tests assert) and renders the real SVG via
 * `setIcon`. Static per call site, so the arrow-ref churn on re-render is inert.
 */
export function mountLucide(
  el: Element | ComponentPublicInstance | null,
  icon: string,
): void {
  // Cross-window-safe element check. `el instanceof HTMLElement` is bound to the
  // MAIN window's constructor, so in an Obsidian popout (its own window) every
  // node fails the check and the icon renders blank. `nodeType` is a standard,
  // window-independent property: a DOM element node is 1; a Vue
  // ComponentPublicInstance (or null) has none.
  if (el == null || (el as Partial<Node>).nodeType !== 1) return;
  const host = el as HTMLElement;
  host.setAttribute('data-icon', icon);
  setIcon(host, icon);
}
