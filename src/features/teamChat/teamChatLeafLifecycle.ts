import { type App as VueApp, createApp, markRaw } from 'vue';

import type SpecoratorPlugin from '../../main';
import type { TabManager } from '../chat/tabs/TabManager';
import type { PersistedTabManagerState } from '../chat/tabs/types';
import type { TeamChatView } from './TeamChatView';
import { createTeamChatPinia } from './ui/vue/globalPinia';
import { CALLBACKS_KEY, CONTENT_HOST_KEY, PLUGIN_KEY, VIEW_KEY } from './ui/vue/keys';
import type { TeamChatCallbacks } from './ui/vue/teamChatCallbacks';
import TeamChatRoot from './ui/vue/TeamChatRoot.vue';

/**
 * The two halves of a Team Chat leaf's mount: tearing down a prior engine on a RE-ENTRANT
 * `onOpen`, and building the Vue island. Split out of `TeamChatView` so the view's `onOpen`
 * reads as "tear down, mount, subscribe" rather than sixty lines of guard commentary.
 */

/** The pieces `prepareReentrantRemount` must reset. Each is a real hazard, not bookkeeping —
 *  see the comments in the function body. */
export interface ReentrantRemountHost {
  /** Bump the selection generation, invalidating any in-flight `selectAgent` open. */
  invalidateSelections(): void;
  /** Re-close the restore gate (`tabsRestored = false`). */
  closeRestoreGate(): void;
  /** Drop the queued restore-time roster click. */
  clearPendingSelection(): void;
  /** Cancel the armed persist debounce, if any. */
  cancelPendingPersist(): void;
  /** Stash the live DM layout for the rebuilt engine to restore. */
  stashLayout(state: PersistedTabManagerState): void;
}

/**
 * Prepares a re-entrant `onOpen` (a popout or leaf-move with no interleaved `onClose`) by
 * dropping the prior engine, then returns. No leaf persist happens here — `setViewState`
 * during `onOpen` would re-enter.
 *
 * Every step closes a specific hole:
 *  - **Invalidate selections.** This path destroys the manager directly, so without the
 *    generation bump an open still awaiting `resolveOrCreate` would pass `isSelectionStale`
 *    and `createTab` into the doomed manager.
 *  - **Re-close the restore gate.** The OLD engine left it open, but the NEW manager's
 *    `restoreState` runs async — otherwise a roster click in the rebuild window creates tabs
 *    concurrently with the new restore.
 *  - **Clear the pending selection**, so the prior mount's queued click can't drain after the
 *    remount.
 *  - **Cancel the persist debounce**, whose callback calls the very `setViewState` this path
 *    avoids and would race the newly mounting manager. This path never reaches
 *    `destroyTabRuntime`, which would otherwise have cleared it.
 *  - **Stash the LIVE layout.** The initial `setState` layout was consumed by the first
 *    `initTabEngine`, so without this the rebuilt engine restores nothing and the pane goes
 *    blank.
 */
export async function prepareReentrantRemount(
  manager: TabManager,
  host: ReentrantRemountHost,
): Promise<void> {
  host.invalidateSelections();
  host.closeRestoreGate();
  host.clearPendingSelection();
  host.cancelPendingPersist();
  host.stashLayout(manager.getPersistedState());
  await manager.destroy();
}

/**
 * Mounts the Team Chat Vue island into the leaf's content element and returns the app.
 *
 * `markRaw` on the Obsidian objects: they are large and cyclic, so they must never be
 * deep-proxied (the same rule every other island mount follows). The content host is
 * captured through `CONTENT_HOST_KEY` and handed back synchronously during mount, which is
 * what lets the caller build the tab engine only once the host element exists.
 */
export function mountTeamChatIsland(
  contentEl: HTMLElement,
  plugin: SpecoratorPlugin,
  view: TeamChatView,
  callbacks: TeamChatCallbacks,
  onContentHost: (hostEl: HTMLElement) => void,
): VueApp {
  contentEl.empty();
  // Two calls, not one: Obsidian's addClass is variadic but the shared test-lane polyfill
  // is single-arg.
  contentEl.addClass('specorator-vue');
  contentEl.addClass('specorator-team-chat-vue-root');

  const app = createApp(TeamChatRoot);
  app.use(createTeamChatPinia()); // fresh per-leaf Pinia — see createTeamChatPinia
  app.provide(PLUGIN_KEY, markRaw(plugin));
  app.provide(VIEW_KEY, markRaw(view));
  app.provide(CALLBACKS_KEY, markRaw(callbacks));
  app.provide(CONTENT_HOST_KEY, onContentHost);
  app.mount(contentEl);
  return app;
}
