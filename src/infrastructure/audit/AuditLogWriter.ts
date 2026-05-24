/**
 * T-MHP-031 (companion module) — AuditLogWriter strict variant.
 *
 * Same JSONL contract as `src/infrastructure/obsidian/audit/AuditLogWriter.ts`
 * but enforces a fail-closed invariant on `paths[*]`: any backslash in a
 * persisted row is rejected (`ok: false`). Upstream registrars are
 * responsible for normalising to POSIX before calling this writer
 * (REQ-MHP-023, NFR-MHP-014). A bad row reaching this writer signals a
 * registrar bug — failing closed surfaces it rather than silently
 * laundering the path through normalisation.
 *
 * Satisfies: REQ-MHP-022, REQ-MHP-023, REQ-MHP-024, REQ-MHP-025, REQ-MHP-026,
 *            NFR-MHP-007, NFR-MHP-008, NFR-MHP-014.
 */
import type { VaultPort, LoggerPort, NotificationPort } from '@/domain/ports'
import type { AuditRow } from '@/domain/mcp/Proposal'
import { ok, err, type Result } from '@/domain/shared/Result'

export interface AuditLogWriterDeps {
  readonly vault: VaultPort
  readonly logger: LoggerPort
  readonly notify: NotificationPort
  readonly specoratorFolder: string
  readonly maxSizeBytes: number
  readonly maxRotations: number
}

export class AuditWriteError extends Error {
  readonly kind: 'filesystem' | 'invalid-path'
  constructor(message: string, kind: 'filesystem' | 'invalid-path' = 'filesystem') {
    super(message)
    this.name = 'AuditWriteError'
    this.kind = kind
  }
}

const STICKY_ERROR_COPY =
  'Could not write MCP audit row. Vault mutation completed; audit log is now incomplete.'

function noop(): void {
  /* intentionally empty */
}

export class AuditLogWriter {
  private readonly vault: VaultPort
  private readonly logger: LoggerPort
  private readonly notify: NotificationPort
  private readonly folder: string
  private readonly logPath: string
  private readonly maxSizeBytes: number
  private readonly maxRotations: number
  private lock: Promise<void> = Promise.resolve()
  private folderEnsured = false

  constructor(deps: AuditLogWriterDeps) {
    this.vault = deps.vault
    this.logger = deps.logger
    this.notify = deps.notify
    this.folder = deps.specoratorFolder
    this.logPath = `${deps.specoratorFolder}/mcp-audit.log`
    this.maxSizeBytes = deps.maxSizeBytes
    this.maxRotations = deps.maxRotations
  }

  async append(row: AuditRow): Promise<Result<void, AuditWriteError>> {
    const previous = this.lock
    const next = previous.then(() => this.appendCritical(row))
    this.lock = next.then(noop, noop)
    return next
  }

  private async appendCritical(row: AuditRow): Promise<Result<void, AuditWriteError>> {
    // Fail-closed POSIX invariant — backslash anywhere in paths[*] is a bug.
    for (const p of row.proposal.paths) {
      if (p.includes('\\')) {
        const error = new AuditWriteError(
          `audit row path contains backslash: ${p}`,
          'invalid-path',
        )
        this.logger.error('audit-log rejected non-POSIX path', error, { path: p })
        return err(error)
      }
    }

    try {
      const line = JSON.stringify(row) + '\n'
      await this.ensureFolder()

      const currentText = await this.readIfExists(this.logPath)
      if (currentText.length > 0 && currentText.length + line.length > this.maxSizeBytes) {
        await this.rotate()
        await this.vault.writeFile(this.logPath, line)
      } else {
        await this.vault.writeFile(this.logPath, currentText + line)
      }
      return ok(undefined)
    } catch (cause) {
      const error = new AuditWriteError(
        cause instanceof Error ? cause.message : String(cause),
      )
      this.logger.error('audit-log append failed', cause, { path: this.logPath })
      this.notify.showError(STICKY_ERROR_COPY)
      return err(error)
    }
  }

  private async ensureFolder(): Promise<void> {
    if (this.folderEnsured) return
    await this.vault.createFolder(this.folder)
    this.folderEnsured = true
  }

  private async rotate(): Promise<void> {
    const oldestPath = `${this.logPath}.${this.maxRotations}`
    if (await this.vault.fileExists(oldestPath)) {
      await this.vault.deleteFile(oldestPath)
    }
    for (let i = this.maxRotations - 1; i >= 1; i--) {
      const src = `${this.logPath}.${i}`
      const dst = `${this.logPath}.${i + 1}`
      if (await this.vault.fileExists(src)) {
        const content = await this.vault.readFile(src)
        await this.vault.writeFile(dst, content)
        await this.vault.deleteFile(src)
      }
    }
    if (await this.vault.fileExists(this.logPath)) {
      const content = await this.vault.readFile(this.logPath)
      await this.vault.writeFile(`${this.logPath}.1`, content)
      await this.vault.deleteFile(this.logPath)
    }
  }

  private async readIfExists(path: string): Promise<string> {
    if (!(await this.vault.fileExists(path))) return ''
    return this.vault.readFile(path)
  }
}
