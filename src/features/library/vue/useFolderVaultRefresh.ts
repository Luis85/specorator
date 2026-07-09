import type { EventRef, TAbstractFile, Vault } from 'obsidian';
import { onMounted, onUnmounted } from 'vue';

const VAULT_RELOAD_DEBOUNCE_MS = 300;

export interface FolderVaultRefreshOptions {
  vault: Vault;
  /** Live folder resolution — re-read on every event so a settings change to
   *  the watched folder takes effect without a remount. Return '' to watch
   *  nothing (an unset folder). */
  resolveFolder: () => string;
  /** Reload the panel's store. Must not throw — the Library stores capture
   *  failures into `store.error`. */
  reload: () => void;
}

/**
 * Folder-scoped vault-event refresh for a Library panel whose rows live in a
 * REGULAR vault folder (quick actions, loops — unlike the dot-folder skills
 * Obsidian never indexes). External writers (an edit outside the app, a note
 * dropped in the folder, another leaf's modal) persist without touching the
 * mounted store, so a tab would show stale rows until remount. Subscribe to
 * create/modify/delete/rename, filter to the resolved folder, coalesce bursts
 * (multi-file sync, folder renames) into one debounced reload, and offref all
 * refs on unmount. Owns its own `onMounted`/`onUnmounted` — call it once from
 * a panel's `setup`.
 */
export function useFolderVaultRefresh(options: FolderVaultRefreshOptions): void {
  const vaultRefs: EventRef[] = [];
  let reloadTimer: number | null = null;

  function isUnderFolder(path: string): boolean {
    const folder = options.resolveFolder();
    if (!folder) return false;
    return path === folder || path.startsWith(`${folder}/`);
  }

  function onVaultChange(file: TAbstractFile, oldPath?: string): void {
    const path = (file as { path?: string })?.path ?? '';
    const old = typeof oldPath === 'string' ? oldPath : '';
    if (!isUnderFolder(path) && !(old && isUnderFolder(old))) return;
    if (reloadTimer !== null) window.clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(() => {
      reloadTimer = null;
      options.reload();
    }, VAULT_RELOAD_DEBOUNCE_MS);
  }

  onMounted(() => {
    vaultRefs.push(options.vault.on('create', onVaultChange));
    vaultRefs.push(options.vault.on('modify', onVaultChange));
    vaultRefs.push(options.vault.on('delete', onVaultChange));
    vaultRefs.push(options.vault.on('rename', onVaultChange));
  });

  onUnmounted(() => {
    if (reloadTimer !== null) {
      window.clearTimeout(reloadTimer);
      reloadTimer = null;
    }
    for (const ref of vaultRefs) options.vault.offref(ref);
    vaultRefs.length = 0;
  });
}
