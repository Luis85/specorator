import { isBinarySkillPath, type MarketplaceItem, MAX_SKILL_FILES, skillFolderPrefix } from './catalogTypes';
import { MarketplaceCatalogClient, MarketplaceError } from './MarketplaceCatalogClient';

/** Bounded parallelism for fetching a multi-file skill's supporting files. */
const SKILL_FETCH_CONCURRENCY = 6;

// Bounds on a multi-file skill download from an (untrusted) custom catalog source, so a
// manifest declaring thousands of files or very large bodies can't exhaust renderer
// memory or bandwidth. Sized well above the first-party catalog's skills (project-setup:
// 138 files, ~370 KB). Measured in string length (≈ bytes for the UTF-8 text these must be).
export const MAX_SKILL_FILE_CHARS = 1_000_000;
export const MAX_SKILL_TOTAL_CHARS = 10_000_000;

/**
 * Runs `fn` over `items` with at most `limit` in flight, preserving input order
 * in the result. On the first failure it stops pulling new work (so a mid-batch
 * error — a 404 or a size-cap throw — doesn't keep firing requests) AND waits for
 * the in-flight workers to settle before rejecting with that first error, so no
 * request is still running when the caller re-enables the UI or a retry begins.
 * Kept local — no external dependency.
 */
async function fetchWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let failed = false;
  let failure: unknown;
  const worker = async (): Promise<void> => {
    while (cursor < items.length && !failed) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await fn(items[index]);
      } catch (err) {
        if (!failed) {
          failed = true;
          failure = err;
        }
        return;
      }
    }
  };
  // allSettled (not Promise.all) so every worker's in-flight `fn` resolves before we
  // return — Promise.all would reject the instant one worker throws while the others
  // keep downloading. Re-throw the first captured error to preserve the reject contract.
  await Promise.allSettled(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  if (failed) throw failure;
  return results;
}

/**
 * Rejects a skill file map whose content isn't text — a NUL byte means a binary
 * was decoded as text (the plugin's UTF-8 write would corrupt it). Mirrors the
 * marketplace validator's source-side rule and catches binaries the extension
 * denylist can't (unlisted/extensionless formats).
 */
function assertTextOnlySkillContents(files: ReadonlyMap<string, string>): void {
  for (const [rel, content] of files) {
    if (content.includes(String.fromCharCode(0))) {
      throw new MarketplaceError(
        `This skill's file "${rel}" is not text (contains a NUL byte). Marketplace skills must be text-only.`,
      );
    }
  }
}

/** Rejects a skill that declares a binary file by extension (a fast pre-fetch
 *  check; content is re-verified after fetch in assertTextOnlySkillContents). */
export function assertNoBinarySkillFiles(item: MarketplaceItem): void {
  const binaryFile = (item.files ?? []).find((path) => isBinarySkillPath(path));
  if (binaryFile) {
    throw new MarketplaceError(
      `This skill includes a non-text file ("${binaryFile}"), which can't be installed. Marketplace skills must be text-only.`,
    );
  }
}

/**
 * Enforces the per-file and running-aggregate size caps on one skill file's content
 * (`SKILL.md` included, so a marker-only skill can't slip a huge body past the bounds).
 * `budget.total` accumulates across calls; throws past either cap.
 */
function assertSkillFileWithinCaps(content: string, label: string, budget: { total: number }): void {
  if (content.length > MAX_SKILL_FILE_CHARS) {
    throw new MarketplaceError(
      `This skill's file "${label}" is too large to install (over ${MAX_SKILL_FILE_CHARS.toLocaleString()} characters).`,
    );
  }
  budget.total += content.length;
  if (budget.total > MAX_SKILL_TOTAL_CHARS) {
    throw new MarketplaceError(
      `This skill's files exceed the ${MAX_SKILL_TOTAL_CHARS.toLocaleString()}-character total limit for a marketplace install.`,
    );
  }
}

/**
 * Builds the in-skill file map: the reviewed `SKILL.md` verbatim, plus every
 * other file in `item.files` fetched from `sourceUrl` — the source snapshotted
 * when the install began, so a concurrent source switch can't split the skill.
 * Keys are in-skill relative paths (`scripts/setup.mjs`), values the content. A
 * single fetch failure rejects the whole map, so no partial skill is written;
 * a NUL-bearing (binary) file is rejected too, and every file (SKILL.md included)
 * is size-capped.
 *
 * Revision-consistency (item 10): the supporting files are fetched at install
 * time from the mutable source, while `skillMdBody` is the marker reviewed at
 * preview time. For a multi-file skill the marker is re-fetched after the batch
 * and must still equal what was reviewed — a catalog bump in that window would
 * otherwise pair the reviewed marker with newer supporting files (a hybrid
 * skill), so a drift aborts the install and asks for a re-review. The reviewed
 * body is still what's written; the re-fetch is a guard, not the source of truth.
 */
export async function fetchSkillFiles(
  item: MarketplaceItem,
  skillMdBody: string,
  sourceUrl: string,
  assertNetwork: () => void,
): Promise<Map<string, string>> {
  const declared = item.files ?? [];
  if (declared.length > MAX_SKILL_FILES) {
    throw new MarketplaceError(
      `This skill declares ${declared.length} files, over the ${MAX_SKILL_FILES}-file limit for a marketplace install.`,
    );
  }
  // SKILL.md counts toward the caps first — a marker-only skill never runs the fetch
  // callback below, so its size must be checked here or it would bypass the bounds.
  const budget = { total: 0 };
  assertSkillFileWithinCaps(skillMdBody, 'SKILL.md', budget);
  const files = new Map<string, string>([['SKILL.md', skillMdBody]]);
  const prefix = skillFolderPrefix(item.path);
  const others = declared.filter((repoPath) => repoPath !== item.path);
  if (prefix !== null && others.length > 0) {
    const client = new MarketplaceCatalogClient(sourceUrl);
    const contents = await fetchWithConcurrency(others, SKILL_FETCH_CONCURRENCY, async (repoPath) => {
      // Re-read the opt-in before EVERY request (not just once at install start):
      // disabling networking mid-install must stop any not-yet-started fetch at
      // once — the Marketplace's "opt-out stops requestUrl immediately" contract.
      assertNetwork();
      const content = await client.fetchItemBody(repoPath);
      // Abort past the cap (with SKILL_FETCH_CONCURRENCY in flight the overshoot is
      // bounded) rather than buffering an oversized body from a custom source.
      assertSkillFileWithinCaps(content, repoPath, budget);
      return content;
    });
    await assertReviewedMarkerUnchanged(client, item.path, skillMdBody, assertNetwork);
    others.forEach((repoPath, index) => {
      const rel = repoPath.startsWith(prefix) ? repoPath.slice(prefix.length) : null;
      if (rel) files.set(rel, contents[index]);
    });
  }
  assertTextOnlySkillContents(files);
  return files;
}

/**
 * Re-fetches the skill's `SKILL.md` from the source and requires it still equals
 * the reviewed body — the plugin-only revision guard (item 10). It only narrows,
 * not closes, the hybrid window: a bump that rewrites a supporting file WITHOUT
 * touching `SKILL.md` still passes (the reviewed marker is then still accurate,
 * only the scripts moved). Closing that residual needs per-file content hashes in
 * the reviewed index or pinning to an immutable revision (cross-repo) — see the
 * tech-debt note. The re-fetch isn't size-capped: on a match it equals the
 * already-counted reviewed body; on a mismatch the install aborts regardless.
 */
async function assertReviewedMarkerUnchanged(
  client: MarketplaceCatalogClient,
  markerPath: string,
  reviewedBody: string,
  assertNetwork: () => void,
): Promise<void> {
  assertNetwork();
  const currentMarker = await client.fetchItemBody(markerPath);
  if (currentMarker !== reviewedBody) {
    throw new MarketplaceError(
      'This skill changed in the catalog since you reviewed it. Refresh the Marketplace and review it again before installing.',
    );
  }
}
