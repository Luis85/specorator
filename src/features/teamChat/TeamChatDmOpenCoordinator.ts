import type SpecoratorPlugin from '../../main';

/**
 * Serializes Team Chat DM opens plugin-wide, keyed by `conversationId`, so two
 * overlapping selects that resolve to the SAME conversation collapse into ONE
 * open instead of each observing `findConversationAcrossViews == null` (neither
 * tab created yet) and each `createTab` → two controllers on one DM (concurrent
 * streams/saves corrupt it).
 *
 * `TeamChatThreadStore.resolveOrCreate` already serializes the roomKey→id
 * MAPPING, but not the tab OPEN that follows: two callers can resolve the same
 * id, both see no tab, and both create. This coordinator closes that window —
 * the queued second caller re-runs its open body AFTER the first finishes, now
 * finds the tab, and switches. One instance per plugin (spanning every Team Chat
 * leaf) via `getTeamChatDmOpenCoordinator`.
 */
class TeamChatDmOpenCoordinator {
  private readonly openTails = new Map<string, Promise<unknown>>();

  /**
   * Runs `open` with at most one in-flight open per `conversationId` across all
   * leaves. Chains on the prior open for the same id (swallowing its rejection so
   * one failed open can't wedge the id's queue), then evicts the map entry once
   * it is the last op — mirroring `saveCursorSessionModelState`'s serialize-and-
   * evict idiom so the map can't grow one stuck entry per DM ever opened.
   */
  async serialize<T>(conversationId: string, open: () => Promise<T>): Promise<T> {
    const previous = this.openTails.get(conversationId) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(open);
    this.openTails.set(conversationId, result);
    try {
      return await result;
    } finally {
      if (this.openTails.get(conversationId) === result) {
        this.openTails.delete(conversationId);
      }
    }
  }
}

const coordinators = new WeakMap<SpecoratorPlugin, TeamChatDmOpenCoordinator>();

/**
 * The single Team Chat DM open coordinator for this plugin instance, lazily
 * created and shared by every Team Chat leaf so their opens serialize against
 * one another. Homed in a module-level `WeakMap` (mirroring
 * `cursorSessionModelStore`'s per-adapter write tails) rather than a plugin
 * field, so the plugin-wide serialization spans views WITHOUT growing `main.ts`
 * (a shrink-only LOC hotspot sitting at its ceiling). Reset-on-reload is free: a
 * reloaded plugin is a fresh instance with no map entry, and the prior one is
 * garbage-collected.
 */
export function getTeamChatDmOpenCoordinator(
  plugin: SpecoratorPlugin,
): TeamChatDmOpenCoordinator {
  let coordinator = coordinators.get(plugin);
  if (!coordinator) {
    coordinator = new TeamChatDmOpenCoordinator();
    coordinators.set(plugin, coordinator);
  }
  return coordinator;
}
