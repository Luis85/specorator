import type { MarketplaceItem, MarketplaceItemType } from '@/features/marketplace/catalogTypes';
import {
  describePackageFailure,
  indexCatalog,
  isPackage,
  MAX_PACKAGE_ITEMS,
  resolvePackage,
} from '@/features/marketplace/packageResolution';

function item(id: string, requires?: string[], type: MarketplaceItemType = 'skill'): MarketplaceItem {
  return {
    id,
    type,
    name: id.split('/')[1],
    description: '',
    path: `${id}.md`,
    tags: [],
    ...(requires ? { requires } : {}),
  };
}

/** Resolves `rootId` against a catalog built from the passed items. */
function resolve(items: MarketplaceItem[], rootId: string) {
  const byId = indexCatalog(items);
  const root = byId.get(rootId);
  if (!root) throw new Error(`no such item: ${rootId}`);
  return resolvePackage(root, byId);
}

describe('resolvePackage', () => {
  it('returns the item alone when it declares no dependencies', () => {
    const result = resolve([item('agents/pm', undefined, 'agent')], 'agents/pm');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.map((i) => i.id)).toEqual(['agents/pm']);
    expect(result.dependencies).toEqual([]);
  });

  it('orders dependencies before dependents, with the root last', () => {
    const result = resolve(
      [
        item('agents/pm', ['skills/brief', 'skills/raid'], 'agent'),
        item('skills/brief', ['skills/shared']),
        item('skills/raid', ['skills/shared']),
        item('skills/shared'),
      ],
      'agents/pm',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // A shared transitive dependency appears once, before both of its dependents.
    expect(result.items.map((i) => i.id)).toEqual([
      'skills/shared',
      'skills/brief',
      'skills/raid',
      'agents/pm',
    ]);
    expect(result.dependencies.map((i) => i.id)).toEqual([
      'skills/shared',
      'skills/brief',
      'skills/raid',
    ]);
  });

  it('reports every dependency missing from the catalog', () => {
    const result = resolve([item('agents/pm', ['skills/a', 'skills/b'], 'agent')], 'agents/pm');
    expect(result).toEqual({ ok: false, reason: 'missing', missing: ['skills/a', 'skills/b'] });
  });

  it('reports a cycle instead of looping forever', () => {
    const result = resolve(
      [item('agents/a', ['agents/b'], 'agent'), item('agents/b', ['agents/a'], 'agent')],
      'agents/a',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('cycle');
    // The loop itself, closed on the repeated id — not the walk that reached it.
    expect(result).toMatchObject({ path: ['agents/a', 'agents/b', 'agents/a'] });
  });

  it('reports a self-referencing item as a cycle', () => {
    // parseManifest drops a self-reference, but a direct caller must not hang.
    const result = resolve([item('agents/a', ['agents/a'], 'agent')], 'agents/a');
    expect(result).toMatchObject({ ok: false, reason: 'cycle' });
  });

  it('refuses a package larger than the item cap', () => {
    const ids = Array.from({ length: MAX_PACKAGE_ITEMS }, (_, i) => `skills/s${i}`);
    const items = [item('agents/pm', ids, 'agent'), ...ids.map((id) => item(id))];
    const result = resolve(items, 'agents/pm');
    expect(result).toEqual({ ok: false, reason: 'too-large', count: MAX_PACKAGE_ITEMS + 1 });
  });

  it('accepts a package exactly at the cap', () => {
    const ids = Array.from({ length: MAX_PACKAGE_ITEMS - 1 }, (_, i) => `skills/s${i}`);
    const items = [item('agents/pm', ids, 'agent'), ...ids.map((id) => item(id))];
    expect(resolve(items, 'agents/pm').ok).toBe(true);
  });
});

describe('isPackage', () => {
  it('is true only for an item that declares dependencies', () => {
    expect(isPackage(item('agents/pm', ['skills/a'], 'agent'))).toBe(true);
    expect(isPackage(item('agents/pm', [], 'agent'))).toBe(false);
    expect(isPackage(item('agents/pm', undefined, 'agent'))).toBe(false);
  });
});

describe('describePackageFailure', () => {
  it('names what is wrong in each case', () => {
    expect(describePackageFailure({ ok: false, reason: 'missing', missing: ['skills/a'] })).toContain('skills/a');
    expect(describePackageFailure({ ok: false, reason: 'cycle', path: ['a/b', 'a/c', 'a/b'] })).toContain('a/b → a/c → a/b');
    expect(describePackageFailure({ ok: false, reason: 'too-large', count: 500 })).toContain('500');
  });
});

describe('resolvePackage bounds (untrusted catalog)', () => {
  /** A `requires` chain of `length` items: i0 → i1 → … → i(length-1). */
  function chain(length: number): MarketplaceItem[] {
    return Array.from({ length }, (_, i) =>
      item(`skills/i${i}`, i + 1 < length ? [`skills/i${i + 1}`] : undefined),
    );
  }

  it('returns too-large for a chain far deeper than the call stack, instead of throwing', () => {
    // A recursive walk overflows the stack here (RangeError) — which would break
    // the "reports failure as data" contract the whole module rests on.
    const result = resolve(chain(20_000), 'skills/i0');
    expect(result).toMatchObject({ ok: false, reason: 'too-large' });
  });

  it('stops walking as soon as the cap is passed, rather than after the whole graph', () => {
    // Bound the WORK, not just the answer: only the items emitted up to the cap
    // may be visited, so a huge hostile graph can't tie up the renderer.
    const items = chain(20_000);
    const byId = indexCatalog(items);
    // Count lookups rather than items: `get` is the resolver's only way to reach
    // a dependency, so it measures how much of the graph was actually walked.
    const visited = new Set<string>();
    const counting = {
      ...byId,
      get: (id: string) => {
        visited.add(id);
        return byId.get(id);
      },
    } as unknown as ReadonlyMap<string, MarketplaceItem>;
    const result = resolvePackage(items[0], counting);
    expect(result).toMatchObject({ ok: false, reason: 'too-large' });
    expect(visited.size).toBeLessThanOrEqual(MAX_PACKAGE_ITEMS + 1);
  });
});
