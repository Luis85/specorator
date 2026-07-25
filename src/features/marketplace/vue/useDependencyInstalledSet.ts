import { type Ref, ref, watch } from 'vue';

import type { MarketplaceItem } from '../catalogTypes';
import type { SkillInstallTarget } from './../skillInstallTargets';

/**
 * Which of a package's dependencies are already present **at the selected
 * target** — the per-member parallel of the install button's whole-package
 * check, so the "Included with this install" list can't claim a skill is
 * installed when it is only installed under a different provider.
 *
 * Resolution is async (a skill's presence is a filesystem probe), so the set is
 * a ref that fills in and re-resolves whenever the dependencies, the chosen
 * target, or the store's installed state changes. A sequence guard drops a
 * superseded pass, so switching provider twice quickly can't land the older
 * answer last.
 */
export function useDependencyInstalledSet(
  dependencies: () => MarketplaceItem[],
  target: () => SkillInstallTarget | null,
  /** Resolves one member against one target; absent until the host wires it. */
  resolver: () => ((item: MarketplaceItem, target: SkillInstallTarget) => Promise<boolean>) | undefined,
  /** Identity changes when the store recomputes installed state. */
  signal: () => unknown,
): Ref<ReadonlySet<string>> {
  const installed = ref<ReadonlySet<string>>(new Set());
  let seq = 0;

  async function refresh(): Promise<void> {
    const current = (seq += 1);
    const resolve = resolver();
    const chosen = target();
    const members = dependencies();
    if (!resolve || !chosen || members.length === 0) {
      if (current === seq) installed.value = new Set();
      return;
    }
    const results = await Promise.all(
      members.map(async (member) => [member.id, await resolve(member, chosen).catch(() => false)] as const),
    );
    if (current !== seq) return; // a newer pass already owns the answer
    installed.value = new Set(results.filter(([, present]) => present).map(([id]) => id));
  }

  watch([dependencies, target, signal], () => void refresh(), { immediate: true });
  return installed;
}
