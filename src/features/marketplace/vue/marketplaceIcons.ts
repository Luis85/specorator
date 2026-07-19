import type { MarketplaceItemType } from '../catalogTypes';

// The Lucide function-ref host is shared with the Agent Board — re-exported here
// so marketplace components have a single icon-concerns import surface.
export { mountLucide } from '../../../shared/vue/mountLucide';

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
