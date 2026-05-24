/**
 * T-MHP-074 — `obsidian_cli_read_command` read-only escape hatch
 * (SPEC-MHP-025).
 *
 * Allows MCP clients to invoke an Obsidian-CLI read command not yet exposed as
 * a typed Tier-A tool, subject to four guards (REQ-MHP-013, REQ-MHP-014,
 * REQ-MHP-015):
 *
 *   1. **Deny-list** (REQ-MHP-014/-015): `command` matched against
 *      `PERMANENT_DENY_LIST` returns `not_allowed` and never spawns the CLI.
 *   2. **Allow-list** (CLAR-MHP-012): hard-coded constant equal to the 12
 *      Tier-A CLI command names; `not_allowed` otherwise.
 *   3. **Arg regex** (NFR-MHP-005): each arg must match
 *      `^[^;|&$\`\n\r\\]+$` — rejects shell metacharacters, newlines, CRs,
 *      and backslashes. Failure → `invalid_argument`.
 *   4. **Path-segment guard** (CLAR-MHP-012): each arg must not contain `..`
 *      and must not match an absolute-path prefix (`/`, drive-letter,
 *      `\\?\`). Failure → `invalid_argument`.
 *
 * Guards short-circuit: deny-list runs first, allow-list second, per-arg
 * validation last. The CLI runner is only invoked when all four pass.
 *
 * Satisfies: REQ-MHP-013, REQ-MHP-014, REQ-MHP-015; NFR-MHP-004, NFR-MHP-005.
 */
import { z } from 'zod'
import type { LoggerPort } from '@/domain/ports'
import type {
  CliRunner,
  ReadToolHandler,
  ReadToolServer,
  ReadResult,
} from './registerObsidianCliReadTools'
import { PERMANENT_DENY_LIST } from './denyList'

/**
 * Hard-coded allow-list equal to the 12 Tier-A CLI command names (CLAR-MHP-012,
 * REQ-MHP-013). NOT user-editable. Must be kept in lockstep with
 * `TIER_A_READ_TOOL_NAMES` in `registerObsidianCliReadTools.ts`.
 */
export const ESCAPE_HATCH_ALLOW_LIST: readonly string[] = [
  'backlinks',
  'links',
  'unresolved',
  'orphans',
  'deadends',
  'outline',
  'diff',
  'history',
  'templates',
  'template:read',
  'property:read',
  'daily:read',
]

const ESCAPE_HATCH_TOOL_NAME = 'obsidian_cli_read_command'

const escapeHatchSchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
  })
  .strict()

/** Single-line shell-safety regex per SPEC-MHP-025 step 3a. */
const SHELL_SAFE_ARG = /^[^;|&$`\n\r\\]+$/

/** Absolute-path prefix per SPEC-MHP-025 step 3c (Unix root, drive, UNC). */
const ABSOLUTE_PREFIX = /^([a-zA-Z]:[\\/]|\/|\\\\)/

export interface RegisterEscapeHatchOptions {
  readonly cli: { readonly available: boolean }
  readonly logger: LoggerPort
  readonly runner?: CliRunner
  /** Hard-coded allow-list; defaults to the 12 Tier-A CLI names. */
  readonly allowList?: ReadonlyArray<string>
  /** Permanent deny-list; defaults to `PERMANENT_DENY_LIST`. */
  readonly denyList?: ReadonlyArray<string>
}

function notAllowed(message: string): ReadResult {
  return { ok: false, error: { code: 'not_allowed', message } }
}

function invalidArgument(message: string): ReadResult {
  return { ok: false, error: { code: 'invalid_argument', message } }
}

function cliFailed(message: string): ReadResult {
  return { ok: false, error: { code: 'cli_failed', message } }
}

/** Returns `null` when the arg is valid; the rejection message otherwise. */
function validateArg(arg: string): string | null {
  if (!SHELL_SAFE_ARG.test(arg)) {
    return `arg contains forbidden character: ${JSON.stringify(arg)}`
  }
  if (arg.includes('..')) {
    return `arg may not contain '..': ${JSON.stringify(arg)}`
  }
  if (ABSOLUTE_PREFIX.test(arg)) {
    return `arg may not be an absolute path: ${JSON.stringify(arg)}`
  }
  return null
}

function makeHandler(
  runner: CliRunner | undefined,
  allowList: ReadonlySet<string>,
  denyList: ReadonlySet<string>,
): ReadToolHandler {
  return async (input: Record<string, unknown>): Promise<ReadResult> => {
    const parsed = escapeHatchSchema.safeParse(input)
    if (!parsed.success) return invalidArgument(parsed.error.message)
    const { command, args } = parsed.data

    // Guard 1: deny-list overrides everything (REQ-MHP-015).
    if (denyList.has(command)) {
      return notAllowed(`command "${command}" is permanently denied`)
    }
    // Guard 2: allow-list match required (CLAR-MHP-012).
    if (!allowList.has(command)) {
      return notAllowed(`command "${command}" is not in the allow-list`)
    }
    // Guard 3+4: per-arg validation.
    for (const arg of args) {
      const rejection = validateArg(arg)
      if (rejection !== null) return invalidArgument(rejection)
    }

    if (!runner) return cliFailed('obsidian-cli runner is not configured')
    try {
      const value = await runner.runJson(command, args)
      return { ok: true, value }
    } catch (cause) {
      return cliFailed(cause instanceof Error ? cause.message : String(cause))
    }
  }
}

export function registerEscapeHatchTool(
  server: ReadToolServer,
  options: RegisterEscapeHatchOptions,
): void {
  if (!options.cli.available) return
  const allowList = new Set(options.allowList ?? ESCAPE_HATCH_ALLOW_LIST)
  const denyList = new Set(options.denyList ?? PERMANENT_DENY_LIST)
  server.tool(
    ESCAPE_HATCH_TOOL_NAME,
    escapeHatchSchema,
    makeHandler(options.runner, allowList, denyList),
  )
}
