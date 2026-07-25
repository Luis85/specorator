/**
 * Installs a resolved package: every dependency in resolution order, then the
 * item itself. Kept out of the Pinia store so the ordering rules — dependencies
 * first, the reviewed body only for the root, the fail-before-the-root contract —
 * are testable without a plugin, and so the store stays a thin reactive shell.
 *
 * The three I/O seams (`fetchBody`, `installSkill`, `installItem`) are injected:
 * skill installs must go through the store's per-destination queue, and the vault
 * deps are rebuilt per write from live settings.
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
    // Skip a dependency that is already there BEFORE fetching anything. Fetching
    // regardless let a transient catalog failure abort a package whose
    // dependencies were all satisfied — blocking even the root, which needs no
    // network at all — and it defeated the skill install's own "already here,
    // don't download" preflight by spending a request before it could run.
    if (await ctx.isInstalled(dependency, target)) {
      skipped += 1;
      written.push(dependency.id);
      continue;
    }
    // A dependency is listed in the detail but not individually previewed, so its
    // body is fetched here rather than passed in like the root's reviewed one.
    const body = await ctx.fetchBody(dependency, source);
    const outcome = await installOne(dependency, body, target, source, ctx);
    if (outcome === 'installed') installed += 1;
    else skipped += 1;
    written.push(dependency.id);
  }
  // Preflight the root with the SAME predicate the Installed badge uses, exactly
  // like a dependency. Completing a partly-installed package re-runs the root,
  // and the installers dedup on a NARROWER key than the badge does — an agent
  // dedups on its name-slug roster id while the badge also matches the
  // source-scoped catalog id, so a catalog-side rename would slip past the
  // installer and write a SECOND agent. (Cross-rename idempotency is deferred
  // update-management; this only stops the package flow from tripping it, since
  // before packages an installed root was never offered for install at all.)
  let outcome: InstallOutcome = 'skipped';
  if (!(await ctx.isInstalled(root, target))) {
    // Re-check the target only when actually committing the root. A skill
    // dependency that was already present never reaches the skill installer's own
    // check (it returns 'skipped' first), so without this the SAME package,
    // settings and target behave differently depending on whether the skills
    // happened to be installed already: one skill needing a write aborts with a
    // clear error, all present proceeds silently. Skipped when the root is itself
    // a skill (its own write asserts) or no dependency needed a target at all.
    if (target && root.type !== 'skill' && dependencies.some((member) => member.type === 'skill')) {
      ctx.assertTargetInstallable(target);
    }
    outcome = await installOne(root, reviewedBody, target, source, ctx);
  }
  written.push(root.id);
  return { outcome, installed, skipped, written };
}

async function installOne(
  item: MarketplaceItem,
  body: string,
  target: SkillInstallTarget | undefined,
  source: string,
  ctx: PackageInstallContext,
): Promise<InstallOutcome> {
  if (item.type === 'skill') {
    return ctx.installSkill(item, body, ctx.requireSkillTarget(target), source);
  }
  return ctx.installItem(item, body, { boundSkills: ctx.boundSkills(item) });
}
