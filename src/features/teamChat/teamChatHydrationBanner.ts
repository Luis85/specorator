import type SpecoratorPlugin from '../../main';
import type { HydrationFailedBannerPayload } from '../chat/hydration/hydrationFailedSubscriber';
import type { TabManager } from '../chat/tabs/TabManager';

/** Live handle the view holds: dispose on close, and delegate the tab-bound consume. */
export interface DmHydrationBannerController {
  dispose(): void;
  consumePendingHydrationError(conversationId: string): { code: string; message: string } | null;
}

/** Minimal view surface the banner reads — its own tab engine (for ownership + the
 *  live tab's transcript), plus the DM this leaf is mid-open. Declared locally so the
 *  helper never imports `TeamChatView`. */
export interface DmHydrationBannerHost {
  getTabManager(): TabManager | null;
  /** True while THIS leaf is opening `conversationId` (Round-64): scopes a pre-bind failure
   *  stash to the opening leaf, so a non-opening leaf can't consume a stale entry later. */
  isOpeningConversation(conversationId: string): boolean;
}

/**
 * The Team Chat mirror of `SpecoratorView`'s pending-hydration-error plumbing (grep
 * `renderHydrationErrorBanner` / `consumePendingHydrationError`). On
 * `conversation:hydration-failed`, surface the inline banner for the DMs THIS view owns
 * and ignore everything else — SpecoratorView owns the sidebar conversation, each view
 * surfaces its own.
 *
 * Ownership (`ownsDmConversation`) is timing-robust because the fire lands BEFORE the tab is
 * bound: `TabManager.createTab` hydrates via `getConversationById` before the tab enters the
 * manager, so a pure live-tab match would miss the fresh open. Owned iff a live DM tab in this
 * view's manager hosts it, OR it is a team-chat DM not yet hosted by any view AND THIS leaf is
 * the one opening it (`host.isOpeningConversation`). The opening-leaf scope (Round-64) is
 * load-bearing with multiple Team Chat leaves: a pre-bind failure is null for every leaf's
 * `findConversationAcrossViews`, so without it EVERY leaf stashed the same error and a
 * non-opening leaf later consumed the stale entry as a false banner. A sidebar conversation
 * (surface `chat`) or a DM already hosted by another leaf is ignored.
 *
 * Owned failures are stashed so the owning tab's `ConversationController.restoreConversation`
 * consume (wired through `component.consumePendingHydrationError`, where `component` is this
 * view) renders the banner once the tab binds; a currently-bound tab also gets an immediate
 * `setHydrationError`. No `Notice` is raised — SpecoratorView's subscriber already owns the
 * global toast, so surfacing one here would double it whenever a sidebar leaf is also open.
 */
export function createDmHydrationBanner(
  plugin: SpecoratorPlugin,
  host: DmHydrationBannerHost,
): DmHydrationBannerController {
  const pending = new Map<string, { code: string; message: string }>();
  const dispose = plugin.events.on('conversation:hydration-failed', (payload) => {
    if (!ownsDmConversation(plugin, host, payload.conversationId)) return;
    const banner: HydrationFailedBannerPayload = { code: payload.code, message: payload.message };
    pending.set(payload.conversationId, banner);
    // Immediate surface when a live DM tab already hosts it (re-hydration of an open DM); the
    // pre-bind opening fire has no tab yet and surfaces through the consume below on restore.
    host
      .getTabManager()
      ?.getAllTabs()
      .find((tab) => tab.conversationId === payload.conversationId)
      ?.transcript?.setHydrationError(banner);
  });
  return {
    dispose,
    consumePendingHydrationError(conversationId) {
      const banner = pending.get(conversationId) ?? null;
      pending.delete(conversationId);
      return banner;
    },
  };
}

function ownsDmConversation(
  plugin: SpecoratorPlugin,
  host: DmHydrationBannerHost,
  conversationId: string,
): boolean {
  const tabs = host.getTabManager()?.getAllTabs() ?? [];
  if (tabs.some((tab) => tab.conversationId === conversationId)) return true; // this view hosts it
  if (plugin.findConversationAcrossViews(conversationId)) return false; // hosted by another leaf
  // Pre-bind open into THIS leaf: a team-chat DM this leaf is actually opening (Round-64).
  return plugin.getConversationSync(conversationId)?.surface === 'team-chat' && host.isOpeningConversation(conversationId);
}
