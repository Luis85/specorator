/**
 * Installs a Marketplace **skill**: a multi-file folder written into a provider
 * skill root (Claude / Codex / Cursor) at project (vault) or user (home) scope,
 * chosen in the detail view. The store fetches the file contents; this module
 * owns the pure vault/home I/O, the path guards, and the "installed" checks.
 *
 * Split out of `MarketplaceInstaller` — which keeps the note/agent installs — so
 * neither half carries the other's concerns. Shared install types live in
 * `installerTypes.ts`, so the two modules never import each other.
 */
import { normalizePath } from 'obsidian';

import type { VaultFileAdapter } from '../../core/storage/VaultFileAdapter';
import { extractString, parseFrontmatter, validateSlugName } from '../../utils/frontmatter';
import { type MarketplaceItem, normalizeInstallSlug } from './catalogTypes';
import type { InstallOutcome, MarketplaceInstallDeps } from './installerTypes';
import { MarketplaceError } from './MarketplaceCatalogClient';
import {
  hasUnsafePathSegment,
  isReservedDeviceName,
  SKILL_INSTALL_SCOPES,
  SKILL_PROVIDER_TARGETS,
  type SkillInstallTarget,
  skillRootFor,
} from './skillInstallTargets';

/** Both the vault and home adapters satisfy the skill install's write surface. */
type SkillWriteAdapter = Pick<VaultFileAdapter, 'exists' | 'read' | 'write' | 'deleteFolderRecursive'>;

function skillAdapterFor(target: SkillInstallTarget, deps: MarketplaceInstallDeps): SkillWriteAdapter {
  return target.scope === 'user' ? deps.homeAdapter : deps.adapter;
}

/**
 * The skill's install folder name, from its `SKILL.md` path
 * (`<folder>/<slug>/SKILL.md` → `<slug>`), falling back to the manifest name.
 * Null when it isn't a single safe path segment, so a hostile name can't escape
 * the skill root. `assertSkillFolderName` is the throwing variant used at
 * install; the installed-checks use this nullable one.
 */
function skillFolderNameOrNull(item: MarketplaceItem): string | null {
  // The install folder is the skill name normalized to the SAME slug
  // parseManifest keys its per-type dedup on (`skill:<slug>`) — so install target
  // and dedup key stay exactly aligned — and the lowercase `[a-z0-9-]` shape the
  // Claude/Codex/Cursor scanners resolve as a single command token. Slugify also
  // fully sanitizes (case, spaces, separators, `..`, dots all collapse or trim),
  // so the result is always one safe segment: no traversal, no nesting. Empty
  // (a punctuation-only name) → null; parseManifest already drops those upstream.
  const slug = normalizeInstallSlug(item.name);
  // A Windows reserved device name can't be a directory on Windows — the install
  // would fail cryptically there while succeeding on macOS/Linux. Reject it on
  // EVERY platform so a skill's installability doesn't silently depend on the OS.
  // (Supporting-file segments get the same check via `hasUnsafePathSegment`.)
  if (!slug || isReservedDeviceName(slug)) return null;
  return slug;
}

function assertSkillFolderName(item: MarketplaceItem): string {
  const name = skillFolderNameOrNull(item);
  if (!name) throw new MarketplaceError("This skill's name is invalid and can't be installed.");
  return name;
}

/** Rejects a skill file whose in-folder path would traverse outside its dir. */
function assertSafeInSkillPath(relPath: string): string {
  if (!relPath || hasUnsafePathSegment(relPath)) {
    throw new MarketplaceError(`This skill contains an unsafe file path ("${relPath}") and can't be installed.`);
  }
  return relPath;
}

/**
 * Guards the reviewed SKILL.md before it becomes the install marker: it must
 * carry the universal `name` + `description` frontmatter every provider reads,
 * have a non-empty instruction body, and its name must identify the SAME skill
 * as the install slug — the skill parallel of the note stores' `assertPayloadPath`.
 * Without this, a frontmatter-less, instruction-less, or misidentified SKILL.md
 * would install and be marked "Installed" (blocking reinstall) even though no
 * provider can meaningfully load it.
 */
function assertInstallableSkillBody(skillMd: string, slug: string): void {
  const parsed = parseFrontmatter(skillMd);
  const fm = parsed?.frontmatter ?? {};
  const fmName = extractString(fm, 'name');
  if (!fmName || !extractString(fm, 'description')) {
    throw new MarketplaceError("This skill's SKILL.md needs a `name` and `description` and can't be installed.");
  }
  if (!parsed?.body.trim()) {
    throw new MarketplaceError("This skill's SKILL.md has no instructions below its frontmatter and can't be installed.");
  }
  // The frontmatter `name` becomes the installed skill's identifier, so hold it to the
  // same strict slug rule the provider authoring UIs enforce (validateSlugName). The
  // slug match below uses lossy normalizeInstallSlug — `Foo_Bar`/`Foo Bar` both collapse
  // to `foo-bar`, and overlong or YAML-reserved names slip through — so without this a
  // marker no provider can load would still install and be marked "Installed".
  if (validateSlugName(fmName) !== null) {
    throw new MarketplaceError(
      "This skill's SKILL.md `name` must be a lowercase slug (letters, numbers, hyphens; not a reserved word) that every provider accepts, so it can't be installed.",
    );
  }
  if (normalizeInstallSlug(fmName) !== slug) {
    throw new MarketplaceError("This skill's SKILL.md names a different skill than its catalog entry, so it can't be installed.");
  }
}

/**
 * Installs a multi-file skill under the chosen provider root + scope. `files`
 * maps each in-skill relative path (`SKILL.md`, `scripts/setup.mjs`, …) to its
 * already-fetched content — the store fetches them so this stays pure vault/home
 * I/O. Skips when the target already holds the skill (its `SKILL.md` is present).
 * `SKILL.md` is written LAST so a mid-write failure leaves no dedup marker and a
 * retry re-installs cleanly.
 */
export async function installSkillItem(
  item: MarketplaceItem,
  files: ReadonlyMap<string, string>,
  target: SkillInstallTarget,
  deps: MarketplaceInstallDeps,
): Promise<InstallOutcome> {
  const skillMd = files.get('SKILL.md');
  if (skillMd === undefined) {
    throw new MarketplaceError("This skill is missing its SKILL.md and can't be installed.");
  }
  const name = assertSkillFolderName(item);
  assertInstallableSkillBody(skillMd, name);
  const adapter = skillAdapterFor(target, deps);
  const skillDir = `${skillRootFor(target)}/${name}`;
  // A present SKILL.md means the skill is already installed here (SKILL.md is
  // written LAST, so its presence guarantees a COMPLETE install) — skip.
  if (await adapter.exists(normalizePath(`${skillDir}/SKILL.md`))) return 'skipped';
  // The folder exists but has no SKILL.md — a hand-made or half-installed dir.
  // Writing into it would overwrite files we didn't put there, so refuse rather
  // than silently clobber the user's content; they can remove it and retry.
  if (await adapter.exists(normalizePath(skillDir))) {
    throw new MarketplaceError(
      `A folder already exists at "${skillDir}" but has no SKILL.md. Remove it before installing this skill.`,
    );
  }

  // We verified skillDir didn't exist above, so anything written below is ours. If a
  // write fails partway (transient I/O, exhausted disk), remove the partial folder so a
  // retry isn't permanently blocked by the pre-existing-folder guard above. The cleanup
  // is best-effort (a failure there must not mask the original write error).
  try {
    await writeSupportingSkillFiles(skillDir, files, adapter);
    await adapter.write(normalizePath(`${skillDir}/SKILL.md`), skillMd);
  } catch (err) {
    // Best-effort cleanup of OUR partial write — but NOT if a COMPLETE marker (byte-identical
    // to what we meant to write) is now present: that means a concurrent peer finished this
    // exact install, and a recursive delete would destroy their skill. Compare the CONTENT,
    // not mere existence: our own final marker write can create-then-truncate on a mid-write
    // failure (disk full), and an exists-only check would misread that partial SKILL.md as a
    // peer's completion — leaving a broken marker the preflight later reports as installed.
    const existingMarker = await adapter.read(normalizePath(`${skillDir}/SKILL.md`)).catch(() => null);
    if (existingMarker !== skillMd) await adapter.deleteFolderRecursive(normalizePath(skillDir)).catch(() => {});
    throw err;
  }
  return 'installed';
}

/**
 * Writes a skill's supporting files (everything but `SKILL.md`). Validates ALL
 * in-skill paths BEFORE writing any of them, so a malformed path throws before
 * the first write — never leaving a half-written folder the pre-existing-folder
 * guard would then refuse on retry. (The manifest sanitizer already drops such
 * skills upstream; this keeps the installer's own all-or-nothing promise honest
 * for direct callers.) `SKILL.md` is written by the caller, last.
 */
async function writeSupportingSkillFiles(
  skillDir: string,
  files: ReadonlyMap<string, string>,
  adapter: SkillWriteAdapter,
): Promise<void> {
  const supporting = [...files].filter(([relPath]) => relPath !== 'SKILL.md');
  for (const [relPath] of supporting) assertSafeInSkillPath(relPath);
  for (const [relPath, content] of supporting) {
    await adapter.write(normalizePath(`${skillDir}/${relPath}`), content);
  }
}

/** True when the skill already exists at a SPECIFIC target (the detail's per-target button). */
export async function isSkillInstalledAt(
  item: MarketplaceItem,
  target: SkillInstallTarget,
  deps: MarketplaceInstallDeps,
): Promise<boolean> {
  const name = skillFolderNameOrNull(item);
  if (!name) return false;
  try {
    return await skillAdapterFor(target, deps).exists(normalizePath(`${skillRootFor(target)}/${name}/SKILL.md`));
  } catch {
    return false;
  }
}

/** True when the skill exists in ANY provider root + scope (the grid/card badge). */
export async function isSkillInstalledAnywhere(item: MarketplaceItem, deps: MarketplaceInstallDeps): Promise<boolean> {
  const name = skillFolderNameOrNull(item);
  if (!name) return false;
  for (const provider of SKILL_PROVIDER_TARGETS) {
    for (const scope of SKILL_INSTALL_SCOPES) {
      if (await isSkillInstalledAt(item, { provider, scope }, deps)) return true;
    }
  }
  return false;
}
