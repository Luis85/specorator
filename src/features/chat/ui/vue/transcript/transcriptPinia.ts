import type { Pinia } from 'pinia';
import { createPinia } from 'pinia';

// A FRESH Pinia per chat leaf — NOT a shared module singleton. Each SpecoratorView
// tab owns its own ChatState.messages; the plugin supports multiple open chat
// leaves. A shared `transcript` store would let one leaf's projected messages
// overwrite another's. Mirrors createChatShellPinia. GC'd with the app on unmount.
export function createTranscriptPinia(): Pinia {
  return createPinia();
}
