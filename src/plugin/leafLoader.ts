import type { WorkspaceLeaf } from 'obsidian'

/**
 * Obsidian 1.7.2+ defers view leaves by default. `workspace.getLeavesOfType()`
 * may return leaves whose `.view` is a `DeferredView` placeholder. Awaiting
 * this helper before any view-typed access (or `revealLeaf`) materialises the
 * real view.
 *
 * @see https://docs.obsidian.md/Plugins/Guides/Understanding+deferred+views
 */
export async function ensureLeafLoaded(leaf: WorkspaceLeaf): Promise<void> {
  if (leaf.isDeferred) {
    await leaf.loadIfDeferred()
  }
}
