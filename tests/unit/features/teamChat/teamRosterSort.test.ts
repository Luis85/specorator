import type { TeamChatThreadMeta } from '@/features/teamChat/teamChatThreadMeta';
import { formatRelativeActivity } from '@/features/teamChat/ui/vue/relativeTime';
import { applyRecentSort, toLibrarySort } from '@/features/teamChat/ui/vue/teamRosterSort';

const thread = (updatedAt: number): TeamChatThreadMeta => ({ conversationId: 'c', preview: '', updatedAt });

describe('toLibrarySort', () => {
  // `recent` has no library equivalent, so the list engine sorts by NAME underneath and
  // applyRecentSort re-orders on top — which is also what makes name the tiebreaker.
  it('maps recent to name so the underlying order is a stable alphabetical base', () => {
    expect(toLibrarySort('recent')).toBe('name');
  });

  it('passes the shared sorts through untouched', () => {
    expect(toLibrarySort('name')).toBe('name');
    expect(toLibrarySort('updated')).toBe('updated');
  });
});

describe('applyRecentSort', () => {
  it('orders by most-recent DM activity, newest first', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const threads = { a: thread(100), b: thread(900), c: thread(500) };

    expect(applyRecentSort(rows, threads).map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  // A brand-new agent must not jump to the top of a list of live conversations just
  // because it has no timestamp.
  it('sinks threadless agents below every agent that has activity', () => {
    const rows = [{ id: 'fresh' }, { id: 'busy' }];
    const threads = { busy: thread(100) };

    expect(applyRecentSort(rows, threads).map((r) => r.id)).toEqual(['busy', 'fresh']);
  });

  // Stability is what makes a first-run roster (no DMs at all) read alphabetically,
  // exactly as it did before this sort existed.
  it('is stable, so equal timestamps keep the name order underneath', () => {
    const rows = [{ id: 'ada' }, { id: 'bo' }, { id: 'cy' }];

    expect(applyRecentSort(rows, {}).map((r) => r.id)).toEqual(['ada', 'bo', 'cy']);
  });

  it('does not mutate the incoming rows', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];

    applyRecentSort(rows, { b: thread(900) });

    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('formatRelativeActivity', () => {
  const NOW = 1_000_000_000;

  it('buckets by minute, hour, and day', () => {
    expect(formatRelativeActivity(NOW - 30_000, NOW)).toBe('now');
    expect(formatRelativeActivity(NOW - 12 * 60_000, NOW)).toBe('12m');
    expect(formatRelativeActivity(NOW - 3 * 3_600_000, NOW)).toBe('3h');
    expect(formatRelativeActivity(NOW - 2 * 86_400_000, NOW)).toBe('2d');
  });

  // A clock skew between synced devices must read as "just now", never as a negative age.
  it('renders a future timestamp as now rather than a negative age', () => {
    expect(formatRelativeActivity(NOW + 60_000, NOW)).toBe('now');
  });

  it('falls back to a date past a week, where "9d" stops helping', () => {
    const label = formatRelativeActivity(NOW - 30 * 86_400_000, NOW);

    expect(label).not.toMatch(/^\d+d$/);
    expect(label.length).toBeGreaterThan(0);
  });

  it('renders an absent timestamp as empty so the row omits the element', () => {
    expect(formatRelativeActivity(0, NOW)).toBe('');
  });
});
