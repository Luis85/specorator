import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryView } from '@/features/library/LibraryView';
import { getLibraryPinia, resetLibraryPinia } from '@/features/library/vue/globalPinia';
import { useLoopLibraryStore } from '@/features/library/vue/stores/loopLibraryStore';

import { makePlugin } from './helpers';

function makeLeaf() {
  // Empty stub: LibraryView no longer drives the leaf itself (the flag-off
  // redirect that used setViewState was deleted with the legacy views).
  return {} as never;
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
    const view = new LibraryView(makeLeaf(), makePlugin());
    expect(view.getViewType()).toBe('specorator-library');
    expect(view.getDisplayText()).toBe('Library');
    expect(view.getIcon()).toBe('library');
  });

  it('mounts the tab strip with four tabs and the Agents panel as the default', async () => {
    const view = new LibraryView(makeLeaf(), makePlugin());
    const el = mountView(view);
    await view.onOpen();
    const tabs = el.querySelectorAll('.specorator-vue-lib-nav-item');
    expect(tabs).toHaveLength(4);
    expect(el.querySelector('[aria-current="page"]')?.textContent).toContain('Agents');
    expect(el.querySelector('.specorator-vue-panel-header h2')?.textContent).toContain('Agent Roster');
  });

  it('clicking the Quick actions tab mounts the Quick Actions panel', async () => {
    const view = new LibraryView(makeLeaf(), makePlugin());
    const el = mountView(view);
    await view.onOpen();
    (el.querySelectorAll('.specorator-vue-lib-nav-item')[3] as HTMLElement).click();
    await new Promise((r) => setTimeout(r));
    expect(el.querySelector('.specorator-vue-panel-header h2')?.textContent)
      .toContain('Quick action library');
  });

  it('switches tabs on click and via setActiveTab', async () => {
    const plugin = makePlugin();
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
    (el.querySelectorAll('.specorator-vue-lib-nav-item')[2] as HTMLElement).click();
    await new Promise((r) => setTimeout(r));
    expect(el.querySelector('.specorator-vue-panel-header h2')?.textContent).toContain('Loop library');
    view.setActiveTab('skills');
    await new Promise((r) => setTimeout(r));
    expect(el.querySelector('.specorator-vue-panel-header h2')?.textContent).toContain('Skill Library');
  });

  it('treats clicking the already-active tab as a no-op', async () => {
    const view = new LibraryView(makeLeaf(), makePlugin());
    const el = mountView(view);
    await view.onOpen();
    const setActiveTab = vi.spyOn(view, 'setActiveTab');
    (el.querySelectorAll('.specorator-vue-lib-nav-item')[0] as HTMLElement).click();
    await new Promise((r) => setTimeout(r));
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(el.querySelector('.specorator-vue-panel-header h2')?.textContent).toContain('Agent Roster');
  });

  it('asks a registered tab guard and stays put when it declines', async () => {
    const view = new LibraryView(makeLeaf(), makePlugin());
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
    const view = new LibraryView(makeLeaf(), makePlugin());
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
    const view = new LibraryView(makeLeaf(), makePlugin());
    expect(view.getState().tab).toBe('agents');
    await view.setState({ tab: 'skills' }, {} as never);
    expect(view.getState().tab).toBe('skills');
    await view.setState({ tab: 'bogus' }, {} as never); // unknown tab ignored
    expect(view.getState().tab).toBe('skills');
    // quick-actions is a reachable persisted state since the open-quick-actions
    // command landed; it must restore, not fall back (panel arrives in Task 5).
    await view.setState({ tab: 'quick-actions' }, {} as never);
    expect(view.getState().tab).toBe('quick-actions');
    await view.setState(null, {} as never); // restore with no state ignored
    expect(view.getState().tab).toBe('quick-actions');
  });

  it('scopes contentEl under the Vue island classes while open, not the legacy scaffold', async () => {
    const view = new LibraryView(makeLeaf(), makePlugin());
    const el = mountView(view);
    await view.onOpen();
    expect(el.classList.contains('specorator-vue')).toBe(true);
    expect(el.classList.contains('specorator-library-vue-root')).toBe(true);
    expect(el.classList.contains('specorator-library')).toBe(false);
    await view.onClose();
    expect(el.classList.contains('specorator-vue')).toBe(false);
    expect(el.classList.contains('specorator-library-vue-root')).toBe(false);
  });

  it('unmounts and empties contentEl on close', async () => {
    const view = new LibraryView(makeLeaf(), makePlugin());
    const el = mountView(view);
    await view.onOpen();
    await view.onClose();
    expect(el.childElementCount).toBe(0);
  });
});
