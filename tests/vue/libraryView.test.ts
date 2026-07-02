import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryView } from '@/features/library/LibraryView';
import { getLibraryPinia, resetLibraryPinia } from '@/features/library/vue/globalPinia';
import { useLoopLibraryStore } from '@/features/library/vue/stores/loopLibraryStore';

import { makePlugin } from './helpers';

function makeLeaf() {
  return { setViewState: vi.fn().mockResolvedValue(undefined) } as never;
}

/** The obsidian mock's ItemView has no real contentEl; give the view a jsdom one. */
function mountView(view: LibraryView): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(view, 'contentEl', { value: el, configurable: true });
  return el;
}

/** Test seam for the panel-registered tab guard (TAB_GUARD_KEY's backing ref). */
function setGuard(view: LibraryView, guard: (() => Promise<boolean>) | null): void {
  (view as unknown as { tabGuard: { value: (() => Promise<boolean>) | null } }).tabGuard.value =
    guard;
}

describe('LibraryView', () => {
  beforeEach(() => resetLibraryPinia());

  it('exposes the stable view type and metadata', () => {
    const view = new LibraryView(makeLeaf(), makePlugin(true));
    expect(view.getViewType()).toBe('specorator-library');
    expect(view.getDisplayText()).toBe('Library');
    expect(view.getIcon()).toBe('library');
  });

  it('mounts the tab strip with three tabs when the flag is on', async () => {
    const view = new LibraryView(makeLeaf(), makePlugin(true));
    const el = mountView(view);
    await view.onOpen();
    const tabs = el.querySelectorAll('.specorator-library-nav-item');
    expect(tabs).toHaveLength(3);
    expect(el.querySelector('[aria-current="page"]')?.textContent).toContain('Agents');
  });

  it('switches tabs on click and via setActiveTab', async () => {
    const plugin = makePlugin(true);
    // The mounted Loops panel resolves its store against the view's
    // module-singleton pinia — pre-init it there with a stubbed note store so
    // the panel's load() never hits the fake vault.
    setActivePinia(getLibraryPinia());
    useLoopLibraryStore().init(plugin, {
      list: vi.fn().mockResolvedValue({ loops: [], warnings: [] }),
    } as never);
    const view = new LibraryView(makeLeaf(), plugin);
    const el = mountView(view);
    await view.onOpen();
    (el.querySelectorAll('.specorator-library-nav-item')[2] as HTMLElement).click();
    await new Promise((r) => setTimeout(r));
    expect(el.querySelector('.specorator-library-header h2')?.textContent).toContain('Loop library');
    view.setActiveTab('skills');
    await new Promise((r) => setTimeout(r));
    expect(el.querySelector('.specorator-library-header h2')?.textContent).toContain('Skill Library');
  });

  it('treats clicking the already-active tab as a no-op', async () => {
    const view = new LibraryView(makeLeaf(), makePlugin(true));
    const el = mountView(view);
    await view.onOpen();
    const setActiveTab = vi.spyOn(view, 'setActiveTab');
    (el.querySelectorAll('.specorator-library-nav-item')[0] as HTMLElement).click();
    await new Promise((r) => setTimeout(r));
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(el.querySelector('[data-active-tab]')?.getAttribute('data-active-tab')).toBe('agents');
  });

  it('asks a registered tab guard and stays put when it declines', async () => {
    const view = new LibraryView(makeLeaf(), makePlugin(true));
    const guard = vi.fn().mockResolvedValue(false);
    setGuard(view, guard);
    await view.setActiveTab('skills');
    expect(guard).toHaveBeenCalledTimes(1);
    expect(view.getState().tab).toBe('agents');
    guard.mockResolvedValue(true);
    await view.setActiveTab('skills');
    expect(view.getState().tab).toBe('skills');
  });

  it('latches while a guard prompt is pending instead of stacking prompts', async () => {
    const view = new LibraryView(makeLeaf(), makePlugin(true));
    let resolveGuard: (ok: boolean) => void = () => undefined;
    const guard = vi.fn().mockImplementation(
      () => new Promise<boolean>((resolve) => (resolveGuard = resolve)),
    );
    setGuard(view, guard);
    const first = view.setActiveTab('skills');
    await view.setActiveTab('loops'); // latched: resolves without a second prompt
    expect(guard).toHaveBeenCalledTimes(1);
    resolveGuard(true);
    await first;
    expect(view.getState().tab).toBe('skills');
  });

  it('round-trips the active tab through setState/getState', async () => {
    const view = new LibraryView(makeLeaf(), makePlugin(true));
    expect(view.getState().tab).toBe('agents');
    await view.setState({ tab: 'skills' }, {} as never);
    expect(view.getState().tab).toBe('skills');
    await view.setState({ tab: 'bogus' }, {} as never); // unknown tab ignored
    expect(view.getState().tab).toBe('skills');
    await view.setState(null, {} as never); // restore with no state ignored
    expect(view.getState().tab).toBe('skills');
  });

  it('unmounts and empties contentEl on close', async () => {
    const view = new LibraryView(makeLeaf(), makePlugin(true));
    const el = mountView(view);
    await view.onOpen();
    await view.onClose();
    expect(el.childElementCount).toBe(0);
  });

  it('redirects the leaf to the legacy roster view when the flag is off', async () => {
    const leaf = makeLeaf();
    const view = new LibraryView(leaf, makePlugin(false));
    const el = mountView(view);
    // Real Obsidian ordering: onOpen first (mounts nothing, no redirect yet),
    // THEN setState delivers the persisted state and triggers the redirect.
    await view.onOpen();
    expect(el.childElementCount).toBe(0);
    const setViewState = (leaf as { setViewState: ReturnType<typeof vi.fn> }).setViewState;
    expect(setViewState).not.toHaveBeenCalled();
    await view.setState(null, {} as never);
    expect(setViewState).toHaveBeenCalledWith({
      type: 'specorator-agent-roster',
      active: true,
    });
  });

  it('re-homes a stale leaf to the legacy view MATCHING its persisted tab', async () => {
    const leaf = makeLeaf();
    const view = new LibraryView(leaf, makePlugin(false));
    mountView(view);
    await view.onOpen();
    await view.setState({ tab: 'loops' }, {} as never);
    expect((leaf as { setViewState: ReturnType<typeof vi.fn> }).setViewState).toHaveBeenCalledWith({
      type: 'specorator-loop-library',
      active: true,
    });
  });
});
