import type { Pinia } from 'pinia';
import { createPinia } from 'pinia';

// One Pinia for every Agent Board leaf: the board layout and live overlays are
// vault-global, so all leaves must observe the same store state. Module scope is
// safe — the plugin bundle's module registry is discarded on plugin unload/reload.
let pinia: Pinia | null = null;

export function getAgentBoardPinia(): Pinia {
  pinia ??= createPinia();
  return pinia;
}

/** Test-only: drop the singleton so each test starts from clean store state. */
export function resetAgentBoardPinia(): void {
  pinia = null;
}
