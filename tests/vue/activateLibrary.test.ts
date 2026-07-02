import { beforeEach, describe, expect, it, vi } from 'vitest';

import { activateLibrary } from '@/features/library/activateLibrary';
import { LibraryView } from '@/features/library/LibraryView';
import { VIEW_TYPE_LIBRARY } from '@/features/library/viewType';
import { resetLibraryPinia } from '@/features/library/vue/globalPinia';

import { makePlugin } from './helpers';

interface FakeLeaf {
  view: unknown;
  setViewState: ReturnType<typeof vi.fn>;
  loadIfDeferred: ReturnType<typeof vi.fn>;
}

function makeLibraryLeaf(view: unknown): FakeLeaf {
  return {
    view,
    setViewState: vi.fn().mockResolvedValue(undefined),
    loadIfDeferred: vi.fn().mockResolvedValue(undefined),
  };
}

/** Plugin whose workspace serves `existing` Library leaves and creates `created`. */
function makeWorkspacePlugin(existing: FakeLeaf[], created?: FakeLeaf) {
  const workspace = {
    getLeavesOfType: vi.fn().mockReturnValue(existing),
    getLeaf: vi.fn().mockReturnValue(created),
    revealLeaf: vi.fn().mockResolvedValue(undefined),
  };
  const plugin = makePlugin(true) as { app: { workspace?: unknown } };
  plugin.app.workspace = workspace;
  return { plugin: plugin as never, workspace };
}

function makeRealView(): LibraryView {
  return new LibraryView(makeLibraryLeaf(null) as never, makePlugin(true));
}

describe('activateLibrary', () => {
  beforeEach(() => resetLibraryPinia());

  it('reuses an existing Library leaf, reveals it, and switches the tab', async () => {
    const view = makeRealView();
    const leaf = makeLibraryLeaf(view);
    const { plugin, workspace } = makeWorkspacePlugin([leaf]);
    await activateLibrary(plugin, 'skills');
    expect(workspace.getLeaf).not.toHaveBeenCalled();
    expect(leaf.setViewState).not.toHaveBeenCalled();
    expect(workspace.revealLeaf).toHaveBeenCalledWith(leaf);
    expect(leaf.loadIfDeferred).toHaveBeenCalled();
    expect(view.getState().tab).toBe('skills');
  });

  it('creates a Library leaf when none exists and lands on the requested tab', async () => {
    const view = makeRealView();
    const leaf = makeLibraryLeaf(view);
    const { plugin, workspace } = makeWorkspacePlugin([], leaf);
    await activateLibrary(plugin, 'loops');
    expect(workspace.getLeaf).toHaveBeenCalledWith('tab');
    expect(leaf.setViewState).toHaveBeenCalledWith({ type: VIEW_TYPE_LIBRARY, active: true });
    expect(workspace.revealLeaf).toHaveBeenCalledWith(leaf);
    expect(view.getState().tab).toBe('loops');
  });

  it('loads a deferred leaf BEFORE switching, so the tab reaches the real view', async () => {
    const view = makeRealView();
    // Workspace restore can hand back a DeferredView placeholder; the real
    // LibraryView only appears after loadIfDeferred().
    const leaf = makeLibraryLeaf({ deferred: true });
    leaf.loadIfDeferred.mockImplementation(async () => {
      leaf.view = view;
    });
    const { plugin } = makeWorkspacePlugin([leaf]);
    await activateLibrary(plugin, 'skills');
    expect(leaf.loadIfDeferred).toHaveBeenCalled();
    expect(view.getState().tab).toBe('skills');
  });

  it('still reveals (and does not throw) when the leaf view is not a LibraryView', async () => {
    const leaf = makeLibraryLeaf({ not: 'a library view' });
    const { plugin, workspace } = makeWorkspacePlugin([leaf]);
    await expect(activateLibrary(plugin, 'agents')).resolves.toBeUndefined();
    expect(workspace.revealLeaf).toHaveBeenCalledWith(leaf);
  });
});
