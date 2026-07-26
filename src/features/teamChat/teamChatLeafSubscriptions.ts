import type { EventRef } from 'obsidian';

import type SpecoratorPlugin from '../../main';
import type { TabData } from '../chat/tabs/types';
import { registerTeamChatDmHostEvents } from './teamChatHostEvents';
import { createDmHydrationBanner, type DmHydrationBannerController } from './teamChatHydrationBanner';

/**
 * Every leaf-scoped subscription a Team Chat leaf installs, behind ONE dispose+recreate
 * lifecycle instead of five parallel unsubscribe fields.
 *
 * The consolidation is the point: each of these must be dropped before re-registering on a
 * re-entrant `onOpen` (a popout or leaf-move with no interleaved `onClose`), and five
 * independent `x?.(); x = ...` pairs is five chances to forget one and leak a listener
 * pointing at the previous mount. One handle, one `dispose()`, one place to add the next.
 */
export interface TeamChatLeafSubscriptions {
  /** Consumed by `TeamChatView.consumePendingHydrationError` while the handle is live. */
  readonly hydrationBanner: DmHydrationBannerController;
  dispose(): void;
}

export interface TeamChatLeafSubscriptionHost {
  /** Re-project the store on a cross-leaf presence broadcast. */
  onPresenceChanged(): void;
  /** Reconcile OPEN DM tabs after a roster edit (rotation + un-grey + deleted-agent notice). */
  onRosterChanged(): void;
  /** Re-read the roster's preview/timestamp source after a thread remap. */
  onThreadsChanged(): void;
  getActiveTab(): TabData | null;
  readonly containerEl: HTMLElement;
  registerEvent(ref: EventRef): void;
}

/**
 * Installs the leaf's subscriptions and returns the single disposer.
 *
 *  - `teamChat:presence` — another leaf's DM streaming must re-project THIS leaf, so `busy`
 *    shows everywhere the agent appears.
 *  - `roster:changed` — undebounced, matching SpecoratorView: the expensive part (rotation)
 *    only runs on an actual provider mismatch, so an unrelated agent edit is cheap.
 *  - `teamChat:threads-changed` — a resolve, rotation, or adoption remaps an agent's DM, and
 *    the roster projection reads that map synchronously.
 *  - the hydration banner and the DM host events (file-context freshness, mention click-away,
 *    Shift+Tab plan toggle), which own their own internal registrations.
 *
 * The caller primes the thread map itself after this returns — priming is a one-shot read,
 * not a subscription, and keeping it out here leaves this function purely about lifetimes.
 */
export function registerTeamChatLeafSubscriptions(
  plugin: SpecoratorPlugin,
  host: TeamChatLeafSubscriptionHost,
  /** The view, which `createDmHydrationBanner` needs as the owning component. */
  view: Parameters<typeof createDmHydrationBanner>[1],
): TeamChatLeafSubscriptions {
  const offPresence = plugin.events.on('teamChat:presence', () => host.onPresenceChanged());
  const offRoster = plugin.events.on('roster:changed', () => host.onRosterChanged());
  const offThreads = plugin.events.on('teamChat:threads-changed', () => host.onThreadsChanged());
  const hydrationBanner = createDmHydrationBanner(plugin, view);
  const disposeHostEvents = registerTeamChatDmHostEvents(
    plugin,
    () => host.getActiveTab(),
    host.containerEl,
    (ref) => host.registerEvent(ref),
  );

  return {
    hydrationBanner,
    dispose: () => {
      offPresence();
      offRoster();
      offThreads();
      hydrationBanner.dispose();
      disposeHostEvents();
    },
  };
}
