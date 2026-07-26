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
 * throw. Refs go through `registerEvent` so ItemView auto-disposes them on unload.
 *
 * Returns a disposer that `offref`s exactly the refs it registered (Round-64 Fix A). Unlike the
 * neighbouring presence/roster/hydration subscriptions, `registerEvent` alone only frees them on
 * ItemView UNLOAD, so a re-entrant onOpen (popout / leaf-move with no interleaved onClose) would
 * register another 5 listeners while the prior 5 stayed live. The view calls the disposer before
 * re-registering (and on onClose), so a rebuild nets +0 listeners instead of leaking a batch.
 */
export function registerTeamChatDmFileEvents(
  plugin: SpecoratorPlugin,
  getActiveTab: () => TabData | null,
  registerEvent: (ref: EventRef) => void,
): () => void {
  const markCacheDirty = (includesFolders: boolean): void => {
    const mgr = getActiveTab()?.ui.fileContextManager;
    if (!mgr) return;
    mgr.markFileCacheDirty();
    if (includesFolders) mgr.markFolderCacheDirty();
  };
  const { vault, workspace } = plugin.app;
  // Track each ref with the emitter that can release it, so the disposer offrefs on the SAME
  // emitter (vault refs → vault.offref, the file-open ref → workspace.offref).
  const tracked: Array<{ emitter: { offref(ref: EventRef): void }; ref: EventRef }> = [];
  const track = (emitter: { offref(ref: EventRef): void }, ref: EventRef): void => {
    registerEvent(ref);
    tracked.push({ emitter, ref });
  };
  track(vault, vault.on('create', () => markCacheDirty(true)));
  track(vault, vault.on('delete', () => markCacheDirty(true)));
  track(vault, vault.on('rename', () => markCacheDirty(true)));
  track(vault, vault.on('modify', () => markCacheDirty(false)));
  track(
    workspace,
    workspace.on('file-open', (file) => {
      if (file) getActiveTab()?.ui.fileContextManager?.handleFileOpen(file);
    }),
  );
  return () => {
    for (const { emitter, ref } of tracked) emitter.offref(ref);
    tracked.length = 0;
  };
}
