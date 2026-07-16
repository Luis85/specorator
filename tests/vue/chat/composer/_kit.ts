import { App } from 'obsidian';
import { vi } from 'vitest';

import type { TabData } from '@/features/chat/tabs/types';
import type SpecoratorPlugin from '@/main';

/**
 * Shared composer-mount test kit. The tab stub carries what BOTH
 * `mountTabComposer` (element-handle registration + projection) AND
 * `wireTabInputEvents` (keydown → send routing) read:
 *   - a real `inputController.sendMessage` spy,
 *   - a `state` with `isStreaming` (+ the queue-row slot),
 *   - the `instructionModeManager` / `bangBashModeManager` /
 *     `slashCommandDropdown` / `fileContextManager` UI hooks as `null`, so the
 *     keydown handler falls through to the send short-circuit.
 * The textarea is NOT pre-created here — ComposerTextarea.vue renders it and
 * `registerInputEl` overwrites `tab.dom.inputEl` with the raw Vue node on mount.
 */
export function makeTab(): TabData {
  const doc = document;
  const contentEl = doc.createElement('div');
  doc.body.appendChild(contentEl);
  const composerHostEl = contentEl.appendChild(doc.createElement('div'));
  const messagesEl = contentEl.appendChild(doc.createElement('div'));
  // Bare placeholder mirroring buildTabDOM; the mount repoints it to the Vue node.
  const inputEl = doc.createElement('textarea');
  return {
    dom: {
      contentEl, messagesEl, composerHostEl,
      inputContainerEl: composerHostEl, queueIndicatorEl: composerHostEl,
      inputWrapper: composerHostEl, inputEl, navRowEl: composerHostEl,
      contextRowEl: composerHostEl,
      selectionIndicatorEl: null, browserIndicatorEl: null, canvasIndicatorEl: null,
      eventCleanups: [],
    },
    state: { isStreaming: false, queueIndicatorEl: null },
    ui: {
      instructionModeManager: null, bangBashModeManager: null,
      slashCommandDropdown: null, fileContextManager: null,
    },
    // `handleResumeKeydown` / `cancelStreaming` are stubbed because
    // `wireTabInputEvents` calls them on the (present) inputController before the
    // send-enter-key check; only `sendMessage` is asserted.
    controllers: {
      inputController: {
        sendMessage: vi.fn(),
        handleResumeKeydown: vi.fn(() => false),
        cancelStreaming: vi.fn(),
      },
    },
    composer: null,
    mountedComposer: null,
  } as unknown as TabData;
}

export function makePlugin(): SpecoratorPlugin {
  return { app: new App(), settings: {}, getActiveEnvironmentVariables: () => '' } as unknown as SpecoratorPlugin;
}
