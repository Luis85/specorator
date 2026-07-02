import type { Pinia } from 'pinia';
import { createPinia } from 'pinia';

// One Pinia for every Library leaf: roster/skills/loops are vault-global, so
// all leaves must observe the same store state. Module scope is safe — the
// plugin bundle's module registry is discarded on plugin unload/reload.
let pinia: Pinia | null = null;

export function getLibraryPinia(): Pinia {
  pinia ??= createPinia();
  return pinia;
}

/** Test-only: drop the singleton so each test starts from clean store state. */
export function resetLibraryPinia(): void {
  pinia = null;
}
