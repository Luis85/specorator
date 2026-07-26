import { readonly, ref } from 'vue';

import type { ProviderId } from '@/core/providers/types';

/**
 * The one provider whose CLI install is running — process-wide, not per store.
 *
 * Module scope is the point. Setup mounts a fresh Pinia per leaf (`OnboardingView`
 * — wizard progress is deliberately per leaf), so a store-scoped lock serializes
 * installs within one leaf and not across them: duplicate the tab, restore a
 * saved layout, or drag Setup into a pop-out, and two `npm install -g` runs can
 * start against the same global prefix. The resource being protected is the
 * machine's package prefix, so the lock has to live at machine scope too.
 *
 * A `ref` rather than a plain variable because every leaf's UI reads it — one
 * module instance means one value, and Vue keeps all of them in sync with it.
 */
const activeInstall = ref<ProviderId | null>(null);

/** The provider currently installing anywhere in this plugin instance. */
export const installingProvider = readonly(activeInstall);

/**
 * Takes the lock for `providerId`, or reports that someone else holds it.
 * Not re-entrant: a second acquire for the same provider is still a second
 * install, which is exactly what must not happen.
 */
export function acquireInstallLock(providerId: ProviderId): boolean {
  if (activeInstall.value !== null) {
    return false;
  }
  activeInstall.value = providerId;
  return true;
}

/**
 * Releases the lock, but only from its holder — a late settle from a run whose
 * leaf has already closed must not free an install started after it.
 */
export function releaseInstallLock(providerId: ProviderId): void {
  if (activeInstall.value === providerId) {
    activeInstall.value = null;
  }
}

/** Test seam: module state outlives a per-test Pinia. */
export function resetInstallLock(): void {
  activeInstall.value = null;
}
