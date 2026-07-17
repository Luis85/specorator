import type { Pinia } from 'pinia';
import { createPinia } from 'pinia';

// A FRESH Pinia per chat leaf — never a shared singleton. Each tab owns its own
// todos + bash outputs; a shared store would let one tab overwrite another's.
// Mirrors createComposerPinia. GC'd with the app on unmount.
export function createTabChromePinia(): Pinia {
  return createPinia();
}
