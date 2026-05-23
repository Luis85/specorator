import type { Result } from '@/domain/shared/Result'

/**
 * Failure modes of an Obsidian CLI invocation (SPEC-OCM-001 §3).
 *
 * - `not-configured` — no binary path is configured; no process was spawned.
 * - `spawn-failed`    — the child process could not be started, or emitted `error`.
 * - `nonzero-exit`    — the process exited with a code other than 0.
 * - `timeout`         — the process did not finish within the timeout and was killed.
 * - `invalid-json`    — `runJson` received stdout that did not parse as JSON.
 */
export type ObsidianCliErrorCode =
  | 'not-configured'
  | 'spawn-failed'
  | 'nonzero-exit'
  | 'timeout'
  | 'invalid-json'

/** Typed error returned (never thrown) by `ObsidianCliPort`. */
export class ObsidianCliError extends Error {
  readonly code: ObsidianCliErrorCode
  readonly exitCode: number | null
  readonly stderr: string

  constructor(
    code: ObsidianCliErrorCode,
    message: string,
    opts?: { exitCode?: number | null; stderr?: string },
  ) {
    super(message)
    this.name = 'ObsidianCliError'
    this.code = code
    this.exitCode = opts?.exitCode ?? null
    this.stderr = opts?.stderr ?? ''
  }
}

/** Captured outcome of a successful (spawned + completed) CLI invocation. */
export interface ObsidianCliInvocation {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null
}

/**
 * Narrow port (ADR-008) wrapping invocation of the official Obsidian CLI
 * (`obsidian <command> key=value … format=json`). MCP-tool code depends on this
 * port; only the infrastructure adapter touches `node:child_process` (NFR-OCM-005).
 *
 * Implemented by `ObsidianCliAdapter` (production) and `MockObsidianCliPort` (tests
 * + standalone dev). See ADR-018 / SPEC-OCM-001.
 */
export interface ObsidianCliPort {
  /** Whether an absolute CLI binary path is configured — the cheap pre-call gate. */
  readonly available: boolean

  /**
   * Run a CLI command with the given `key=value` arguments. Resolves to a typed
   * error result rather than throwing.
   */
  run(
    command: string,
    args?: readonly string[],
  ): Promise<Result<ObsidianCliInvocation, ObsidianCliError>>

  /**
   * Run a CLI command with `format=json` appended and parse its stdout as JSON.
   * Returns `invalid-json` when the output does not parse.
   */
  runJson(command: string, args?: readonly string[]): Promise<Result<unknown, ObsidianCliError>>
}
