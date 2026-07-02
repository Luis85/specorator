import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryView } from '@/features/library/LibraryView';
import { resetLibraryPinia } from '@/features/library/vue/globalPinia';

import { makePlugin } from './helpers';

describe('LibraryView open/close leak guard', () => {
  let netListeners = 0;
  const origAdd = EventTarget.prototype.addEventListener;
  const origRemove = EventTarget.prototype.removeEventListener;

  beforeEach(() => {
    resetLibraryPinia();
    netListeners = 0;
    // Vue 3 does NOT removeEventListener on unmount — it drops the subtree and
    // lets GC reclaim element listeners (empirically verified: 3 adds, 0
    // removes per mount/unmount). Element-level listeners are therefore NOT a
    // leak once contentEl.empty() drops the subtree. The leak class this guard
    // targets is listeners attached to document/window/body, which empty()
    // cannot reclaim — count ONLY those.
    const counted = (target: unknown): boolean =>
      target === document || target === window || target === document.body;
    EventTarget.prototype.addEventListener = function (...args) {
      if (counted(this)) netListeners += 1;
      return origAdd.apply(this, args as Parameters<typeof origAdd>);
    };
    EventTarget.prototype.removeEventListener = function (...args) {
      if (counted(this)) netListeners -= 1;
      return origRemove.apply(this, args as Parameters<typeof origRemove>);
    };
  });

  afterEach(() => {
    EventTarget.prototype.addEventListener = origAdd;
    EventTarget.prototype.removeEventListener = origRemove;
  });

  it('leaves no DOM and no dangling document/window listeners across 5 cycles', async () => {
    const plugin = makePlugin(true);
    const leaf = { setViewState: vi.fn() } as never;
    for (let i = 0; i < 5; i += 1) {
      const view = new LibraryView(leaf, plugin);
      const el = document.createElement('div');
      Object.defineProperty(view, 'contentEl', { value: el, configurable: true });
      const before = netListeners;
      const bodyChildrenBefore = document.body.childElementCount;
      await view.onOpen();
      await view.onClose();
      expect(el.childElementCount).toBe(0);
      // Panels must not park DOM on <body> (teleports/popovers) and leave it
      // behind — contentEl.empty() cannot reclaim that either.
      expect(document.body.childElementCount).toBe(bodyChildrenBefore);
      // Only document/window/body listeners are counted (see beforeEach); net
      // drift per cycle must be zero once the container is dropped.
      expect(netListeners - before).toBeLessThanOrEqual(0);
    }
  });
});
