import { flushPromises } from '@vue/test-utils';
import { App, Component } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComposerCallbacks } from '@/features/chat/ui/vue/composer/composerCallbacks';
import { mountComposer } from '@/features/chat/ui/vue/composer/mountComposer';
import type SpecoratorPlugin from '@/main';

function makePlugin(): SpecoratorPlugin {
  return { app: new App(), settings: {} } as unknown as SpecoratorPlugin;
}

function makeCallbacks(): { callbacks: ComposerCallbacks; registered: Record<string, HTMLElement | null> } {
  const registered: Record<string, HTMLElement | null> = {
    container: null, navRow: null, wrapper: null, contextRow: null,
    queueRow: null, textareaHost: null,
    selectionIndicator: null, browserIndicator: null, canvasIndicator: null,
  };
  const callbacks: ComposerCallbacks = {
    subscribe: (onChange) => {
      onChange({
        toolbar: { modelLabel: '', modelGroups: [], mode: null, reasoning: null, serviceTier: null, permission: null, planMode: { visible: false, active: false }, mcp: { visible: false, count: 0, servers: [] }, externalContext: { count: 0, items: [] }, usage: null },
        chips: { currentNote: null, files: [], folders: [], images: [] },
        editedFiles: [], streaming: { isStreaming: false },
        dropdown: { kind: null, items: [], activeIndex: 0, anchorRect: null },
        inputMode: 'none', draftMeta: { isEmpty: true, activeMode: 'none' },
        wrapperMode: { planMode: false, instructionMode: false, bangBashMode: false },
      });
      return () => {};
    },
    onSetModel: () => {}, onSetMode: () => {}, onSetEffortLevel: () => {},
    onSetThinkingBudget: () => {}, onSetServiceTier: () => {}, onSetPermission: () => {},
    onTogglePlanMode: () => {}, onToggleMcpServer: () => {}, onAddExternalContext: () => {},
    onRemoveExternalContext: () => {}, onToggleExternalContextPersistence: () => {},
    onRemoveChip: () => {}, onOpenImage: () => {}, onOpenFile: () => {}, onOpenEditedFile: () => {},
    registerInputContainer: (el) => { registered.container = el; },
    registerNavRow: (el) => { registered.navRow = el; },
    registerInputWrapper: (el) => { registered.wrapper = el; },
    registerContextRow: (el) => { registered.contextRow = el; },
    registerQueueRow: (el) => { registered.queueRow = el; },
    registerTextareaHost: (el) => { registered.textareaHost = el; },
    registerSelectionIndicator: (el) => { registered.selectionIndicator = el; },
    registerBrowserIndicator: (el) => { registered.browserIndicator = el; },
    registerCanvasIndicator: (el) => { registered.canvasIndicator = el; },
  };
  return { callbacks, registered };
}

describe('mountComposer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the structural shell and registers every element handle synchronously on mount', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { callbacks, registered } = makeCallbacks();

    const mounted = mountComposer(container, makePlugin(), new Component(), callbacks);

    // Registered before flushPromises — captured during app.mount().
    expect(registered.container).toBe(container.querySelector('.specorator-input-container'));
    expect(registered.navRow).toBe(container.querySelector('.specorator-input-nav-row'));
    expect(registered.wrapper).toBe(container.querySelector('.specorator-input-wrapper'));
    expect(registered.contextRow).toBe(container.querySelector('.specorator-context-row'));
    expect(registered.queueRow).toBe(container.querySelector('.specorator-input-queue-row'));
    expect(registered.textareaHost).toBe(container.querySelector('.specorator-vue-composer-textarea-host'));
    expect(registered.selectionIndicator).toBe(container.querySelector('.specorator-selection-indicator'));
    expect(registered.browserIndicator).toBe(container.querySelector('.specorator-browser-selection-indicator'));
    expect(registered.canvasIndicator).toBe(container.querySelector('.specorator-canvas-indicator'));
    // The toolbar is now rendered directly by ComposerToolbar.vue (no host handle).
    expect(container.querySelector('.specorator-input-toolbar')).not.toBeNull();

    // Baseline token scope + drop-query target present.
    expect(container.querySelector('.specorator-input-container')!.classList.contains('specorator-vue')).toBe(true);

    await flushPromises();
    mounted.unmount();
    container.remove();
  });
});
