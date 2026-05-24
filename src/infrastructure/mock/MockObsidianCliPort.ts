/**
 * Scriptable `ObsidianCliPort` for unit tests and standalone dev (no real
 * `obsidian` binary). Records every call and returns per-command scripted
 * outcomes; unscripted commands return a benign default `ok` result.
 *
 * SPEC-OCM-001 §3. Used by `registerObsidianCliTools` tests and `npm run dev`.
 */
import type {
  ObsidianCliPort,
  ObsidianCliInvocation,
} from '@/domain/ports'
import { ObsidianCliError } from '@/domain/ports'
import { ok, err, type Result } from '@/domain/shared/Result'

interface RecordedCall {
  readonly command: string
  readonly args: readonly string[]
  readonly json: boolean
}

export class MockObsidianCliPort implements ObsidianCliPort {
  available = true

  readonly calls: RecordedCall[] = []

  private readonly _jsonResponses = new Map<string, Result<unknown, ObsidianCliError>>()
  private readonly _runResponses = new Map<string, Result<ObsidianCliInvocation, ObsidianCliError>>()

  /** Script a successful JSON response for `runJson(command, …)`. */
  setJson(command: string, value: unknown): this {
    this._jsonResponses.set(command, ok(value))
    return this
  }

  /** Script a JSON-path error for `runJson(command, …)`. */
  setJsonError(command: string, error: ObsidianCliError): this {
    this._jsonResponses.set(command, err(error))
    return this
  }

  /** Script a successful raw response for `run(command, …)`. */
  setRun(command: string, value: ObsidianCliInvocation): this {
    this._runResponses.set(command, ok(value))
    return this
  }

  /** Script a raw-path error for `run(command, …)`. */
  setRunError(command: string, error: ObsidianCliError): this {
    this._runResponses.set(command, err(error))
    return this
  }

  async run(
    command: string,
    args: readonly string[] = [],
  ): Promise<Result<ObsidianCliInvocation, ObsidianCliError>> {
    this.calls.push({ command, args, json: false })
    if (!this.available) {
      return err(new ObsidianCliError('not-configured', 'No Obsidian CLI path is configured.'))
    }
    return this._runResponses.get(command) ?? ok({ stdout: '', stderr: '', exitCode: 0 })
  }

  async runJson(
    command: string,
    args: readonly string[] = [],
  ): Promise<Result<unknown, ObsidianCliError>> {
    this.calls.push({ command, args, json: true })
    if (!this.available) {
      return err(new ObsidianCliError('not-configured', 'No Obsidian CLI path is configured.'))
    }
    return this._jsonResponses.get(command) ?? ok({})
  }
}
