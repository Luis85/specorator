import { setIcon } from 'obsidian';
import type { ComponentPublicInstance } from 'vue';

import type { MarketplaceItemType } from '../catalogTypes';

/** Per-type default Lucide glyph, used when a catalog item carries no `icon`. */
const DEFAULT_TYPE_ICONS: Record<MarketplaceItemType, string> = {
  'quick-action': 'zap',
  agent: 'bot',
  loop: 'repeat',
  template: 'file-text',
  skill: 'sparkles',
};

/**
 * The Lucide icon name to render for an item: its own `icon` when a non-empty
 * string, else the per-type default. The catalog is untrusted, but `setIcon`
 * only looks a name up in a fixed icon set (an unknown name renders nothing) —
 * it never injects the string as markup, so passing `item.icon` through is safe.
 */
export function iconForItem(item: { type: MarketplaceItemType; icon?: string }): string {
  const own = item.icon?.trim();
  return own && own.length > 0 ? own : DEFAULT_TYPE_ICONS[item.type];
}

/**
 * Function-ref host for a Lucide glyph (mirrors the board's `mountLucide`):
 * records the intent as `data-icon` (the test-lane `setIcon` is a no-op, so this
 * is what component tests assert) and renders the real SVG via `setIcon`.
 * Cross-window-safe: `nodeType === 1` instead of `instanceof HTMLElement`, which
 * is bound to the main window and fails inside an Obsidian popout.
 */
export function mountIcon(el: Element | ComponentPublicInstance | null, icon: string): void {
  if (el == null || (el as Partial<Node>).nodeType !== 1) return;
  const host = el as HTMLElement;
  host.setAttribute('data-icon', icon);
  setIcon(host, icon);
}
