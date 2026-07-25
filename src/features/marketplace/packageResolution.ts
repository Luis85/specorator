/**
 * Resolves a catalog item's **package**: the item plus every catalog item it
 * transitively `requires`, ordered dependencies-first so an install can never
 * write a dependent before the thing it depends on (an agent bound to skills
 * that aren't there yet).
 *
 * The catalog is untrusted, so resolution is total and bounded: it reports a
 * missing dependency, a cycle, and an oversized package as data rather than
 * throwing or looping. Mirrors the marketplace repo's `resolvePackage` in
 * `scripts/lib/catalog.mjs`, which enforces the same rules at the source — so a
 * package that validates there resolves to the same order here.
 */
import type { MarketplaceItem } from './catalogTypes';

/**
 * The most items one package may contain (root + transitive dependencies). Also
 * bounds the resolver's recursion depth. Matches the marketplace validator's cap.
 */
export const MAX_PACKAGE_ITEMS = 100;

export type PackageResolutionFailure =
  /** A required id isn't in the loaded catalog (a partial or forked catalog). */
  | { ok: false; reason: 'missing'; missing: string[] }
  /** The `requires` graph loops — `path` names the ids, first repeated last. */
  | { ok: false; reason: 'cycle'; path: string[] }
  /** More than `MAX_PACKAGE_ITEMS` items would install as one unit. */
  | { ok: false; reason: 'too-large'; count: number };

export type PackageResolution =
  | {
      ok: true;
      /** Every item to install, dependencies before dependents, the root LAST. */
      items: MarketplaceItem[];
      /** The dependencies alone, in install order (the root excluded). */
      dependencies: MarketplaceItem[];
    }
  | PackageResolutionFailure;

/** Indexes a catalog by id for resolution. */
export function indexCatalog(items: readonly MarketplaceItem[]): Map<string, MarketplaceItem> {
  return new Map(items.map((item) => [item.id, item]));
}

/**
 * Resolves `root`'s package against `byId`. On success the root is the LAST
 * entry of `items`, every dependency precedes the items that require it, and
 * a shared dependency appears once.
 */
export function resolvePackage(
  root: MarketplaceItem,
  byId: ReadonlyMap<string, MarketplaceItem>,
): PackageResolution {
  const order: MarketplaceItem[] = [];
  const done = new Set<string>();
  const onPath = new Set<string>();
  const missing = new Set<string>();
  let cycle: string[] | null = null;

  const visit = (item: MarketplaceItem, path: string[]): void => {
    if (done.has(item.id) || cycle) return;
    if (onPath.has(item.id)) {
      // Report the loop itself, not the walk that reached it: drop the prefix
      // before the first repeat and close the path on it (`a → b → a`).
      cycle = [...path.slice(path.indexOf(item.id)), item.id];
      return;
    }
    onPath.add(item.id);
    for (const id of item.requires ?? []) {
      const dependency = byId.get(id);
      // Record and skip an unknown id rather than aborting: collecting ALL of
      // them lets the caller name every missing piece in one message. The
      // resolution still fails — a package is installed whole or not at all.
      if (!dependency) missing.add(id);
      else visit(dependency, [...path, item.id]);
      if (cycle) return;
    }
    onPath.delete(item.id);
    done.add(item.id);
    order.push(item);
  };

  visit(root, []);

  if (cycle) return { ok: false, reason: 'cycle', path: cycle };
  if (missing.size > 0) return { ok: false, reason: 'missing', missing: [...missing] };
  if (order.length > MAX_PACKAGE_ITEMS) return { ok: false, reason: 'too-large', count: order.length };
  return { ok: true, items: order, dependencies: order.slice(0, -1) };
}

/**
 * True when the item declares dependencies at all — the cheap check the UI uses
 * to decide whether to resolve and render a package section.
 */
export function isPackage(item: MarketplaceItem): boolean {
  return (item.requires?.length ?? 0) > 0;
}

/**
 * A human-readable reason a package can't be installed, for the detail banner
 * and the install error. Kept here (not in the component) so the store and the
 * view report a failure identically.
 */
export function describePackageFailure(failure: PackageResolutionFailure): string {
  switch (failure.reason) {
    case 'missing':
      return `This item requires ${failure.missing.join(', ')}, which ${failure.missing.length === 1 ? 'is' : 'are'} not in this catalog.`;
    case 'cycle':
      return `This item's dependencies form a loop (${failure.path.join(' → ')}).`;
    case 'too-large':
      return `This item would install ${failure.count} items, over the ${MAX_PACKAGE_ITEMS}-item limit.`;
  }
}
