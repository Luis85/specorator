import type SpecoratorPlugin from '../../main';
import { VIEW_TYPE_MARKETPLACE } from './viewType';

/** Reveals (or opens) the Marketplace leaf. */
export async function activateMarketplace(plugin: SpecoratorPlugin): Promise<void> {
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
