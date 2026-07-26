/**
 * The install contract shared by `MarketplaceInstaller` (notes + agents) and
 * `skillInstall` (multi-file skill folders). Kept in its own module so the two
 * installers never import each other.
 */
import type { Vault } from 'obsidian';

import type { HomeFileAdapter } from '../../core/storage/HomeFileAdapter';
import type { VaultFileAdapter } from '../../core/storage/VaultFileAdapter';
import type { AgentRosterStore } from '../agents/roster/AgentRosterStore';

export type InstallOutcome = 'installed' | 'skipped';

export interface MarketplaceInstallOptions {
  /**
   * Skill names to grant an installed agent — the skills from its package
   * (`requires`), which the store has already installed by the time the agent is
   * written. Name-keyed, matching how the roster editor and
   * `VaultSkillAggregator` identify a skill. Ignored for non-agent items, and
   * for an agent that already exists (that install is skipped, and re-granting
   * skills on a user-owned agent is an update-management concern, not an install).
   */
  boundSkills?: readonly string[];
}

export interface MarketplaceInstallDeps {
  vault: Vault;
  adapter: VaultFileAdapter;
  /** Home-dir adapter for user-scope skill installs (writes outside the vault). */
  homeAdapter: HomeFileAdapter;
  rosterStore: AgentRosterStore;
  loopFolder: string;
  templateFolder: string;
  quickActionsFolder: string;
  /** Resolved catalog base URL the install ran against (`marketplaceSourceUrl`).
   *  Scopes agent catalog-id matching to its source. */
  catalogUrl: string;
}
