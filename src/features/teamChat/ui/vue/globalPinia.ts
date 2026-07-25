import type { Pinia } from 'pinia';
import { createPinia } from 'pinia';

// A FRESH Pinia per Team Chat leaf — NOT a shared module singleton. Mirrors
// chat's createChatShellPinia, deliberately NOT Library's getLibraryPinia: each
// TeamChatView owns its own TabManager and DM tab set, and the plugin enumerates
// multiple Team Chat leaves (getAllViews / findConversationAcrossViews). A shared
// store would let one leaf's projected snapshot overwrite another's — the
// inactive pane would render a sibling's roster/DM state while dispatching clicks
// to its own callbacks. Each view's Vue app installs its own instance, isolating
// the store; it is GC'd with the app on unmount.
export function createTeamChatPinia(): Pinia {
  return createPinia();
}
