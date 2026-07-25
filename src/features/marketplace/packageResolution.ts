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

/** One item's position in the walk: the item, and how far through its `requires`. */
interface Frame {
  item: MarketplaceItem;
  next: number;
}

/** The walk's mutable state, threaded through `descend`/`emit`. */
interface Walk {
  /** Items resolved so far, in install order. */
  order: MarketplaceItem[];
  /** Ids already emitted — reached again via another dependent, skip. */
  done: Set<string>;
  /** Ids currently on the walk: as a set for membership, as an array (in the
   *  same order as `stack`) for naming a cycle. */
  onPath: Set<string>;
  path: string[];
  /** Required ids absent from the catalog — all of them, so one message names each. */
  missing: Set<string>;
  stack: Frame[];
}

/**
 * Walks one `requires` edge. Returns a failure to abort the whole resolution
 * (a cycle, or a package that outgrew the cap), or null to carry on — an id that
 * is unknown or already emitted is recorded/skipped rather than failing here.
 */
function descend(
  walk: Walk,
  id: string,
  byId: ReadonlyMap<string, MarketplaceItem>,
): PackageResolutionFailure | null {
  const dependency = byId.get(id);
  // Record and skip an unknown id rather than aborting: collecting ALL of them
  // lets the caller name every missing piece in one message. The resolution
  // still fails — a package is installed whole or not at all.
  if (!dependency) {
    walk.missing.add(id);
    return null;
  }
  if (walk.done.has(id)) return null;
  if (walk.onPath.has(id)) {
    // Report the loop itself, not the walk that reached it: drop the prefix
    // before the first repeat and close the path on it (`a → b → a`).
    return { ok: false, reason: 'cycle', path: [...walk.path.slice(walk.path.indexOf(id)), id] };
  }
  walk.onPath.add(id);
  walk.path.push(id);
  walk.stack.push({ item: dependency, next: 0 });
  // Items already emitted plus items still being walked is a lower bound on the
  // package's size, and it only ever grows HERE (a pop trades one stack slot for
  // one emitted item). Checking it as we descend is what bounds the walk in both
  // shapes a hostile catalog can take: a wide fan-out grows `order`, while a deep
  // chain grows `stack` and emits nothing until it unwinds.
  const reached = walk.order.length + walk.stack.length;
  if (reached > MAX_PACKAGE_ITEMS) return { ok: false, reason: 'too-large', count: reached };
  return null;
}

/** Emits the item on top of the stack: every dependency of it has been emitted. */
function emit(walk: Walk): void {
  const frame = walk.stack.pop();
  if (!frame) return;
  walk.onPath.delete(frame.item.id);
  walk.path.pop();
  walk.done.add(frame.item.id);
  walk.order.push(frame.item);
}

/**
 * Resolves `root`'s package against `byId`. On success the root is the LAST
 * entry of `items`, every dependency precedes the items that require it, and
 * a shared dependency appears once.
 *
 * The walk is an ITERATIVE post-order DFS with the size cap enforced as items
 * are emitted, not after the graph is walked. Both matter for an untrusted
 * catalog: recursion would blow the call stack on a long `requires` chain (a
 * `RangeError` instead of the promised `too-large`), and a cap checked only at
 * the end would let a huge graph be walked in full first.
 */
export function resolvePackage(
  root: MarketplaceItem,
  byId: ReadonlyMap<string, MarketplaceItem>,
): PackageResolution {
  const walk: Walk = {
    order: [],
    done: new Set(),
    onPath: new Set([root.id]),
    path: [root.id],
    missing: new Set(),
    stack: [{ item: root, next: 0 }],
  };

  while (walk.stack.length > 0) {
    const frame = walk.stack[walk.stack.length - 1];
    const requires = frame.item.requires ?? [];
    if (frame.next >= requires.length) {
      emit(walk);
      continue;
    }
    const id = requires[frame.next];
    frame.next += 1;
    const failure = descend(walk, id, byId);
    if (failure) return failure;
  }

  if (walk.missing.size > 0) return { ok: false, reason: 'missing', missing: [...walk.missing] };
  return { ok: true, items: walk.order, dependencies: walk.order.slice(0, -1) };
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
