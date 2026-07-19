/**
 * Where a Marketplace skill installs: a provider's skill root, at project (this
 * vault) or user (home directory) scope.
 *
 * The three providers offered are the ones that own a distinct skill root —
 * Claude, Codex, and Cursor. OpenCode has no root of its own (it reads Claude's
 * and Codex's), so a Claude/Codex install already covers it and it is not a
 * separate target.
 *
 * The root paths are deliberately duplicated from the provider storage modules
 * (`SkillStorage`, `CodexSkillStorage`, `CursorSkillStorage`) rather than
 * imported: features must not depend on providers (the boundary rule), the same
 * way `features/skills/skillCloning.ts` duplicates `VAULT_SKILL_ROOTS`. They are
 * stable on-disk contracts catalogued in the root CLAUDE.md storage table. A
 * scope only decides whether the (identical) relative root resolves under the
 * vault adapter or the home adapter.
 */

/** A provider whose skill root a skill can install into. Matches the provider id. */
export type SkillProviderTarget = 'claude' | 'codex' | 'cursor';

/** Project = this vault's dot-folder; user = the same path under the home dir. */
export type SkillInstallScope = 'project' | 'user';

export interface SkillInstallTarget {
  provider: SkillProviderTarget;
  scope: SkillInstallScope;
}

/** Skill root for each provider, relative to the vault (project) or home (user) root. */
const SKILL_ROOT_BY_PROVIDER: Record<SkillProviderTarget, string> = {
  // Codex also reads `.agents/skills`, but `.codex/skills` is its canonical
  // writable root (CodexSkillStorage.save defaults to it), so it's the target.
  claude: '.claude/skills',
  codex: '.codex/skills',
  cursor: '.cursor/skills',
};

export const SKILL_PROVIDER_TARGETS: readonly SkillProviderTarget[] = ['claude', 'codex', 'cursor'];
export const SKILL_INSTALL_SCOPES: readonly SkillInstallScope[] = ['project', 'user'];

/** The default target the detail view opens on. */
export const DEFAULT_SKILL_TARGET: SkillInstallTarget = { provider: 'claude', scope: 'project' };

export function isSkillProviderTarget(value: unknown): value is SkillProviderTarget {
  return value === 'claude' || value === 'codex' || value === 'cursor';
}

export function isSkillInstallScope(value: unknown): value is SkillInstallScope {
  return value === 'project' || value === 'user';
}

/** The skill root for a target, relative to the vault (project) or home (user) root. */
export function skillRootFor(target: SkillInstallTarget): string {
  return SKILL_ROOT_BY_PROVIDER[target.provider];
}

/**
 * True when a relative path contains a segment that is unsafe to write under its
 * intended folder: `..` traversal, an absolute or Windows drive/UNC prefix, a
 * backslash separator, or an EMPTY segment (`a//b`, a trailing `/`). An empty
 * segment matters because its normalized on-disk form differs from its raw form
 * — `scripts//run.mjs` collapses to `scripts/run.mjs` — which is exactly how two
 * raw-distinct catalog entries can silently write to one destination. The catalog
 * is untrusted, so both the manifest sanitizer (`catalogTypes`) and the installer
 * reject skill files that match — shared here so the two guards can't drift.
 */
export function hasUnsafePathSegment(path: string): boolean {
  return (
    path.includes('..') ||
    path.startsWith('/') ||
    path.includes('\\') ||
    /^[A-Za-z]:/.test(path) ||
    path.includes('//') ||
    path.endsWith('/')
  );
}
