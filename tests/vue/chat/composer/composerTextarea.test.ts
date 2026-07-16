import '@/providers';

import { flushPromises } from '@vue/test-utils';
import { Component, Platform } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mountTabComposer } from '@/features/chat/tabs/tabComposerMount';
import { wireTabInputEvents } from '@/features/chat/tabs/tabInputWiring';
import type { TabData } from '@/features/chat/tabs/types';
import type SpecoratorPlugin from '@/main';

import { makePlugin, makeTab } from './_kit';

// The projection derives its wrapper-mode + toolbar slices from these; stub so
// the mount needs no real provider wiring (mirrors tabComposerMount.test.ts).
vi.mock('@/features/chat/tabs/tabShared', () => ({
  getTabPermissionMode: () => 'normal',
  getTabCapabilities: () => ({ supportsPlanMode: true }),
  getTabSettingsSnapshot: () => ({ model: '', thinkingBudget: '', effortLevel: '', serviceTier: '', permissionMode: 'normal' }),
  getTabChatUIConfig: () => ({ getModelOptions: () => [] }),
  getProviderMcpManager: () => null,
}));

function mountAndWire(): { tab: TabData; textarea: HTMLTextAreaElement } {
  const tab = makeTab();
  mountTabComposer(tab, makePlugin(), new Component());
  const textarea = tab.dom.inputEl;
  // Send routing is keyboard-only; wire the same keydown handler production uses.
  wireTabInputEvents(tab, {} as SpecoratorPlugin);
  return { tab, textarea };
}

describe('ComposerTextarea (hard cutover)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers the Vue-rendered textarea as tab.dom.inputEl', async () => {
    const tab = makeTab();
    mountTabComposer(tab, makePlugin(), new Component());
    await flushPromises();
    const rendered = tab.dom.composerHostEl.querySelector('textarea.specorator-input');
    expect(rendered).not.toBeNull();
    expect(tab.dom.inputEl).toBe(rendered);
    tab.mountedComposer!.unmount();
  });

  it('Vue never clobbers .value or selection after mount', async () => {
    const { tab, textarea } = mountAndWire();
    await flushPromises();

    textarea.value = 'hello world';
    textarea.setSelectionRange(2, 5);

    // Force a projection emit that re-renders the textarea's siblings (toolbar +
    // wrapper-mode classes); the textarea has NO reactive binding, so its raw
    // node — value, selection, connectedness — must survive untouched.
    tab.state.isStreaming = true;
    tab.composer!.emit();
    await flushPromises();

    expect(textarea.value).toBe('hello world');
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(5);
    expect(textarea.isConnected).toBe(true);
    tab.mountedComposer!.unmount();
  });

  it('Mod+Enter still routes through tabInputWiring to sendMessage', async () => {
    const { tab, textarea } = mountAndWire();
    await flushPromises();

    // The send modifier is platform-coupled: metaKey satisfies it only on mac.
    // Pin explicitly rather than leaning on the obsidian mock's isMacOS default.
    Platform.isMacOS = true;

    textarea.value = 'send me';
    textarea.focus();
    const evt = new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true, cancelable: true });
    textarea.dispatchEvent(evt);

    expect(tab.controllers.inputController!.sendMessage).toHaveBeenCalledTimes(1);
    expect(evt.defaultPrevented).toBe(true);
    tab.mountedComposer!.unmount();
  });

  it('does NOT send while composing (IME) — isComposing short-circuits', async () => {
    const { tab, textarea } = mountAndWire();
    await flushPromises();

    textarea.value = '日本語';
    textarea.focus();
    // KeyboardEvent.isComposing is read-only; stamp the flag onto the instance.
    const evt = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(evt, 'isComposing', { value: true });
    textarea.dispatchEvent(evt);

    expect(tab.controllers.inputController!.sendMessage).not.toHaveBeenCalled();
    tab.mountedComposer!.unmount();
  });
});
