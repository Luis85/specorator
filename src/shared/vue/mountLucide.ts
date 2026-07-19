import { setIcon } from 'obsidian';
import type { ComponentPublicInstance } from 'vue';

/**
 * Function-ref host for a Lucide glyph, shared by every Vue island that renders
 * Obsidian icons (the Agent Board, the Marketplace storefront). It records the
 * glyph intent as `data-icon` (the test-lane `setIcon` is a no-op, so this is
 * what component tests assert) and renders the real SVG via `setIcon`. Static
 * per call site, so the arrow-ref churn on re-render is inert.
 *
 * Cross-window-safe: `el instanceof HTMLElement` is bound to the MAIN window's
 * constructor, so in an Obsidian popout (its own window) every node fails the
 * check and the icon renders blank. `nodeType` is a standard, window-independent
 * property: a DOM element node is 1; a Vue ComponentPublicInstance (or null) has
 * none.
 */
export function mountLucide(
  el: Element | ComponentPublicInstance | null,
  icon: string,
): void {
  if (el == null || (el as Partial<Node>).nodeType !== 1) return;
  const host = el as HTMLElement;
  host.setAttribute('data-icon', icon);
  setIcon(host, icon);
}
