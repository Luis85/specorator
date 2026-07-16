import type { Pinia } from 'pinia';
import { createPinia } from 'pinia';

// A FRESH Pinia per chat leaf — NOT a shared module singleton. Each SpecoratorView
// tab owns its own composer input state; the plugin supports multiple open chat
// leaves. A shared `composer` store would let one leaf's projected toolbar/chips
// overwrite another's. Mirrors createTranscriptPinia. GC'd with the app on unmount.
export function createComposerPinia(): Pinia {
  return createPinia();
}
