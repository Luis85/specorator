import type { EventRef } from 'obsidian';

import type SpecoratorPlugin from '../../main';
import { toggleTabPlanMode } from '../chat/tabs/tabShared';
import type { TabData } from '../chat/tabs/types';

/**
 * Registers the Team Chat DM leaf's HOST-level events against the ACTIVE DM tab — the
 * view-level wiring the reused sidebar composer expects but a Team Chat leaf must install
 * for itself. Three groups, one disposer (Round-65):
 *
 *  1. File-context cache freshness (folded Round-62/64) — the vault/workspace events that
 *     keep the active DM's `@`-file / current-note context tracking vault changes exactly
 *     as a sidebar chat does: create/delete/rename dirty BOTH the file and folder cache,
 *     modify dirties only the file cache, and file-open re-runs the current-note attach.
 *  2. Mention click-away (Fix #1) — a document click outside the mention dropdown AND the
 *     composer input hides the dropdown, mirroring `SpecoratorView.wireEventHandlers`; the
 *     reused composer had no counterpart, so `@` suggestions lingered on a transcript /
 *     top-bar / roster click.
 *  3. Shift+Tab plan-mode toggle (Fix #3) — a container keydown of Shift+Tab toggles plan
 *     mode for the active DM via the shared `toggleTabPlanMode` (the same helper the sidebar
 *     view-level handler uses), honoring SpecoratorView's guards (Shift+Tab, not composing).
 *
 * The active-tab accessor is read LIVE on every fire so the wiring survives a manager rebuild
 * (re-entrant onOpen) without re-registering; a null active tab / null fileContextManager
 * (empty roster, or a DM tab not yet initialized) is a no-op, never a throw. The DOM listeners
 * are scoped to the leaf's OWN document (`containerEl.ownerDocument`) so a popout leaf's clicks
 * are handled — matching the sidebar.
 *
 * Returns a SINGLE disposer that `offref`s the vault/workspace refs AND removes both DOM
 * listeners. `registerEvent` alone only frees the refs on ItemView UNLOAD, so a re-entrant
 * onOpen (popout / leaf-move with no interleaved onClose) would leak the prior listeners; the
 * view disposes the prior batch before re-registering (and on onClose), so a rebuild nets +0
 * listeners (mirrors the presence/roster/hydration dispose-and-recreate).
 */
export function registerTeamChatDmHostEvents(
  plugin: SpecoratorPlugin,
  getActiveTab: () => TabData | null,
  containerEl: HTMLElement,
  registerEvent: (ref: EventRef) => void,
): () => void {
  const disposers: Array<() => void> = [];

  // --- 1. File-context cache freshness (vault/workspace EventRefs) ---
  const markCacheDirty = (includesFolders: boolean): void => {
    const mgr = getActiveTab()?.ui.fileContextManager;
    if (!mgr) return;
    mgr.markFileCacheDirty();
    if (includesFolders) mgr.markFolderCacheDirty();
  };
  const { vault, workspace } = plugin.app;
  const trackRef = (emitter: { offref(ref: EventRef): void }, ref: EventRef): void => {
    registerEvent(ref); // ItemView unload backstop
    disposers.push(() => emitter.offref(ref)); // re-entrant-onOpen release
  };
  trackRef(vault, vault.on('create', () => markCacheDirty(true)));
  trackRef(vault, vault.on('delete', () => markCacheDirty(true)));
  trackRef(vault, vault.on('rename', () => markCacheDirty(true)));
  trackRef(vault, vault.on('modify', () => markCacheDirty(false)));
  trackRef(
    workspace,
    workspace.on('file-open', (file) => {
      if (file) getActiveTab()?.ui.fileContextManager?.handleFileOpen(file);
    }),
  );

  // --- 2 + 3. DOM listeners on the leaf's own document / container ---
  const trackDom = (target: EventTarget, type: string, handler: EventListener): void => {
    target.addEventListener(type, handler);
    disposers.push(() => target.removeEventListener(type, handler));
  };

  // Fix #1: click outside the dropdown AND the input hides the mention dropdown.
  trackDom(containerEl.ownerDocument, 'click', (e) => {
    const activeTab = getActiveTab();
    if (!activeTab) return;
    const fcm = activeTab.ui.fileContextManager;
    if (fcm && !fcm.containsElement(e.target as Node) && e.target !== activeTab.dom.inputEl) {
      fcm.hideMentionDropdown();
    }
  });

  // Fix #3: view-level Shift+Tab toggles plan mode for the active DM (works from any
  // focused element in the leaf). Guards match SpecoratorView: Shift+Tab, not composing;
  // once consumed it preventDefaults even when there is no tab / no plan support.
  trackDom(containerEl, 'keydown', (e) => {
    const evt = e as KeyboardEvent;
    if (evt.key !== 'Tab' || !evt.shiftKey || evt.isComposing) return;
    evt.preventDefault();
    const activeTab = getActiveTab();
    if (activeTab) toggleTabPlanMode(activeTab, plugin);
  });

  return () => {
    for (const dispose of disposers) dispose();
    disposers.length = 0;
  };
}
