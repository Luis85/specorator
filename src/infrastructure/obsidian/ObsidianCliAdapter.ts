/**
 * T-OCM-002 — Production implementation of `ObsidianCliPort` (ADR-018).
 *
 * Spawns the official `obsidian` CLI binary **without a shell** (arguments as an
 * array, REQ-OCM-007), bounds each call with a timeout (NFR-OCM-004), and maps
 * spawn/exit/timeout/parse outcomes to a typed `ObsidianCliError` — it never throws.
 *
 * Spec reference: SPEC-OCM-001 §3 / DESIGN §D3.
 *
 * `spawn` and `resolvePath` are injected so the adapter is testable without a real
 * binary and so PATH/settings changes between calls are honoured (the closure is
 * read fresh on every invocation).
 */
import type { EventEmitter } from 'node:events'
import type {
  ObsidianCliPort,
  ObsidianCliInvocation,
} from '@/domain/ports'
import { ObsidianCliError } from '@/domain/ports'
import { ok, err, type Result } from '@/domain/shared/Result'

/** Minimal `ChildProcess`-shaped surface the adapter consumes. */
interface ChildProcessLike extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: unknown
}

/** Injectable spawn signature — compatible with `node:child_process` `spawn`. */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  options?: Record<string, unknown>,
) => ChildProcessLike

export interface ObsidianCliAdapterDeps {
  /** Process spawn function (injected for test isolation). */
  spawn: SpawnFn
  /** Returns the configured absolute CLI path, or `''` when unset. */
  resolvePath: () => string
  /** Override the 15 s default per-invocation timeout (milliseconds). */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 15_000

export class ObsidianCliAdapter implements ObsidianCliPort {
  private readonly _spawn: SpawnFn
  private readonly _resolvePath: () => string
  private readonly _timeoutMs: number

  constructor(deps: ObsidianCliAdapterDeps) {
    this._spawn = deps.spawn
    this._resolvePath = deps.resolvePath
    this._timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  get available(): boolean {
    return this._resolvePath().trim() !== ''
  }

  async run(
    command: string,
    args: readonly string[] = [],
  ): Promise<Result<ObsidianCliInvocation, ObsidianCliError>> {
    const bin = this._resolvePath().trim()
    if (bin === '') {
      return err(
        new ObsidianCliError('not-configured', 'No Obsidian CLI path is configured.'),
      )
    }

    return new Promise<Result<ObsidianCliInvocation, ObsidianCliError>>((resolve) => {
      let child: ChildProcessLike
      try {
        child = this._spawn(bin, [command, ...args])
      } catch (e) {
        resolve(err(new ObsidianCliError('spawn-failed', describe(e))))
        return
      }

      let stdout = ''
      let stderr = ''
      let settled = false
      const settle = (value: Result<ObsidianCliInvocation, ObsidianCliError>): void => {
        if (settled) return
        settled = true
        // eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
        clearTimeout(timeoutHandle)
        resolve(value)
      }

      // eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
      const timeoutHandle = setTimeout(() => {
        try {
          if (typeof child.kill === 'function') {
            ;(child.kill as (signal?: string) => unknown)()
          }
        } catch {
          // Ignore — child may already be gone.
        }
        settle(
          err(
            new ObsidianCliError('timeout', `Obsidian CLI \`${command}\` timed out.`, { stderr }),
          ),
        )
      }, this._timeoutMs)

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      })
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      })

      child.on('error', (e: unknown) => {
        settle(err(new ObsidianCliError('spawn-failed', describe(e), { stderr })))
      })

      child.on('close', (exitCode: number | null) => {
        if (exitCode !== 0 && exitCode !== null) {
          settle(
            err(
              new ObsidianCliError(
                'nonzero-exit',
                `Obsidian CLI \`${command}\` exited with code ${exitCode}.`,
                { exitCode, stderr },
              ),
            ),
          )
          return
        }
        settle(ok({ stdout, stderr, exitCode }))
      })
    })
  }

  async runJson(
    command: string,
    args: readonly string[] = [],
  ): Promise<Result<unknown, ObsidianCliError>> {
    const outcome = await this.run(command, [...args, 'format=json'])
    if (!outcome.ok) return outcome
    const trimmed = outcome.value.stdout.trim()
    try {
      return ok(JSON.parse(trimmed) as unknown)
    } catch {
      return err(
        new ObsidianCliError('invalid-json', `Obsidian CLI \`${command}\` returned non-JSON output.`),
      )
    }
  }
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
