import type { App } from 'obsidian';

import { toVaultRelativeOpenPath } from '../../utils/fileLink';

/**
 * Vault-adapter-reachable path for a skill's `SKILL.md`, or null when it can't
 * be reached. Claude skills are already vault-relative. Codex skills surface a
 * host-absolute `sourceFilePath` (mapped via `toHostPath`); convert it back to
 * vault-relative when it lives inside the vault. Genuinely out-of-vault
 * (home-scope) paths return null — `VaultFileAdapter` can't read or write them,
 * so callers must treat those skills as read-only rather than writing into a
 * bogus in-vault `/.../.codex/skills/...` hierarchy.
 */
export function resolveSkillVaultPath(app: App, sourceFilePath: string): string | null {
  if (!/^([/~\\]|[A-Za-z]:)/.test(sourceFilePath)) return sourceFilePath;
  return toVaultRelativeOpenPath(app, sourceFilePath);
}
