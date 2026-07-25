/**
 * Installs a resolved package: every dependency in resolution order, then the
 * item itself. Kept out of the Pinia store so the ordering rules — dependencies
 * first, the reviewed body only for the root, the fail-before-the-root contract —
 * are testable without a plugin, and so the store stays a thin reactive shell.
 *
 * Every seam it needs is injected (`PackageInstallContext`): skill installs must
 * go through the store's per-destination queue, and the vault deps are rebuilt
 * per write from live settings.
 */
import type { MarketplaceItem } from './catalogTypes';
import type { InstallOutcome, MarketplaceInstallOptions } from './installerTypes';
import type { SkillInstallTarget } from './skillInstallTargets';

export interface PackageInstallContext {
  /** Fetches an item's body from the source the install snapshotted. */
  fetchBody: (item: MarketplaceItem, source: string) => Promise<string>;
  /** Installs a skill folder — routed through the store's destination queue. */
  installSkill: (
    item: MarketplaceItem,
    skillMdBody: string,
    target: SkillInstallTarget,
    source: string,
  ) => Promise<InstallOutcome>;
  /** Installs a non-skill item (note types + agents) into its own vault store. */
  installItem: (
    item: MarketplaceItem,
    body: string,
    options: MarketplaceInstallOptions,
  ) => Promise<InstallOutcome>;
  /** The skill names to grant an item on install (an agent's package skills). */
  boundSkills: (item: MarketplaceItem) => string[];
  /**
   * Whether a member is already present WHERE this install would write it — at
   * the chosen target for a skill, in its own store for anything else. Advisory:
   * the installers re-check race-safely at write, so this only decides whether
   * the body is worth fetching.
   */
  isInstalled: (item: MarketplaceItem, target: SkillInstallTarget | undefined) => Promise<boolean>;
  /** Resolves the target for a skill write, throwing when none was chosen. */
  requireSkillTarget: (target?: SkillInstallTarget) => SkillInstallTarget;
  /**
   * Throws if the chosen target is no longer installable under the CURRENT
   * settings (a provider losing user-scope support mid-install). The skill
   * installer applies this itself before each write; the package applies it once
   * more before the root, so the outcome can't depend on whether the skills
   * happened to be pre-installed — see `installPackage`.
   */
  assertTargetInstallable: (target: SkillInstallTarget) => void;
}

export interface PackageInstallResult {
  /** The ROOT item's own outcome — what the Installed badge and notice key on. */
  outcome: InstallOutcome;
  /** Dependencies newly written by this install. */
  installed: number;
  /** Dependencies that were already present. */
  skipped: number;
  /** Every catalog id this install touched, root included. */
  written: string[];
}

/**
 * Writes `dependencies` (in order) and then `root`. A dependency failure throws
 * BEFORE the root is written, so an agent is never installed claiming skills that
 * aren't there. Dependencies already written are deliberately NOT rolled back:
 * each is a valid, independently useful vault item owned by its own store, and a
 * retry re-runs the package and skips whatever landed.
 */
export async function installPackage(
  root: MarketplaceItem,
  reviewedBody: string,
  dependencies: readonly MarketplaceItem[],
  target: SkillInstallTarget | undefined,
  source: string,
  ctx: PackageInstallContext,
): Promise<PackageInstallResult> {
  const written: string[] = [];
  let installed = 0;
  let skipped = 0;
  for (const dependency of dependencies) {
    // A dependency is listed in the detail but not individually previewed, so it
    // has no reviewed body — `installMember` fetches one if it needs to write.
    const outcome = await installMember(dependency, null, target, source, ctx);
    if (outcome === 'installed') installed += 1;
    else skipped += 1;
    written.push(dependency.id);
  }
  // The root goes through the SAME path, reviewed body in hand, plus one guard
  // that only applies to it (see `assertRootTarget`).
  const outcome = await installMember(root, reviewedBody, target, source, ctx, () =>
    assertRootTarget(root, dependencies, target, ctx),
  );
  written.push(root.id);
  return { outcome, installed, skipped, written };
}

/**
 * Installs one member of a package: skip when it is already present, otherwise
 * write it — fetching its body first if the caller has no reviewed one.
 *
 * Every member goes through here, root included, so the preflight can't apply to
 * some and not others. That matters twice over. Skipping BEFORE the fetch means a
 * transient catalog failure can't abort a package whose members are all satisfied
 * (the root needs no network at all), and it stops a request being spent ahead of
 * the skill installer's own "already here, don't download" check. And preflighting
 * with the same predicate the Installed badge uses covers the installers' NARROWER
 * dedup keys — an agent dedups on its name-slug roster id while the badge also
 * matches the source-scoped catalog id, so completing a package after a
 * catalog-side rename would otherwise write a SECOND agent. (Cross-rename
 * idempotency stays deferred update-management; this only keeps the package flow
 * from reaching it, since before packages an installed item was never offered for
 * install at all.)
 *
 * `beforeWrite` runs only when a write is actually going to happen.
 */
async function installMember(
  item: MarketplaceItem,
  reviewedBody: string | null,
  target: SkillInstallTarget | undefined,
  source: string,
  ctx: PackageInstallContext,
  beforeWrite?: () => void,
): Promise<InstallOutcome> {
  if (await ctx.isInstalled(item, target)) return 'skipped';
  const body = reviewedBody ?? (await ctx.fetchBody(item, source));
  beforeWrite?.();
  if (item.type === 'skill') {
    return ctx.installSkill(item, body, ctx.requireSkillTarget(target), source);
  }
  return ctx.installItem(item, body, { boundSkills: ctx.boundSkills(item) });
}

/**
 * Re-checks the chosen target immediately before the root is committed. A skill
 * dependency that was already present never reaches the skill installer's own
 * check (it returns 'skipped' first), so without this the same package, settings
 * and target would behave differently depending on whether the skills happened to
 * be installed already: one needing a write aborts with a clear error, all present
 * proceeds silently. Nothing to re-check when the root is itself a skill (its own
 * write asserts) or when no dependency needed a target.
 */
function assertRootTarget(
  root: MarketplaceItem,
  dependencies: readonly MarketplaceItem[],
  target: SkillInstallTarget | undefined,
  ctx: PackageInstallContext,
): void {
  if (target && root.type !== 'skill' && dependencies.some((member) => member.type === 'skill')) {
    ctx.assertTargetInstallable(target);
  }
}
