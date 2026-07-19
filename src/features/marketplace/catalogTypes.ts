/**
 * Types + validation for the Specorator Marketplace catalog manifest
 * (`index.json`) fetched from the curated GitHub-hosted catalog. Shapes mirror
 * the manifest produced by the marketplace repo's `scripts/build-index.mjs`.
 */
import { hasUnsafePathSegment } from './skillInstallTargets';

/** A catalog item's type — the singular form the manifest uses. */
export type MarketplaceItemType = 'quick-action' | 'agent' | 'loop' | 'template' | 'skill';

export interface MarketplaceItem {
  /** Stable catalog id, e.g. `loops/ticket-to-pr-ready`. */
  id: string;
  type: MarketplaceItemType;
  name: string;
  description: string;
  /** Repo-relative path to the item's Markdown file, e.g. `loops/ticket-to-pr-ready.md`.
   *  For a skill this is its `SKILL.md` (the previewed body). */
  path: string;
  /**
   * Skills only — every file in the skill folder as repo-relative paths
   * (`SKILL.md` included), so the installer can fetch and write the whole
   * multi-file skill under the chosen root. Absent for single-file types.
   */
  files?: string[];
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
 * Types this version can install. Skills install as a multi-file folder into a
 * provider skill root (Claude/Codex/Cursor) at project or user scope, chosen in
 * the detail view — see `skillInstallTargets.ts` and `MarketplaceInstaller`.
 */
export const INSTALLABLE_ITEM_TYPES: readonly MarketplaceItemType[] = [
  'quick-action',
  'agent',
  'loop',
  'template',
  'skill',
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

/**
 * Shared name→slug normalization every installable store uses to derive its
 * target: the note stores' `slugify`, the roster's `slugifyRosterName`, and
 * quick actions' `getFilePathForName` all lowercase, collapse non-alphanumeric
 * runs to one hyphen, and trim edge hyphens. Exported so the skill installer
 * derives its folder from the SAME slug this module's per-type dedup keys on —
 * keeping install target and dedup key exactly aligned.
 */
export function normalizeInstallSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * A name that is both present AND survives normalization to a non-empty install
 * slug. A punctuation-only or non-ASCII name (e.g. `计划`) is non-blank but
 * normalizes to '' → every installer substitutes the shared per-type fallback
 * (`loop`/`template`/…) and collides, so reject it like a blank name. (Supporting
 * non-ASCII slugs would need every store's slugger to change in lockstep.)
 */
function hasInstallableName(value: unknown): value is string {
  return isNonBlankString(value) && normalizeInstallSlug(value).length > 0;
}

/** An optional array field (tags/files): absent, or an array. */
function isOptionalArray(value: unknown): boolean {
  return value === undefined || Array.isArray(value);
}

/** A recognized catalog item type. */
function isKnownItemType(value: unknown): value is MarketplaceItemType {
  return typeof value === 'string' && (MARKETPLACE_ITEM_TYPES as readonly string[]).includes(value);
}

function isMarketplaceItem(value: unknown): value is MarketplaceItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isSafeCatalogId(item.id) &&
    hasInstallableName(item.name) &&
    typeof item.path === 'string' &&
    isKnownItemType(item.type) &&
    isOptionalArray(item.tags) &&
    isOptionalArray(item.files)
  );
}

/**
 * The install target an item would occupy, as `<type>:<normalized-name-slug>`,
 * or null for non-installable types (skills never install). Two installable
 * items sharing an install key collide on one vault file (note types) or roster
 * id (agents); the type prefix keeps a loop and a same-named template apart,
 * since each installs under its own folder.
 */
function installKeyOf(item: MarketplaceItem): string | null {
  if (!isInstallableType(item.type)) return null;
  return `${item.type}:${normalizeInstallSlug(item.name)}`;
}

/**
 * The `<folder>/<slug>/` prefix a skill's files must all sit under, derived from
 * its `SKILL.md` path (`item.path`). Null when the path isn't a `.../SKILL.md`
 * — a skill whose marker path has the wrong shape is malformed and gets dropped
 * from the catalog (`sanitizeSkillFiles` → null → `normalizeItemFiles` → null),
 * never installed under a guessed folder.
 */
export function skillFolderPrefix(skillMdPath: string): string | null {
  const suffix = '/SKILL.md';
  if (!skillMdPath.endsWith(suffix) || skillMdPath.length <= suffix.length) return null;
  return skillMdPath.slice(0, skillMdPath.length - suffix.length + 1); // keep trailing '/'
}

/**
 * File extensions that indicate a binary asset. Marketplace skills are text
 * (a `SKILL.md` plus supporting text files); the plugin fetches every file as
 * `requestUrl().text` and writes it back as UTF-8, which would silently corrupt
 * a binary — so the installer refuses a skill that declares one. The marketplace
 * repo's validator enforces the same text-only rule by content at the source.
 */
const BINARY_SKILL_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.icns',
  '.pdf', '.zip', '.gz', '.tar', '.tgz', '.7z', '.rar',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.mp4', '.wav', '.ogg', '.mov', '.avi', '.webm',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.jar', '.class', '.wasm',
  '.db', '.sqlite', '.sqlite3',
]);

/** True when a skill file path carries a known-binary extension. */
export function isBinarySkillPath(path: string): boolean {
  const dot = path.lastIndexOf('.');
  return dot >= 0 && BINARY_SKILL_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

/**
 * A skill file path safe to fetch and write: a string strictly under the skill's
 * own folder, no `..` traversal, no absolute/host/drive path, no backslashes.
 * The catalog is untrusted, so a hostile `files` entry (`../../etc`, `/abs`,
 * `C:\..`) must never escape the skill's install dir. (The catalog client also
 * refuses any fetch that escapes the base URL — this is the write-side guard.)
 */
function isSafeSkillFilePath(value: unknown, prefix: string): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith(prefix) &&
    value.length > prefix.length &&
    !hasUnsafePathSegment(value)
  );
}

/**
 * The safe, de-duplicated file list a skill installs — every manifest `files`
 * entry under the skill folder, with the previewed `SKILL.md` (`item.path`)
 * always present. Returns `null` — dropping the whole skill in `parseManifest` —
 * when the skill is malformed or hostile: its marker path isn't a `.../SKILL.md`
 * (no derivable install folder), or ANY declared file escapes the skill folder
 * (traversal / out-of-folder / absolute / non-string). Silently keeping such a
 * skill would either install it under a guessed folder or write it INCOMPLETE
 * (missing a required file) and mark it installed — blocking a later reinstall.
 * Rejecting the whole skill fails loud instead.
 */
function sanitizeSkillFiles(item: MarketplaceItem): string[] | null {
  const prefix = skillFolderPrefix(item.path);
  if (!prefix) return null;
  const seen = new Set<string>();
  const safe: string[] = [];
  for (const candidate of Array.isArray(item.files) ? item.files : []) {
    if (!isSafeSkillFilePath(candidate, prefix)) return null;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      safe.push(candidate);
    }
  }
  if (!seen.has(item.path)) safe.unshift(item.path);
  return safe;
}

/**
 * Strips `files` from a non-skill item; for a skill, sanitizes its files and
 * returns null to DROP the skill when any declared file escapes its folder (see
 * `sanitizeSkillFiles`). Mutates the passed (already-cloned) item.
 */
function normalizeItemFiles(item: MarketplaceItem): MarketplaceItem | null {
  if (item.type !== 'skill') {
    delete item.files;
    return item;
  }
  const files = sanitizeSkillFiles(item);
  if (files === null) return null;
  item.files = files;
  return item;
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

  // Normalize description/tags, then resolve `files` per item — a skill whose
  // declared files escape its folder is dropped (normalizeItemFiles → null)
  // rather than installed incomplete; non-skills have `files` stripped.
  const parsed = manifest.items
    .filter(isMarketplaceItem)
    .map((item): MarketplaceItem => ({
      ...item,
      description: typeof item.description === 'string' ? item.description : '',
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    }))
    .map(normalizeItemFiles)
    .filter((item): item is MarketplaceItem => item !== null);

  // Dedupe by id AND by per-type install key (first wins). Id-dedup keeps the
  // card v-for `:key` unique; install-key-dedup drops a later item that would
  // install to the SAME vault file / roster id as an earlier one (a different id
  // but a name that normalizes to the same slug — only reachable when a custom
  // catalog decouples the id from the name-slug). Without it, installing either
  // colliding item marks both cards Installed and permanently hides the other's
  // Install action.
  const seenIds = new Set<string>();
  const seenInstallKeys = new Set<string>();
  const items = parsed.filter((item) => {
    if (seenIds.has(item.id)) return false;
    const installKey = installKeyOf(item);
    if (installKey !== null && seenInstallKeys.has(installKey)) return false;
    seenIds.add(item.id);
    if (installKey !== null) seenInstallKeys.add(installKey);
    return true;
  });

  return {
    schemaVersion: MARKETPLACE_MANIFEST_SCHEMA_VERSION,
    catalog: typeof manifest.catalog === 'string' ? manifest.catalog : 'specorator-marketplace',
    count: items.length,
    items,
  };
}
