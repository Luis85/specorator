import type SpecoratorPlugin from '../../main';
import { VIEW_TYPE_MARKETPLACE } from './viewType';
import { getMarketplacePinia } from './vue/globalPinia';
import type { MarketplaceView } from './vue/marketplaceView';
import { useMarketplaceStore } from './vue/stores/marketplaceStore';

/**
 * Reveals (or opens) the Marketplace leaf. An optional `requestedView` deep-links
 * the storefront to a category (e.g. the Library's "Browse Marketplace" link on
 * the Agents tab opens the Marketplace scoped to Agents).
 */
export async function activateMarketplace(
  plugin: SpecoratorPlugin,
  requestedView?: MarketplaceView,
): Promise<void> {
  // Record the deep-link target on the shared store BEFORE the leaf mounts, so a
  // fresh view applies it on its first render and an already-open view reacts to
  // the change (see MarketplaceRoot's requestedView watch). If the requested
  // category has no items, the Root's counts guard falls back to Home.
  if (requestedView) useMarketplaceStore(getMarketplacePinia()).requestView(requestedView);
  const { workspace } = plugin.app;
  let leaf = workspace.getLeavesOfType(VIEW_TYPE_MARKETPLACE)[0] ?? null;
  if (!leaf) {
    leaf = workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_MARKETPLACE, active: true });
  }
  await workspace.revealLeaf(leaf);
  // A workspace-restored leaf may hold a DeferredView placeholder (Obsidian
  // >= 1.7.2) — load it so the real view is live.
  await leaf.loadIfDeferred();
}
