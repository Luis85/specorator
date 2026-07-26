import type SpecoratorPlugin from '../../main';
import { VIEW_TYPE_ONBOARDING } from './viewType';

/**
 * Reveals (or opens) the Setup leaf as a **main-area tab** — the flow is a
 * full-width, multi-step surface, not sidebar chrome, and unlike a modal it can
 * be left open while the user installs a CLI in a terminal.
 */
export async function activateOnboarding(plugin: SpecoratorPlugin): Promise<void> {
  const { workspace } = plugin.app;
  let leaf = workspace.getLeavesOfType(VIEW_TYPE_ONBOARDING)[0] ?? null;
  if (!leaf) {
    leaf = workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_ONBOARDING, active: true });
  }
  await workspace.revealLeaf(leaf);
  // A workspace-restored leaf may still hold a DeferredView placeholder
  // (Obsidian >= 1.7.2); load it so the island is really mounted.
  await leaf.loadIfDeferred();
}
