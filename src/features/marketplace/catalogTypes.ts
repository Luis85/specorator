/**
 * Types + validation for the Specorator Marketplace catalog manifest
 * (`index.json`) fetched from the curated GitHub-hosted catalog. Shapes mirror
 * the manifest produced by the marketplace repo's `scripts/build-index.mjs`.
 */

/** A catalog item's type — the singular form the manifest uses. */
export type MarketplaceItemType = 'quick-action' | 'agent' | 'loop' | 'template' | 'skill';

export interface MarketplaceItem {
  /** Stable catalog id, e.g. `loops/ticket-to-pr-ready`. */
  id: string;
  type: MarketplaceItemType;
  name: string;
  description: string;
  /** Repo-relative path to the item's Markdown file, e.g. `loops/ticket-to-pr-ready.md`. */
  path: string;
  tags: string[];
  icon?: string;
  /** Agents only — worker/verifier roles. */
  roles?: string[];
  /** Templates only — the work-order priority. */
  priority?: string;
  author?: string;
  source?: string;
  license?: string;
  version?: number;
}

export interface MarketplaceManifest {
  schemaVersion: number;
  catalog: string;
  count: number;
  items: MarketplaceItem[];
}

/** Manifest schema version this build understands. */
export const MARKETPLACE_MANIFEST_SCHEMA_VERSION = 1;

/** All catalog types. */
export const MARKETPLACE_ITEM_TYPES: readonly MarketplaceItemType[] = [
  'quick-action',
  'agent',
  'loop',
  'template',
  'skill',
];

/**
 * Types this version can install. Skills are catalogued but not yet installable
 * (they need a provider-root chooser and have no catalog content today), so the
 * view surfaces them as not-yet-installable rather than silently dropping them.
 */
export const INSTALLABLE_ITEM_TYPES: readonly MarketplaceItemType[] = [
  'quick-action',
  'agent',
  'loop',
  'template',
];

export function isInstallableType(type: MarketplaceItemType): boolean {
  return INSTALLABLE_ITEM_TYPES.includes(type);
}

/**
 * Catalog ids are `<folder>/<slug>` — lowercase alphanumeric/hyphen segments,
 * slash-separated (as produced by the marketplace repo's build-index). Enforcing
 * the shape rejects a malformed or hostile id such as `__proto__`, `constructor`,
 * or `toString`: the view keys plain-object caches (bodies/previewErrors/
 * installing) by id, so an Object.prototype name would read as already-present
 * (skipping the fetch) or, worse, `bodies['__proto__'] = body` could mutate the
 * record's prototype.
 */
const CATALOG_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)+$/;

/** A safe-to-key catalog id: the expected lowercase `<folder>/<slug>` shape. */
function isSafeCatalogId(id: unknown): boolean {
  return typeof id === 'string' && CATALOG_ID_PATTERN.test(id);
}

/** A present, non-whitespace string. Guards name (a blank name slugifies to the
 *  installer's shared per-type fallback — `loop`/`template`/… — and collides). */
function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isMarketplaceItem(value: unknown): value is MarketplaceItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isSafeCatalogId(item.id) &&
    isNonBlankString(item.name) &&
    typeof item.path === 'string' &&
    typeof item.type === 'string' &&
    (MARKETPLACE_ITEM_TYPES as readonly string[]).includes(item.type) &&
    (item.tags === undefined || Array.isArray(item.tags))
  );
}

/**
 * Validates a fetched manifest, returning it typed or `null` when the payload is
 * malformed or a schema version this build doesn't understand. Individual
 * malformed items are dropped rather than failing the whole catalog.
 */
export function parseManifest(raw: unknown): MarketplaceManifest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const manifest = raw as Record<string, unknown>;
  if (manifest.schemaVersion !== MARKETPLACE_MANIFEST_SCHEMA_VERSION) return null;
  if (!Array.isArray(manifest.items)) return null;

  const parsed = manifest.items.filter(isMarketplaceItem).map((item) => ({
    ...item,
    description: typeof item.description === 'string' ? item.description : '',
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
  }));

  // Dedupe by id (first wins): duplicate ids collide on the `:key` of the view's
  // card v-for and break Vue list reconciliation.
  const seen = new Set<string>();
  const items = parsed.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return {
    schemaVersion: MARKETPLACE_MANIFEST_SCHEMA_VERSION,
    catalog: typeof manifest.catalog === 'string' ? manifest.catalog : 'specorator-marketplace',
    count: items.length,
    items,
  };
}
