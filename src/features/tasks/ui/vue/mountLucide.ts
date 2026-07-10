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
  if (!(el instanceof HTMLElement)) return;
  el.setAttribute('data-icon', icon);
  setIcon(el, icon);
}
