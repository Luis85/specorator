/**
 * T-MHP-111 — `MigrationService` (SPEC-MHP-038).
 *
 * Migrates the vault-root `.mcp.json` to `.obsidian/mcp.local.json` exactly
 * once per session. Re-serialises via `JSON.stringify(value, null, 2)` and
 * verifies via deep-equality read-back before deleting the source file. On
 * any verification or filesystem failure the root file is preserved
 * (NFR-MHP-013) and a sticky error notice is surfaced.
 *
 * Also ensures `.gitignore` carries an exact-line `.obsidian/mcp.local.json`
 * entry with LF line endings (REQ-MHP-031, CLAR-MHP-014).
 *
 * Satisfies: REQ-MHP-027, REQ-MHP-028, REQ-MHP-029, REQ-MHP-030, REQ-MHP-031;
 *            NFR-MHP-010, NFR-MHP-013.
 */
import type { VaultPort, LoggerPort, NotificationPort } from '@/domain/ports'

export type MigrationOutcome =
  | 'noop'
  | 'success'
  | 'success-gitignore-failed'
  | 'failed'

export interface MigrationServiceDeps {
  readonly vault: VaultPort
  readonly logger: LoggerPort
  readonly notify: NotificationPort
}

// SPEC-MHP-038 hardcodes the migration target at `.obsidian/mcp.local.json`
// because the file is consumed by external MCP clients that resolve the path
// literally (Cursor, Claude Code). Per-user `configDir` overrides are not in
// scope; see SPEC-MHP-038 + CLAR-MHP-015. The generic obsidianmd lint rule
// does not have visibility into that contract — disable per-line.
const ROOT_FILE = '.mcp.json'
/* eslint-disable obsidianmd/hardcoded-config-path */
const OBSIDIAN_FOLDER = '.obsidian'
const TARGET_FILE = `${OBSIDIAN_FOLDER}/mcp.local.json`
const GITIGNORE = '.gitignore'

const CONFLICT_NOTICE =
  'Both .mcp.json and .obsidian/mcp.local.json exist. Resolve manually before reload.'
const VERIFY_FAILED_NOTICE =
  'Migration of .mcp.json failed verification. Original file preserved; resolve manually.'
const SUCCESS_NOTICE =
  'Migrated .mcp.json → .obsidian/mcp.local.json. Original removed.'
const SUCCESS_GITIGNORE_FAILED_NOTICE =
  'Migrated .mcp.json → .obsidian/mcp.local.json, but updating .gitignore failed.'
const PARSE_FAILED_NOTICE =
  'Could not parse .mcp.json — migration aborted. Original file preserved.'
/* eslint-enable obsidianmd/hardcoded-config-path */

function deepEqualArrays(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!deepEqual(a[i], b[i])) return false
  }
  return true
}

function deepEqualObjects(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const ak = Object.keys(a)
  if (ak.length !== Object.keys(b).length) return false
  for (const k of ak) {
    if (!deepEqual(a[k], b[k])) return false
  }
  return true
}

/**
 * Deep structural equality over JSON-shaped values. Arrays compare
 * element-wise; plain objects compare key-set then per-key.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  const aIsArr = Array.isArray(a)
  const bIsArr = Array.isArray(b)
  if (aIsArr !== bIsArr) return false
  if (aIsArr && bIsArr) return deepEqualArrays(a, b)
  return deepEqualObjects(a as Record<string, unknown>, b as Record<string, unknown>)
}

export class MigrationService {
  private readonly vault: VaultPort
  private readonly logger: LoggerPort
  private readonly notify: NotificationPort

  constructor(deps: MigrationServiceDeps) {
    this.vault = deps.vault
    this.logger = deps.logger
    this.notify = deps.notify
  }

  /**
   * Run the migration. Safe to invoke repeatedly: a session that already
   * migrated reports `'noop'` on subsequent calls because the root file is
   * gone.
   */
  async runOnce(): Promise<MigrationOutcome> {
    const rootExists = await this.vault.fileExists(ROOT_FILE)
    if (!rootExists) return 'noop'

    // SPEC step 1a — both files present → conflict; never touch either side.
    if (await this.vault.fileExists(TARGET_FILE)) {
      this.notify.showError(CONFLICT_NOTICE)
      this.logger.warn('mcp migration: both files present; manual resolution required')
      return 'failed'
    }

    // Read + parse source.
    let srcValue: unknown
    try {
      const srcText = await this.vault.readFile(ROOT_FILE)
      srcValue = JSON.parse(srcText)
    } catch (cause) {
      this.logger.error('mcp migration: failed to parse .mcp.json', cause)
      this.notify.showError(PARSE_FAILED_NOTICE)
      return 'failed'
    }

    // Re-serialise with 2-space indent.
    const outText = JSON.stringify(srcValue, null, 2)

    // Write target, verify deep-equal, delete root.
    try {
      await this.ensureObsidianFolder()
      await this.vault.writeFile(TARGET_FILE, outText)

      const verifyText = await this.vault.readFile(TARGET_FILE)
      let verifyValue: unknown
      try {
        verifyValue = JSON.parse(verifyText)
      } catch (cause) {
        await this.rollbackPartialTarget()
        this.logger.error('mcp migration: verify-read parse failed', cause)
        this.notify.showError(VERIFY_FAILED_NOTICE)
        return 'failed'
      }
      if (!deepEqual(srcValue, verifyValue)) {
        await this.rollbackPartialTarget()
        this.logger.warn('mcp migration: verify deep-equal mismatch; rolled back')
        this.notify.showError(VERIFY_FAILED_NOTICE)
        return 'failed'
      }

      // Verified — safe to delete the root file.
      await this.vault.deleteFile(ROOT_FILE)
    } catch (cause) {
      // Any filesystem failure before root deletion is a 'failed' outcome.
      await this.rollbackPartialTarget()
      this.logger.error('mcp migration: write/verify failed', cause)
      this.notify.showError(VERIFY_FAILED_NOTICE)
      return 'failed'
    }

    // .gitignore ensure (REQ-MHP-031, CLAR-MHP-014).
    try {
      await this.ensureGitignoreLine()
    } catch (cause) {
      this.logger.error('mcp migration: gitignore update failed', cause)
      this.notify.showWarning(SUCCESS_GITIGNORE_FAILED_NOTICE)
      return 'success-gitignore-failed'
    }

    this.notify.showSuccess(SUCCESS_NOTICE)
    return 'success'
  }

  private async ensureObsidianFolder(): Promise<void> {
    // Best-effort idempotent folder create — Obsidian's `.obsidian/` is
    // usually present, but we handle a freshly-cloned vault too.
    await this.vault.createFolder(OBSIDIAN_FOLDER)
  }

  /**
   * Best-effort rollback after a verify failure: delete the partially-written
   * target so the next run does not trip the both-files-present conflict.
   */
  private async rollbackPartialTarget(): Promise<void> {
    try {
      if (await this.vault.fileExists(TARGET_FILE)) {
        await this.vault.deleteFile(TARGET_FILE)
      }
    } catch (cause) {
      this.logger.warn('mcp migration: rollback delete failed', { cause: String(cause) })
    }
  }

  /**
   * Ensure `.gitignore` contains an exact-line `TARGET_FILE` entry.
   * Idempotent; LF line endings only.
   */
  private async ensureGitignoreLine(): Promise<void> {
    const exists = await this.vault.fileExists(GITIGNORE)
    if (!exists) {
      await this.vault.writeFile(GITIGNORE, `${TARGET_FILE}\n`)
      return
    }
    const current = await this.vault.readFile(GITIGNORE)
    const lines = current.split('\n').map((l) => l.replace(/\r$/, ''))
    if (lines.some((l) => l === TARGET_FILE)) return
    const suffix = current.endsWith('\n') ? '' : '\n'
    await this.vault.writeFile(GITIGNORE, `${current}${suffix}${TARGET_FILE}\n`)
  }
}
