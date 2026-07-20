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
 * Windows reserved device names (case-insensitive), matched against a path
 * segment's base name (before its first dot) — `con`, `nul`, and `com1.txt` all
 * name the CON/NUL/COM1 device on Windows and can't be a file or folder there.
 * `com0`/`lpt0` aren't reserved; `com1`-`com9`/`lpt1`-`lpt9` are — and so are the
 * superscript forms `com¹`-`com³`/`lpt¹`-`lpt³` (U+00B9/B2/B3), which Windows maps
 * to the COM1-3/LPT1-3 devices too.
 */
const RESERVED_DEVICE_NAME = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i;

/** True when `name` (a single path segment, or a slug) is a Windows device name. */
export function isReservedDeviceName(name: string): boolean {
  return RESERVED_DEVICE_NAME.test(name);
}

// Characters Windows forbids in a filename. A segment
// also can't end in a dot or space — Windows silently trims those, so the file
// would land at a different path than the one we validated and recorded.
const WINDOWS_ILLEGAL_CHAR = /[<>:"|?*]/;

// Control characters (U+0000–U+001F) are illegal in Windows filenames. Detected
// by code point rather than a regex range so no raw control byte is embedded in
// this source file.
function hasControlChar(segment: string): boolean {
  for (let i = 0; i < segment.length; i += 1) {
    if (segment.charCodeAt(i) < 0x20) return true;
  }
  return false;
}

/** True when a single path segment can't be created portably (Windows rules). */
function isWindowsInvalidSegment(segment: string): boolean {
  if (WINDOWS_ILLEGAL_CHAR.test(segment) || hasControlChar(segment)) return true;
  if (segment.endsWith('.') || segment.endsWith(' ')) return true;
  return isReservedDeviceName(segment.split('.')[0]);
}

/** Structural escapes: traversal, absolute/drive/UNC prefix, backslash, empty segment. */
function hasUnsafeStructure(path: string): boolean {
  return (
    path.includes('..') ||
    path.startsWith('/') ||
    path.includes('\\') ||
    /^[A-Za-z]:/.test(path) ||
    path.includes('//') ||
    path.endsWith('/')
  );
}

/**
 * True when a relative path contains a segment that is unsafe to write under its
 * intended folder: a structural escape (`..` traversal, an absolute or Windows
 * drive/UNC prefix, a backslash separator, or an EMPTY segment — `a//b`, a
 * trailing `/`), OR a segment no filesystem could portably create: a Windows
 * reserved device name (`con`, `nul.txt`), an illegal character (`<>:"|?*` or a control code), or a trailing dot/space. An empty segment matters because its
 * normalized on-disk form differs from its raw form (`scripts//run.mjs` collapses
 * to `scripts/run.mjs`), which is how two raw-distinct catalog entries can
 * silently write to one destination; the Windows rules keep a skill's
 * installability from silently depending on the user's OS (a `scripts/con.txt`
 * file would install on macOS/Linux but fail on Windows). The catalog is
 * untrusted, so both the manifest sanitizer (`catalogTypes`) and the installer
 * reject skill files that match — shared here so the two guards can't drift.
 */
export function hasUnsafePathSegment(path: string): boolean {
  return hasUnsafeStructure(path) || path.split('/').some(isWindowsInvalidSegment);
}
