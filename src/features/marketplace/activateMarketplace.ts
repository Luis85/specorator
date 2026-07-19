import type SpecoratorPlugin from '../../main';
import { VIEW_TYPE_MARKETPLACE } from './viewType';
import type { MarketplaceView } from './vue/marketplaceView';

/**
 * Reveals (or opens) the Marketplace leaf. An optional `requestedView` deep-links
 * the storefront to a category (e.g. the Library's "Browse Marketplace" link on
 * the Agents tab opens the Marketplace scoped to Agents).
 */
export async function activateMarketplace(
  plugin: SpecoratorPlugin,
  requestedView?: MarketplaceView,
): Promise<void> {
  const { workspace } = plugin.app;
  let leaf = workspace.getLeavesOfType(VIEW_TYPE_MARKETPLACE)[0] ?? null;
  if (!leaf) {
    leaf = workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_MARKETPLACE, active: true });
  }
  await workspace.revealLeaf(leaf);
  // A workspace-restored leaf may hold a DeferredView placeholder (Obsidian
  // >= 1.7.2) — load it so the real view is live BEFORE we deep-link it.
  await leaf.loadIfDeferred();
  // Apply the deep-link to the REVEALED leaf's view ONLY — not a shared-store
  // broadcast every mounted Root races to consume (which, with a second live
  // leaf, would navigate the wrong one). Duck-typed so this module needn't import
  // the view class. If the requested category has no items, the Root's counts
  // guard falls it back to Home.
  if (requestedView) {
    (leaf.view as { requestView?: (view: MarketplaceView) => void }).requestView?.(requestedView);
  }
}
