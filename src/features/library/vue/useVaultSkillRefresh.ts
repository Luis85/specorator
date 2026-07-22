import { onMounted, onUnmounted } from 'vue';

import type SpecoratorPlugin from '../../../main';

const REFRESH_DEBOUNCE_MS = 300;

/**
 * Keeps a mounted Library Skills panel in sync with skill mutations that happen
 * OUTSIDE it — a vault-skill save/delete in another leaf, a marketplace skill
 * install, a Claude plugin toggle in settings. Skill roots (`.claude/skills`,
 * `.codex/skills`, `.cursor/skills`, `<plugin>/skills`) are dot-folders Obsidian
 * excludes from its vault index, so no `create`/`delete`/`rename` fires for a
 * `SKILL.md`; the write paths emit `vaultSkill.changed` on the event bus instead
 * (the same signal `VaultSkillAggregator` invalidates its bucket on). Without
 * this, an already-open panel — which loads once on mount — shows stale rows
 * until a manual refresh or remount.
 *
 * The aggregator's own handler invalidates the changed provider's bucket
 * synchronously when the event fires, so by the time this debounced `reload`
 * runs, `store.load()` re-fetches fresh rather than re-invalidating.
 *
 * Owns its own `onMounted`/`onUnmounted` — call once from a panel's `setup`. The
 * Library shares one Pinia across leaves, so every open panel subscribes
 * independently and each fires the same idempotent `reload`; per-leaf teardown
 * (disposer + timer clear) is what keeps that leak-free. `store.load()` is
 * request-token guarded, so a self-emitted event (the store's own clone/remove,
 * which already reloads) at worst schedules one extra guarded reload — never a
 * loop, since `load` emits nothing.
 */
export function useVaultSkillRefresh(
  plugin: SpecoratorPlugin,
  reload: () => void,
): void {
  let vaultSkillOff: (() => void) | null = null;
  let timer: number | null = null;

  function schedule(): void {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      reload();
    }, REFRESH_DEBOUNCE_MS);
  }

  onMounted(() => {
    vaultSkillOff = plugin.events.on('vaultSkill.changed', schedule);
  });

  onUnmounted(() => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    vaultSkillOff?.();
    vaultSkillOff = null;
  });
}
