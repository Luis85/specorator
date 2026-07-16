import type { App, Component } from 'obsidian';
import type { InjectionKey } from 'vue';

import type SpecoratorPlugin from '../../../../../main';
import type { ComposerCallbacks } from './composerCallbacks';

export const APP_KEY: InjectionKey<App> = Symbol('specorator.composer.app');
export const COMPONENT_KEY: InjectionKey<Component> = Symbol('specorator.composer.component');
export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('specorator.composer.plugin');
export const CALLBACKS_KEY: InjectionKey<ComposerCallbacks> = Symbol('specorator.composer.callbacks');

// Element-handle keys — Vue owns the composer DOM but hands the engine live
// nodes exactly as SCROLL_HOST_KEY did in the transcript island. Each is a
// `(el) => void` provided by mountComposer that writes the raw node to
// `tab.dom.*` (and, for the queue row, ChatState). Captured SYNCHRONOUSLY in
// each host's onMounted (children mount before the parent, all during
// app.mount()), so every handle is registered before the engine wiring that
// consumes them runs.
export const INPUT_CONTAINER_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.inputContainer');
export const NAV_ROW_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.navRow');
export const INPUT_WRAPPER_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.inputWrapper');
export const CONTEXT_ROW_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.contextRow');
export const QUEUE_ROW_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.queueRow');

// Internal wrapper-host keys for the leaves the engine still populates during
// migration. Removed as each leaf becomes a Vue component:
//   EDITED_FILES_ROW_KEY — removed in Phase 3 (EditedFilesBar.vue)
//   TEXTAREA_HOST_KEY     — removed in Phase 4, replaced by INPUT_EL_KEY
// (TOOLBAR_HOST_KEY was removed in Phase 2 — ComposerToolbar.vue now renders
//  the nine toolbar widgets directly.)
export const EDITED_FILES_ROW_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.editedFilesRow');
export const TEXTAREA_HOST_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.textareaHost');
// Wired in Phase 4 when ComposerTextarea.vue renders the <textarea> itself.
export const INPUT_EL_KEY: InjectionKey<(el: HTMLTextAreaElement) => void> = Symbol('specorator.composer.inputEl');

// Selection-indicator host keys. The editor/browser/canvas indicators are
// ENGINE-DRIVEN: SelectionController / BrowserSelectionController /
// CanvasSelectionController (out of scope, untouched) mutate each indicator's
// textContent + `.specorator-hidden` directly. In Phase 3 `SelectionIndicators.vue`
// renders the three <div>s with the legacy classes + initial `.specorator-hidden`
// and hands the raw nodes back through these keys; it never reads the store.
export const SELECTION_INDICATOR_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.selectionIndicator');
export const BROWSER_INDICATOR_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.browserIndicator');
export const CANVAS_INDICATOR_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.composer.canvasIndicator');
