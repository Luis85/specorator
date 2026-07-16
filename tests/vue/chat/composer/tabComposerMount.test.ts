import '@/providers';

import { flushPromises } from '@vue/test-utils';
import { Component } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mountTabComposer } from '@/features/chat/tabs/tabComposerMount';

import { makePlugin, makeTab } from './_kit';

// The projection derives its wrapper-mode + toolbar slices from these; stub so
// the mount needs no real provider wiring.
vi.mock('@/features/chat/tabs/tabShared', () => ({
  getTabPermissionMode: () => 'normal',
  getTabCapabilities: () => ({ supportsPlanMode: true }),
  getTabSettingsSnapshot: () => ({ model: '', thinkingBudget: '', effortLevel: '', serviceTier: '', permissionMode: 'normal' }),
  getTabChatUIConfig: () => ({ getModelOptions: () => [] }),
  getProviderMcpManager: () => null,
}));

describe('mountTabComposer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers every element handle to tab.dom.*, including the Vue-rendered textarea', async () => {
    const tab = makeTab();
    mountTabComposer(tab, makePlugin(), new Component());
    await flushPromises();

    const container = tab.dom.composerHostEl.querySelector('.specorator-input-container') as HTMLElement;
    expect(tab.dom.inputContainerEl).toBe(container);
    expect(tab.dom.navRowEl).toBe(container.querySelector('.specorator-input-nav-row'));
    expect(tab.dom.inputWrapper).toBe(container.querySelector('.specorator-input-wrapper'));
    expect(tab.dom.contextRowEl).toBe(container.querySelector('.specorator-context-row'));
    // The toolbar is rendered directly by ComposerToolbar.vue (no host handle).
    expect(container.querySelector('.specorator-input-toolbar')).not.toBeNull();

    // The three engine-driven selection indicators are Vue-rendered and their
    // raw nodes registered to tab.dom.* for the out-of-scope controllers.
    expect(tab.dom.selectionIndicatorEl).toBe(container.querySelector('.specorator-selection-indicator'));
    expect(tab.dom.browserIndicatorEl).toBe(container.querySelector('.specorator-browser-selection-indicator'));
    expect(tab.dom.canvasIndicatorEl).toBe(container.querySelector('.specorator-canvas-indicator'));

    // Queue row registered to BOTH tab.dom and ChatState.
    const queueRow = container.querySelector('.specorator-input-queue-row');
    expect(tab.dom.queueIndicatorEl).toBe(queueRow);
    expect(tab.state.queueIndicatorEl).toBe(queueRow);

    // ComposerTextarea.vue renders the <textarea> directly (Phase 4 deleted the
    // host div); its raw node is registered as tab.dom.inputEl.
    expect(container.querySelector('textarea.specorator-input')).toBe(tab.dom.inputEl);

    tab.mountedComposer!.unmount();
  });

  it('constructs the per-tab projection and mounts the island', async () => {
    const tab = makeTab();
    mountTabComposer(tab, makePlugin(), new Component());
    await flushPromises();
    expect(tab.composer).not.toBeNull();
    expect(tab.mountedComposer).not.toBeNull();
    tab.mountedComposer!.unmount();
  });
});
