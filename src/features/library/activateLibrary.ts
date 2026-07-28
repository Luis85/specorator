import type SpecoratorPlugin from '../../main';
import type { LibraryTab } from './viewType';
import { VIEW_TYPE_LIBRARY } from './viewType';

/** The one thing this module needs off the revealed view. Structural, so `activateLibrary`
 *  does NOT import `LibraryView` — that import made the module graph cyclic for anything the
 *  Library itself can reach: Library → LibraryRoot → AgentsPanel → activateTeamChat →
 *  TeamChatView → (edit-agent) activateLibrary → LibraryView. Narrowing to the method keeps
 *  the deep-link working while leaving the graph acyclic. */
interface LibraryTabHost {
  setActiveTab(tab: LibraryTab): Promise<void>;
}

function asLibraryTabHost(view: unknown): LibraryTabHost | null {
  const candidate = view as Partial<LibraryTabHost> | null;
  return typeof candidate?.setActiveTab === 'function' ? candidate as LibraryTabHost : null;
}

/**
 * Reveals (or opens) the unified Library leaf; switches to `tab` when given,
 * otherwise reveals the leaf on its current tab.
 */
export async function activateLibrary(plugin: SpecoratorPlugin, tab?: LibraryTab): Promise<void> {
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
  // Safe to structurally check here: the leaf's type was just set to VIEW_TYPE_LIBRARY and
  // its deferred view loaded, so the only case this rejects is a view that failed to build —
  // exactly what the previous `instanceof` rejected.
  const host = tab ? asLibraryTabHost(leaf.view) : null;
  if (tab && host) await host.setActiveTab(tab);
}
