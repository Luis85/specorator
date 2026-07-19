import { type EventRef, normalizePath, type TAbstractFile } from 'obsidian';
import { onMounted, onUnmounted } from 'vue';

import type SpecoratorPlugin from '../../../main';

const REFRESH_DEBOUNCE_MS = 300;

/**
 * Keeps the Marketplace "Installed" badges in sync with mutations that happen
 * OUTSIDE the marketplace — an item deleted or renamed from the Library, an agent
 * removed from the roster. Installed-state spans four channels: agents fire
 * `roster:changed` on the event bus; loops / templates / quick-actions surface as
 * Obsidian vault create/delete/rename events under their folders (a
 * dot-folder-free, existence-only signal — `modify` is irrelevant to whether an
 * item exists); a `settings-changed` event covers a change to the configured
 * install FOLDERS (which moves where an item lives — and so which items count as
 * installed — with no accompanying vault event); and **skills** fire
 * `vaultSkill.changed` on the event bus. Skills need the bus, NOT vault events,
 * because their roots (`.claude/skills`, `.codex/skills`, `.cursor/skills`) are
 * dot-folders Obsidian excludes from its vault index — no create/delete/rename
 * fires for a `SKILL.md`, so the Library skill store and provider catalogs emit
 * `vaultSkill.changed` on save/delete instead (same channel `VaultSkillAggregator`
 * invalidates on). User-scope skills live outside the vault entirely (no watcher)
 * — those stay TTL/reopen-refreshed, as elsewhere. All feed one debounced
 * `refresh` (the store's network-free, generation-guarded `refreshInstalled`).
 *
 * Owns its own onMounted/onUnmounted — call once from a component's setup. The
 * Marketplace store is shared across leaves, so every open leaf subscribes
 * independently and each fires the same idempotent refresh; per-leaf teardown
 * (disposer + offref + timer clear) is what keeps that leak-free.
 */
export function useMarketplaceInstalledRefresh(
  plugin: SpecoratorPlugin,
  refresh: () => void,
): void {
  const vaultRefs: EventRef[] = [];
  let rosterOff: (() => void) | null = null;
  let settingsOff: (() => void) | null = null;
  let vaultSkillOff: (() => void) | null = null;
  let timer: number | null = null;

  // Live folder resolution (re-read per event) so a settings change to any watched
  // folder takes effect without a remount. Mirrors the store's installDeps defaults.
  function installFolders(): string[] {
    const s = plugin.settings;
    return [
      s.agentBoardLoopFolder || 'Agent Board/loops',
      s.agentBoardTemplateFolder || 'Agent Board/templates',
      s.quickActionsFolder || 'Quick Actions',
    ].map((folder) => normalizePath(folder));
  }

  function isUnderInstallFolder(path: string): boolean {
    if (!path) return false;
    return installFolders().some((folder) => path === folder || path.startsWith(`${folder}/`));
  }

  function schedule(): void {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      refresh();
    }, REFRESH_DEBOUNCE_MS);
  }

  function onVaultChange(file: TAbstractFile, oldPath?: string): void {
    const path = (file as { path?: string })?.path ?? '';
    const old = typeof oldPath === 'string' ? oldPath : '';
    // A rename OUT of a watched folder must still refresh, so check oldPath too.
    if (!isUnderInstallFolder(path) && !(old && isUnderInstallFolder(old))) return;
    schedule();
  }

  onMounted(() => {
    rosterOff = plugin.events.on('roster:changed', schedule);
    // A change to a watched install folder moves items without any vault event,
    // so recompute badges on settings-changed too (debounced, guarded, no I/O).
    settingsOff = plugin.events.on('settings-changed', schedule);
    // Skill roots are dot-folders (no vault events), so a Library skill
    // save/delete reaches us via the event bus, not onVaultChange.
    vaultSkillOff = plugin.events.on('vaultSkill.changed', schedule);
    vaultRefs.push(plugin.app.vault.on('create', onVaultChange));
    vaultRefs.push(plugin.app.vault.on('delete', onVaultChange));
    vaultRefs.push(plugin.app.vault.on('rename', onVaultChange));
  });

  onUnmounted(() => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    rosterOff?.();
    rosterOff = null;
    settingsOff?.();
    settingsOff = null;
    vaultSkillOff?.();
    vaultSkillOff = null;
    for (const ref of vaultRefs) plugin.app.vault.offref(ref);
    vaultRefs.length = 0;
  });
}
