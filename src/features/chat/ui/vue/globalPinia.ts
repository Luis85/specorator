import type { Pinia } from 'pinia';
import { createPinia } from 'pinia';

// A FRESH Pinia per chat leaf — NOT a shared module singleton. Unlike the Agent
// Board (whose store is vault-global, so all board leaves deliberately share one
// Pinia via getAgentBoardPinia), each SpecoratorView owns its own TabManager and
// its own set of tabs, and the plugin supports multiple open chat leaves
// (getAllViews / findConversationAcrossViews). A shared `chat-shell` store would
// let one view's projected snapshot overwrite another's — the inactive pane would
// render a sibling's tab ids while dispatching clicks to its own callbacks. Each
// view's Vue app installs its own instance, isolating the store; it is GC'd with
// the app on unmount.
export function createChatShellPinia(): Pinia {
  return createPinia();
}
