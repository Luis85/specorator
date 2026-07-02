import type SpecoratorPlugin from '../../main';
import { LibraryView } from './LibraryView';
import type { LibraryTab } from './viewType';
import { VIEW_TYPE_LIBRARY } from './viewType';

/** Reveals (or opens) the unified Library leaf and switches it to `tab`. */
export async function activateLibrary(plugin: SpecoratorPlugin, tab: LibraryTab): Promise<void> {
  const { workspace } = plugin.app;
  let leaf = workspace.getLeavesOfType(VIEW_TYPE_LIBRARY)[0] ?? null;
  if (!leaf) {
    leaf = workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_LIBRARY, active: true });
  }
  await workspace.revealLeaf(leaf);
  // A workspace-restored leaf may still hold a DeferredView placeholder
  // (Obsidian >= 1.7.2) — load it so the tab switch reaches the real view
  // (repo convention; see src/features/chat/isSpecoratorView.ts).
  await leaf.loadIfDeferred();
  if (leaf.view instanceof LibraryView) await leaf.view.setActiveTab(tab);
}
