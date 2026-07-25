import type { EventRef } from 'obsidian';

import type SpecoratorPlugin from '../../main';
import type { TabData } from '../chat/tabs/types';

/**
 * Registers the vault + workspace events that keep the ACTIVE DM tab's file-context
 * cache fresh — the Team Chat mirror of `SpecoratorView.wireEventHandlers`' vault wiring,
 * matched semantics-for-semantics so a DM's `@`-file / current-note context tracks vault
 * changes exactly as a sidebar chat does:
 *   - create / delete / rename → mark BOTH the file and folder cache dirty (the folder set
 *     changed too);
 *   - modify → mark only the file cache dirty (an in-place edit leaves the folder set intact);
 *   - file-open → re-run the active tab's current-note attach (`handleFileOpen`).
 *
 * The active-tab accessor is read LIVE on every fire so the wiring survives a manager
 * rebuild (re-entrant onOpen) without re-registering, and a null active tab / null
 * fileContextManager (empty roster, or a DM tab not yet initialized) is a no-op — never a
 * throw. Refs go through `registerEvent` so ItemView auto-disposes them on unload, exactly
 * as SpecoratorView does (no manual offref sweep).
 */
export function registerTeamChatDmFileEvents(
  plugin: SpecoratorPlugin,
  getActiveTab: () => TabData | null,
  registerEvent: (ref: EventRef) => void,
): void {
  const markCacheDirty = (includesFolders: boolean): void => {
    const mgr = getActiveTab()?.ui.fileContextManager;
    if (!mgr) return;
    mgr.markFileCacheDirty();
    if (includesFolders) mgr.markFolderCacheDirty();
  };
  registerEvent(plugin.app.vault.on('create', () => markCacheDirty(true)));
  registerEvent(plugin.app.vault.on('delete', () => markCacheDirty(true)));
  registerEvent(plugin.app.vault.on('rename', () => markCacheDirty(true)));
  registerEvent(plugin.app.vault.on('modify', () => markCacheDirty(false)));
  registerEvent(
    plugin.app.workspace.on('file-open', (file) => {
      if (file) getActiveTab()?.ui.fileContextManager?.handleFileOpen(file);
    }),
  );
}
