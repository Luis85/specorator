import '@/providers';

import { flushPromises } from '@vue/test-utils';
import { Component } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateContextRowHasContent } from '@/features/chat/controllers/contextRowVisibility';
import { QueuedMessageController } from '@/features/chat/controllers/QueuedMessageController';
import { mountTabComposer } from '@/features/chat/tabs/tabComposerMount';
import type { TabData } from '@/features/chat/tabs/types';

import { makePlugin, makeTab } from './_kit';

/**
 * The cross-surface DOM-contract backstop for the composer Vue island (Task 20 /
 * ADR 0005 sub-project 3). Vue took over the composer DOM, but several
 * still-imperative consumers read it by class or hold raw handles and are OUT of
 * scope of this migration:
 *
 *   - `ChatDropController` — binds its drop overlay to `.specorator-input-wrapper`.
 *   - `InlinePromptController` — hides/restores `.specorator-input-container`.
 *   - `resolveNavRowEl` / the shell Teleport — targets `.specorator-input-nav-row`.
 *   - `SelectionController` / `BrowserSelectionController` /
 *     `CanvasSelectionController` — mutate the three selection-indicator nodes.
 *   - `QueuedMessageController` — builds `.specorator-queue-indicator-*` DOM into
 *     the queue row it holds by handle.
 *   - `updateContextRowHasContent` — reads chip `.specorator-visible-flex` off the
 *     context row and toggles `.has-content`.
 *   - `tabInputWiring` / `InputController` — own the `textarea.specorator-input`.
 *
 * So the Vue composer MUST keep emitting the exact legacy `.specorator-*` classes
 * and registering every element handle to `tab.dom.*` (+ `ChatState` for the queue
 * row). This mounts the REAL `mountTabComposer` island over a tab whose real
 * `TabComposerProjection` emits a RICH snapshot (all nine toolbar widgets, a
 * current-note pill + file/folder chips, an image, an edited file, and
 * `wrapperMode { planMode, instructionMode }`), then asserts every consumer-read
 * class, every element handle, and the three engine-driven-host drives (queue row,
 * selection indicators, chip visible-flex + `has-content`). Interactive parity
 * (chip removal clearing state, opening files, MCP toggles, the edited-files
 * popover) is covered by the per-component tests (Tasks 9/12/13); this suite locks
 * only the cross-surface DOM contract. If a component stops emitting one of these,
 * this fails LOUDLY.
 */

// The projection derives its toolbar + wrapper-mode slices from these engine
// helpers; fully stub them so the real projection emits a deterministic RICH
// snapshot with no provider registry wiring. Toolbar richness is driven here (a
// two-option mode, a budget reasoning control, a service tier, MCP servers, a
// permission toggle, plan mode) + `tab.state.usage`. `getTabPermissionMode` ->
// 'plan' + `supportsPlanMode` gives the plan wrapper class; the tab's
// instruction-mode manager gives the instruction wrapper class.
vi.mock('@/features/chat/tabs/tabShared', () => {
  const uiConfig = {
    getModelOptions: () => [
      { value: 'm1', label: 'Model One', group: 'Anthropic' },
      { value: 'm2', label: 'Model Two' },
    ],
    getModeSelector: () => ({
      label: 'Ask', value: 'mode', activeValue: 'agent',
      options: [{ value: 'ask', label: 'Ask' }, { value: 'agent', label: 'Agent' }],
    }),
    getReasoningOptions: () => [{ value: 'off', label: 'Off' }, { value: 'high', label: 'High' }],
    getDefaultReasoningValue: () => 'off',
    isAdaptiveReasoningModel: () => false,
    getServiceTierToggle: () => ({ activeValue: 'priority', inactiveValue: 'standard' }),
    getPermissionModeToggle: () => ({
      activeValue: 'acceptEdits', inactiveValue: 'normal',
      activeLabel: 'Auto', inactiveLabel: 'Manual', planValue: 'plan', planLabel: 'PLAN',
    }),
  };
  return {
    getTabPermissionMode: () => 'plan',
    getTabCapabilities: () => ({ providerId: 'claude', reasoningControl: 'token-budget', supportsPlanMode: true, supportsMcpTools: true }),
    getTabChatUIConfig: () => uiConfig,
    getTabSettingsSnapshot: () => ({ model: 'm1', thinkingBudget: 'high', effortLevel: 'high', serviceTier: 'priority', permissionMode: 'plan' }),
    getProviderMcpManager: () => ({ getServers: () => [{ name: 'srv', enabled: true, contextSaving: false }] }),
  };
});

/** A tab whose real projection emits a rich snapshot: all nine toolbar widgets
 *  visible, a current-note pill + file + folder chip, an image, an edited file,
 *  and `wrapperMode { planMode, instructionMode }`. */
function makeRichTab(): TabData {
  const tab = makeTab() as unknown as {
    lifecycleState: string;
    state: Record<string, unknown>;
    ui: Record<string, unknown>;
  };
  tab.lifecycleState = 'active';
  tab.state.usage = { contextTokens: 900, contextWindow: 1000, percentage: 90 };
  tab.state.editedFiles = [
    { path: 'src/app/foo.ts', changeKind: 'created' },
    { path: 'notes/bar.md', changeKind: 'edited' },
  ];
  tab.ui.instructionModeManager = { isActive: () => true };
  tab.ui.bangBashModeManager = { isActive: () => false };
  tab.ui.fileContextManager = {
    getCurrentNotePath: () => 'notes/current.md',
    getAttachedFiles: () => new Set(['notes/current.md', 'notes/other.md']),
    getAttachedFolders: () => new Set(['docs/design']),
  };
  tab.ui.imageContextManager = {
    getAttachedImages: () => [
      { id: 'img-1', name: 'shot.png', mediaType: 'image/png', data: 'AAAA', size: 2048, source: 'paste' },
    ],
  };
  tab.ui.mcpServerSelector = { getEnabledServers: () => new Set(['srv']) };
  return tab as unknown as TabData;
}

/** Asserts every selector resolves to at least one node, naming every miss. */
function expectAllPresent(root: HTMLElement, selectors: string[]): void {
  const missing = selectors.filter((s) => root.querySelector(s) === null);
  expect(missing, `missing composer DOM-contract selectors: ${missing.join(', ')}`).toEqual([]);
}

describe('composer DOM contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits every consumer-critical class + registers every element handle', async () => {
    const tab = makeRichTab();
    mountTabComposer(tab, makePlugin(), new Component());
    await flushPromises();
    const container = tab.dom.composerHostEl;

    expectAllPresent(container, [
      // Structural (ChatDropController / InlinePromptController / resolveNavRowEl / tabInputWiring).
      '.specorator-input-container',
      '.specorator-input-nav-row',
      '.specorator-input-wrapper',
      '.specorator-context-row',
      '.specorator-input-queue-row',
      '.specorator-input-toolbar',
      'textarea.specorator-input',
      // Toolbar widgets (all nine visible for the rich projection).
      '.specorator-model-selector', '.specorator-mode-selector', '.specorator-thinking-selector',
      '.specorator-service-tier-toggle', '.specorator-permission-toggle', '.specorator-plan-mode-toggle',
      '.specorator-mcp-selector', '.specorator-external-context-selector', '.specorator-context-meter',
      // Chips + indicators + edited files (rich projection includes a current note).
      '.specorator-file-indicator', '.specorator-file-chip', '.specorator-file-chip--current',
      '.specorator-image-preview', '.specorator-image-chip',
      '.specorator-selection-indicator', '.specorator-browser-selection-indicator', '.specorator-canvas-indicator',
      '.specorator-edited-files-row', '.specorator-edited-files-badge',
    ]);

    // Element-handle registration to tab.dom.* (+ ChatState for the queue row).
    expect(tab.dom.inputContainerEl).toBe(container.querySelector('.specorator-input-container'));
    expect(tab.dom.navRowEl).toBe(container.querySelector('.specorator-input-nav-row'));
    expect(tab.dom.inputWrapper).toBe(container.querySelector('.specorator-input-wrapper'));
    expect(tab.dom.contextRowEl).toBe(container.querySelector('.specorator-context-row'));
    expect(tab.dom.inputEl).toBe(container.querySelector('textarea.specorator-input'));
    const queueRow = container.querySelector('.specorator-input-queue-row');
    expect(tab.dom.queueIndicatorEl).toBe(queueRow);
    expect(tab.state.queueIndicatorEl).toBe(queueRow);
    expect(tab.dom.selectionIndicatorEl).toBe(container.querySelector('.specorator-selection-indicator'));
    expect(tab.dom.browserIndicatorEl).toBe(container.querySelector('.specorator-browser-selection-indicator'));
    expect(tab.dom.canvasIndicatorEl).toBe(container.querySelector('.specorator-canvas-indicator'));

    tab.mountedComposer!.unmount();
  });

  it('QueuedMessageController drives the Vue-rendered queue row', async () => {
    const tab = makeTab();
    mountTabComposer(tab, makePlugin(), new Component());
    await flushPromises();

    tab.state.queuedMessage = { content: 'follow up' } as never;
    // updateQueueIndicator reads only `state` (+ getAgentService/getActiveCapabilities
    // for the steer-button gate, which short-circuits at !isStreaming). The rest of
    // the deps contract is unused here.
    const controller = new QueuedMessageController({
      state: tab.state,
      getAgentService: () => null,
      getActiveCapabilities: () => ({}),
    } as unknown as ConstructorParameters<typeof QueuedMessageController>[0]);
    controller.updateQueueIndicator();

    const row = tab.dom.queueIndicatorEl;
    expect(row.querySelector('.specorator-queue-indicator-text')).not.toBeNull();
    expect(row.classList.contains('specorator-visible-flex')).toBe(true);

    tab.mountedComposer!.unmount();
  });

  it('a selection controller can still mutate its Vue-hosted indicator', async () => {
    const tab = makeTab();
    mountTabComposer(tab, makePlugin(), new Component());
    await flushPromises();

    const indicator = tab.dom.selectionIndicatorEl!;
    // Mirror SelectionController.updateIndicator: set text + remove hidden. The host
    // never re-renders (leave-me-alone), so the mutation persists.
    indicator.textContent = '3 line(s) selected';
    indicator.removeClass('specorator-hidden');
    expect(indicator.textContent).toBe('3 line(s) selected');
    expect(indicator.classList.contains('specorator-hidden')).toBe(false);

    tab.mountedComposer!.unmount();
  });

  it('populated chips carry .specorator-visible-flex and updateContextRowHasContent sets .has-content', async () => {
    const tab = makeRichTab();
    mountTabComposer(tab, makePlugin(), new Component());
    await flushPromises();

    expect(tab.dom.contextRowEl.querySelector('.specorator-file-indicator')!.classList.contains('specorator-visible-flex')).toBe(true);
    expect(tab.dom.contextRowEl.querySelector('.specorator-image-preview')!.classList.contains('specorator-visible-flex')).toBe(true);
    // Called AFTER flushPromises so the Vue chip classes are applied first (the
    // #128-fixed ordering: the consumer reads the painted classes, not empty ones).
    updateContextRowHasContent(tab.dom.contextRowEl);
    expect(tab.dom.contextRowEl.classList.contains('has-content')).toBe(true);

    tab.mountedComposer!.unmount();
  });

  it('wrapper-mode classes are Vue-owned and survive an engine re-projection', async () => {
    // Projection reports wrapperMode { planMode:true, instructionMode:true,
    // bangBashMode:false }. A later emit (any engine change) re-patches the island;
    // the classes MUST persist — Vue owns them, no imperative classList.toggle
    // remains (Task 4/5b). This is the round-5 regression guard.
    const tab = makeRichTab();
    mountTabComposer(tab, makePlugin(), new Component());
    await flushPromises();

    const wrapper = tab.dom.inputWrapper;
    expect(wrapper.classList.contains('specorator-input-plan-mode')).toBe(true);
    expect(wrapper.classList.contains('specorator-input-instruction-mode')).toBe(true);

    tab.composer!.emit();
    await flushPromises();
    expect(wrapper.classList.contains('specorator-input-plan-mode')).toBe(true);
    expect(wrapper.classList.contains('specorator-input-instruction-mode')).toBe(true);

    tab.mountedComposer!.unmount();
  });
});
