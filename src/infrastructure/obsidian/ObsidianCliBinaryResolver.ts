/**
 * T-OCM-003 — PATH discovery for the official `obsidian` CLI binary.
 *
 * Sibling of `ClaudeBinaryResolver` / `CursorBinaryResolver`: discovers the
 * user-installed `obsidian` binary on PATH via a short-lived child process. The
 * caller (`settings.ts` autodetect handler) handles precedence — an explicit
 * `obsidianCliPath` setting wins; this class only does PATH-based discovery.
 *
 * Satisfies: REQ-OCM-008 (PATH discovery + first-line + isAbsolute validation),
 *            REQ-OCM-009 (null on any failure), NFR-OCM-004 (5 s timeout).
 *
 * Spec reference: SPEC-OCM-001 §4 / DESIGN §D4.
 *
 * Discovery commands:
 *   - darwin, linux: `sh -lc 'command -v obsidian'`
 *   - win32:         `where.exe obsidian`
 */
import * as path from 'node:path'
import type { EventEmitter } from 'node:events'

/** Minimal `ChildProcess`-shaped surface the resolver consumes. */
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

export type ResolverPlatform = 'darwin' | 'linux' | 'win32'

export interface ObsidianCliBinaryResolverDeps {
  /** Process spawn function (injected for test isolation). */
  spawn: SpawnFn
  /** Platform identifier (injected so all three branches are exercisable). */
  platform: ResolverPlatform
  /** Override the 5 s default timeout (milliseconds). */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 5_000

export class ObsidianCliBinaryResolver {
  private readonly _spawn: SpawnFn
  private readonly _platform: ResolverPlatform
  private readonly _timeoutMs: number

  constructor(deps: ObsidianCliBinaryResolverDeps) {
    this._spawn = deps.spawn
    this._platform = deps.platform
    this._timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  /**
   * Spawn the platform-specific discovery command and resolve to the first
   * absolute path written to stdout. Returns `null` on any failure mode
   * (spawn error, non-zero exit with no usable stdout, empty stdout, relative
   * path, alias-like output, or 5 s timeout).
   */
  async resolve(): Promise<string | null> {
    const { command, args } = this._discoveryInvocation()

    return new Promise<string | null>((resolve) => {
      let child: ChildProcessLike
      try {
        child = this._spawn(command, args)
      } catch {
        resolve(null)
        return
      }

      let stdoutBuffer = ''
      let settled = false
      const settle = (value: string | null): void => {
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
        settle(null)
      }, this._timeoutMs)

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdoutBuffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      })

      child.on('error', () => {
        settle(null)
      })

      child.on('close', (exitCode: number | null) => {
        settle(parseDiscoveryOutput(stdoutBuffer, exitCode, this._platform))
      })
    })
  }

  private _discoveryInvocation(): { command: string; args: readonly string[] } {
    if (this._platform === 'win32') {
      return { command: 'where.exe', args: ['obsidian'] }
    }
    return { command: 'sh', args: ['-lc', 'command -v obsidian'] }
  }
}

function parseDiscoveryOutput(
  stdout: string,
  exitCode: number | null,
  platform: ResolverPlatform,
): string | null {
  const lines = stdout.split(/\r?\n/)
  let firstLine: string | null = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length > 0) {
      firstLine = trimmed
      break
    }
  }

  if (firstLine === null) {
    void exitCode
    return null
  }

  const isAbsolute =
    platform === 'win32' ? path.win32.isAbsolute(firstLine) : path.posix.isAbsolute(firstLine)
  if (!isAbsolute) {
    return null
  }

  return firstLine
}
