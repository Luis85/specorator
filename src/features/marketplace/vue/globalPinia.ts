import type { Pinia } from 'pinia';
import { createPinia } from 'pinia';

// One Pinia for every Marketplace leaf so all leaves share the fetched catalog
// + installed state. Module scope is safe — the bundle's module registry is
// discarded on plugin unload/reload.
let pinia: Pinia | null = null;

export function getMarketplacePinia(): Pinia {
  pinia ??= createPinia();
  return pinia;
}

/** Test-only: drop the singleton so each test starts from clean store state. */
export function resetMarketplacePinia(): void {
  pinia = null;
}
