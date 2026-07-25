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
  /** Resolves the target for a skill write, throwing when none was chosen. */
  requireSkillTarget: (target?: SkillInstallTarget) => SkillInstallTarget;
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
    // A dependency is listed in the detail but not individually previewed, so its
    // body is fetched here rather than passed in like the root's reviewed one.
    const body = await ctx.fetchBody(dependency, source);
    const outcome = await installOne(dependency, body, target, source, ctx);
    if (outcome === 'installed') installed += 1;
    else skipped += 1;
    written.push(dependency.id);
  }
  const outcome = await installOne(root, reviewedBody, target, source, ctx);
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
