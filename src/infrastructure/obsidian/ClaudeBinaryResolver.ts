/**
 * T-ASM-009 — Production implementation of `ClaudeBinaryResolver`.
 *
 * Satisfies: REQ-ASM-004 (PATH discovery), REQ-ASM-005 (first-line + isAbsolute
 * validation), NFR-ASM-010 (5 s timeout), NFR-ASM-004 (no `~/.claude/` reads).
 *
 * Spec reference: SPEC-ASM-001 §4 / DESIGN §C6.
 *
 * The caller (`ClaudeSubprocessAdapter.startup()`) handles the
 * "settings.cliPath if non-empty, else resolver" precedence. This class is
 * responsible only for PATH-based discovery via a short-lived child process.
 *
 * Discovery commands:
 *   - darwin, linux: `sh -lc 'command -v claude'`
 *   - win32:         `where.exe claude`
 *
 * Behaviour summary:
 *   1. Spawn the platform-appropriate discovery command.
 *   2. Buffer stdout until `close`.
 *   3. Split into lines; choose the first non-empty (whitespace-trimmed) line.
 *   4. Reject anything that fails `path.isAbsolute` (catches relative paths,
 *      `claude: aliased to ...`, and other non-path output).
 *   5. Cap the discovery call at 5 s — exceeding the cap kills the child and
 *      returns `null`.
 *   6. Spawn errors (e.g. ENOENT for `sh`) and non-zero exits with no usable
 *      stdout return `null`.
 *   7. No caching — each `resolve()` call re-spawns. PATH may change between
 *      Settings-tab "Autodetect" clicks.
 *
 * ToS posture (REQ-ASM-007, NFR-ASM-004, ADR-0031): this file MUST NOT contain
 * the literal strings for the user's home Claude directory or its credentials
 * file. The lint rule in T-ASM-049 enforces this; the tests assert it at
 * runtime as defence-in-depth.
 */
import * as path from 'node:path'
import type { EventEmitter } from 'node:events'

/** Minimal `ChildProcess`-shaped surface the resolver consumes. */
interface ChildProcessLike extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  // `kill` is intentionally typed loosely. Real `ChildProcess.kill` is
  // `(signal?: NodeJS.Signals | number) => boolean`. Tests inject a vitest
  // `vi.fn()` whose declared type is `Mock<Procedure | Constructable>` — a
  // construct-signature intersection that is NOT assignable to a plain call
  // signature. Both shapes are call-compatible at runtime; using `unknown`
  // sidesteps the structural mismatch while still preventing the resolver
  // from accidentally relying on the return value.
  kill: unknown
}

/** Injectable spawn signature — compatible with `node:child_process` `spawn`. */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  options?: Record<string, unknown>,
) => ChildProcessLike

export type ResolverPlatform = 'darwin' | 'linux' | 'win32'

export interface ClaudeBinaryResolverDeps {
  /** Process spawn function (injected for test isolation). */
  spawn: SpawnFn
  /** Platform identifier (injected so all three branches are exercisable). */
  platform: ResolverPlatform
  /** Override the 5 s default timeout (milliseconds). */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 5_000

export class ClaudeBinaryResolver {
  private readonly _spawn: SpawnFn
  private readonly _platform: ResolverPlatform
  private readonly _timeoutMs: number

  constructor(deps: ClaudeBinaryResolverDeps) {
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
          // `kill` is typed `unknown` to be structurally compatible with both
          // the real `ChildProcess.kill` and vitest `vi.fn()` mocks — narrow
          // here before invoking.
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
      return { command: 'where.exe', args: ['claude'] }
    }
    // darwin + linux share the POSIX login shell discovery — `-l` ensures the
    // user's profile-defined PATH (Homebrew, asdf, nvm shims) is loaded so
    // GUI-launched Obsidian sees the same `claude` the user runs in iTerm.
    return { command: 'sh', args: ['-lc', 'command -v claude'] }
  }
}

/**
 * Parse stdout into an absolute path, or `null` if the output does not contain
 * a usable absolute path on its first non-empty line.
 *
 * - Non-zero exit with empty stdout → `null`.
 * - Non-zero exit with stdout content is treated the same as exit 0: callers
 *   like `command -v` may legitimately exit non-zero on missing-binary but
 *   `where.exe` returns absolute paths even when only one of several is found.
 *   In practice, only stdout shape matters for validation.
 */
function parseDiscoveryOutput(
  stdout: string,
  exitCode: number | null,
  platform: ResolverPlatform,
): string | null {
  // Find the first non-empty (trimmed) line.
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
    // Whitespace-only or empty stdout. exitCode irrelevant — nothing to use.
    void exitCode
    return null
  }

  // Validate absolute-path shape — catches relative paths (`./claude`), alias
  // notices (`claude: aliased to ...`), and any other non-path output. Use
  // the platform-specific `path.isAbsolute` so Linux CI can validate Windows
  // outputs like `C:\Program Files\Claude\claude.exe`.
  const isAbsolute =
    platform === 'win32' ? path.win32.isAbsolute(firstLine) : path.posix.isAbsolute(firstLine)
  if (!isAbsolute) {
    return null
  }

  return firstLine
}
