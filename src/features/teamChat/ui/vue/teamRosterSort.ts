import type { LibrarySort } from '../../../../shared/libraryToolbar';
import type { TeamChatThreadMeta } from '../../teamChatThreadMeta';

/**
 * The rail's sort union. `name` / `updated` pass straight through to `useLibraryList`
 * (shared semantics with the Library); `recent` is Team-Chat-only — DM activity order,
 * which is how every DM list sorts and which the Library has no concept of.
 *
 * Kept as a local widening rather than extending the shared `LibrarySort`: that type is
 * consumed by the Library's own toolbars and stores, and teaching all of them about a
 * mode only Team Chat can compute would be a change to a shared contract for one caller.
 */
export type TeamRosterSort = LibrarySort | 'recent';

/** What `useLibraryList` is given. `recent` has no library equivalent, so the list engine
 *  sorts by name underneath and `applyRecentSort` re-orders on top — which also makes name
 *  the natural tiebreaker for threadless agents. */
export function toLibrarySort(sort: TeamRosterSort): LibrarySort {
  return sort === 'recent' ? 'name' : sort;
}

/**
 * Re-orders already-filtered rows by most-recent DM activity, newest first.
 *
 * Agents with no thread (or an empty one) sort AFTER every agent that has activity, in
 * the incoming name order — so a first-run roster with no DMs reads alphabetically,
 * exactly as it did before this sort existed, and a new agent doesn't jump to the top of
 * a list of live conversations just because it has no timestamp.
 *
 * Non-mutating and stable: `toSorted` semantics via a copy, and equal timestamps keep
 * their relative (name-ordered) positions.
 */
export function applyRecentSort<T extends { id: string }>(
  rows: readonly T[],
  threads: Record<string, TeamChatThreadMeta>,
): T[] {
  return [...rows].sort((a, b) => {
    const aAt = threads[a.id]?.updatedAt ?? 0;
    const bAt = threads[b.id]?.updatedAt ?? 0;
    if (aAt === bAt) return 0; // stable → preserves the name order underneath
    return bAt - aAt;
  });
}
