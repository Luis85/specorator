import '@/providers';

import { flushPromises } from '@vue/test-utils';
import { App, Component } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mountTabComposer } from '@/features/chat/tabs/tabComposerMount';
import type { TabData } from '@/features/chat/tabs/types';
import type SpecoratorPlugin from '@/main';

// The projection derives its wrapper-mode + toolbar slices from these; stub so
// the mount needs no real provider wiring.
vi.mock('@/features/chat/tabs/tabShared', () => ({
  getTabPermissionMode: () => 'normal',
  getTabCapabilities: () => ({ supportsPlanMode: true }),
  getTabSettingsSnapshot: () => ({ model: '', thinkingBudget: '', effortLevel: '', serviceTier: '', permissionMode: 'normal' }),
  getTabChatUIConfig: () => ({ getModelOptions: () => [] }),
  getProviderMcpManager: () => null,
}));

function makeTab(): TabData {
  const doc = document;
  const contentEl = doc.createElement('div');
  doc.body.appendChild(contentEl);
  const composerHostEl = contentEl.appendChild(doc.createElement('div'));
  const inputEl = doc.createElement('textarea');
  inputEl.className = 'specorator-input';
  return {
    dom: {
      contentEl, composerHostEl,
      inputContainerEl: composerHostEl, queueIndicatorEl: composerHostEl,
      inputWrapper: composerHostEl, inputEl, navRowEl: composerHostEl,
      editedFilesRowEl: composerHostEl, contextRowEl: composerHostEl,
    },
    state: { isStreaming: false, queueIndicatorEl: null },
    ui: { instructionModeManager: null, bangBashModeManager: null },
    controllers: { inputController: null },
    composer: null,
    mountedComposer: null,
  } as unknown as TabData;
}

function makePlugin(): SpecoratorPlugin {
  return { app: new App(), settings: {}, getActiveEnvironmentVariables: () => '' } as unknown as SpecoratorPlugin;
}

describe('mountTabComposer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers every element handle to tab.dom.* and hosts the engine textarea', async () => {
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

    // Queue row registered to BOTH tab.dom and ChatState.
    const queueRow = container.querySelector('.specorator-input-queue-row');
    expect(tab.dom.queueIndicatorEl).toBe(queueRow);
    expect(tab.state.queueIndicatorEl).toBe(queueRow);

    // The engine textarea is hosted inside the Vue textarea host.
    const host = container.querySelector('.specorator-vue-composer-textarea-host') as HTMLElement;
    expect(host.querySelector('textarea.specorator-input')).toBe(tab.dom.inputEl);

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
