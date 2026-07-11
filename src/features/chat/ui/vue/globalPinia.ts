import type { Pinia } from 'pinia';
import { createPinia } from 'pinia';

// One Pinia for the chat leaf: the shell store is view-global for this leaf.
// Module scope is safe — the plugin bundle's module registry is discarded on
// plugin unload/reload. Mirrors src/features/tasks/ui/vue/globalPinia.ts.
let pinia: Pinia | null = null;

export function getChatShellPinia(): Pinia {
  pinia ??= createPinia();
  return pinia;
}

/** Test-only: drop the singleton so each test starts from clean store state. */
export function resetChatShellPinia(): void {
  pinia = null;
}
