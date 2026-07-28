import { Component } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';

import { mountTabComposer } from '@/features/chat/tabs/tabComposerMount';
import type { ComposerCallbacks } from '@/features/chat/ui/vue/composer/composerCallbacks';

import { makePlugin, makeTab } from './_kit';

/**
 * `onModelChanged` exists for hosts that render the DM's model OUTSIDE the composer — the
 * Team Chat top bar. A same-provider pick never fires `onTabProviderChanged` and re-projects
 * only the composer, so without this notification the top-bar chip and the composer disagreed
 * until some unrelated event happened to re-project the surface.
 *
 * The timing is the whole point: the model write is async, so notifying eagerly hands the host
 * the PREVIOUS settings and the chip stays wrong anyway. These tests drive the real callbacks
 * object through a stubbed island mount.
 */

const { capturedCallbacks, modelChange } = vi.hoisted(() => ({
  capturedCallbacks: { value: null as ComposerCallbacks | null },
  modelChange: { impl: vi.fn() as (model: string) => Promise<void> },
}));

vi.mock('@/features/chat/ui/vue/composer/mountComposer', () => ({
  mountComposer: (_host: unknown, _plugin: unknown, _component: unknown, callbacks: ComposerCallbacks) => {
    capturedCallbacks.value = callbacks;
    return { unmount: vi.fn() };
  },
}));

vi.mock('@/features/chat/tabs/tabUi', () => ({
  openEditedFile: vi.fn(),
  buildToolbarActionCallbacks: () => ({ onModelChange: (model: string) => modelChange.impl(model) }),
}));

function mount(onModelChanged?: () => void): ComposerCallbacks {
  const tab = makeTab();
  mountTabComposer(tab, makePlugin(), new Component(), { onModelChanged });
  const callbacks = capturedCallbacks.value;
  if (!callbacks) throw new Error('composer callbacks were never captured');
  return callbacks;
}

describe('mountTabComposer — model-change notification', () => {
  it('notifies the host only AFTER the model write settles', async () => {
    let release!: () => void;
    modelChange.impl = () => new Promise<void>((resolve) => { release = resolve; });
    const onModelChanged = vi.fn();

    mount(onModelChanged).onSetModel('claude-opus-5');

    // The pick is in flight: settings are still the OLD ones, so a notification here would
    // make the host re-project the previous model.
    await Promise.resolve();
    expect(onModelChanged).not.toHaveBeenCalled();

    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onModelChanged).toHaveBeenCalledTimes(1);
  });

  // A rejected pick may still have been partially applied, and the host re-reads live
  // settings — so a stale chip is strictly worse than one extra re-projection.
  it('notifies the host even when the model write fails', async () => {
    modelChange.impl = () => Promise.reject(new Error('settings write failed'));
    const onModelChanged = vi.fn();

    mount(onModelChanged).onSetModel('claude-opus-5');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onModelChanged).toHaveBeenCalledTimes(1);
  });

  it('is optional — a host that does not render the model wires nothing', async () => {
    modelChange.impl = () => Promise.resolve();

    expect(() => mount().onSetModel('claude-opus-5')).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
