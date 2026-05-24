/**
 * T-MHP-031 — AuditLogWriter (SPEC-MHP-035).
 *
 * JSONL append-only writer at `<specoratorFolder>/mcp-audit.log`. Rotates on
 * size threshold (`maxSizeBytes`, default 2 MiB) keeping at most
 * `maxRotations` historic files (default 5). Paths inside the persisted row
 * are normalised to POSIX (backslash → forward slash) before serialisation
 * per REQ-MHP-023 + NFR-MHP-014.
 *
 * Failure-handling per REQ-MHP-025: any filesystem error is logged via
 * `LoggerPort.error` and surfaced via a sticky `NotificationPort.showError`;
 * the caller receives an `ok: false` Result so the MCP response can still
 * report the underlying vault-mutation outcome.
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
  readonly kind = 'filesystem' as const
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'AuditWriteError'
  }
}

const STICKY_ERROR_COPY =
  'Could not write MCP audit row. Vault mutation completed; audit log is now incomplete.'

/** Explicit no-op for promise-chain bookkeeping (lint: no-empty-function). */
function noop(): void {
  /* intentionally empty */
}

/**
 * Normalise every `paths[*]` entry on the row to POSIX. The structural
 * properties of `AuditRow` are preserved; only the `proposal.paths` array
 * is rewritten so the JSONL persistence is platform-stable.
 */
function normaliseRowToPosix(row: AuditRow): AuditRow {
  const normalised = row.proposal.paths.map((p) => p.replace(/\\/g, '/'))
  // Reference-equal short-circuit: no backslashes anywhere → reuse row.
  let changed = false
  for (let i = 0; i < normalised.length; i++) {
    if (normalised[i] !== row.proposal.paths[i]) {
      changed = true
      break
    }
  }
  if (!changed) return row
  return {
    ...row,
    proposal: { ...row.proposal, paths: normalised },
  }
}

export class AuditLogWriter {
  private readonly vault: VaultPort
  private readonly logger: LoggerPort
  private readonly notify: NotificationPort
  private readonly folder: string
  private readonly logPath: string
  private readonly maxSizeBytes: number
  private readonly maxRotations: number
  /** Serialises every append via promise-chain (single in-process writer). */
  private lock: Promise<void> = Promise.resolve()
  /** Tracks whether `.specorator/` has already been ensured this session. */
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

  /**
   * Append one JSONL row. Rotates the active log first when the next write
   * would cross `maxSizeBytes`. Returns `ok` on success; `err` on any
   * filesystem failure (already routed through LoggerPort + NotificationPort).
   */
  async append(row: AuditRow): Promise<Result<void, AuditWriteError>> {
    // Chain onto the existing lock so writes serialise.
    const previous = this.lock
    const next = previous.then(() => this.appendCritical(row))
    // Swallow the result so the lock chain never rejects (errors are surfaced
    // through the returned Result to the caller).
    this.lock = next.then(noop, noop)
    return next
  }

  private async appendCritical(row: AuditRow): Promise<Result<void, AuditWriteError>> {
    try {
      const normalised = normaliseRowToPosix(row)
      const line = JSON.stringify(normalised) + '\n'

      await this.ensureFolder()

      // Read current contents (treat absent as empty).
      const currentText = await this.readIfExists(this.logPath)
      const projectedSize = currentText.length + line.length

      if (currentText.length > 0 && projectedSize > this.maxSizeBytes) {
        await this.rotate()
        // After rotation, the active log is empty; write only the new line.
        await this.vault.writeFile(this.logPath, line)
      } else {
        await this.vault.writeFile(this.logPath, currentText + line)
      }

      return ok(undefined)
    } catch (cause) {
      const error = new AuditWriteError(
        cause instanceof Error ? cause.message : String(cause),
        cause,
      )
      this.logger.error('audit-log append failed', cause, { path: this.logPath })
      this.notify.showError(STICKY_ERROR_COPY)
      return err(error)
    }
  }

  /**
   * Ensure `<specoratorFolder>/` exists. Idempotent; the first successful
   * call short-circuits subsequent invocations.
   */
  private async ensureFolder(): Promise<void> {
    if (this.folderEnsured) return
    // Best-effort: `createFolder` is idempotent in both production
    // (ObsidianBridge swallows EEXIST) and test (MockBridge Set).
    await this.vault.createFolder(this.folder)
    this.folderEnsured = true
  }

  /**
   * Atomic-ish rotation per SPEC-MHP-035 step 5:
   *   1. delete `.log.<maxRotations>` if present
   *   2. for i in maxRotations-1..1: rename `.log.<i>` → `.log.<i+1>`
   *   3. rename `mcp-audit.log` → `mcp-audit.log.1`
   *
   * VaultPort exposes only read/write/delete (no rename), so each shift is a
   * read+write+delete. The current log is removed last; on failure mid-shift
   * the caller surfaces the error through `appendCritical`.
   */
  private async rotate(): Promise<void> {
    // 1. Delete the oldest slot if present.
    const oldestPath = `${this.logPath}.${this.maxRotations}`
    if (await this.vault.fileExists(oldestPath)) {
      await this.vault.deleteFile(oldestPath)
    }
    // 2. Shift down from .(N-1) → .N, .(N-2) → .(N-1), ... .1 → .2.
    for (let i = this.maxRotations - 1; i >= 1; i--) {
      const src = `${this.logPath}.${i}`
      const dst = `${this.logPath}.${i + 1}`
      if (await this.vault.fileExists(src)) {
        const content = await this.vault.readFile(src)
        await this.vault.writeFile(dst, content)
        await this.vault.deleteFile(src)
      }
    }
    // 3. Active log → .1.
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
