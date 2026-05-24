/**
 * T-MHP-071/-072 — Tier-A read-tool registrar (SPEC-MHP-013..024).
 *
 * Registers the 12 canonical `obsidian_cli_*` read tools on the supplied MCP
 * server when `cli.available === true`; otherwise registers nothing
 * (NFR-MHP-003). Reads NEVER enqueue a proposal (REQ-MHP-012) — handlers
 * delegate to the optional `cli.runJson` runner and surface `cli_failed` on
 * any failure path.
 *
 * The shared `vaultPath` schema rejects shell-traversal (`..`), absolute
 * prefixes, and normalises backslashes to forward slashes
 * (REQ-MHP-023, NFR-MHP-014).
 *
 * Satisfies: REQ-MHP-011, REQ-MHP-012, REQ-MHP-023; NFR-MHP-003, NFR-MHP-014.
 */
import { z } from 'zod'
import type { LoggerPort } from '@/domain/ports'

/** Minimal MCP-server surface this registrar consumes. */
export interface ReadToolServer {
  tool(name: string, schema: unknown, handler: ReadToolHandler): void
}

export type ReadToolHandler = (input: Record<string, unknown>) => Promise<ReadResult>

/** Optional CLI runner. When absent, every handler resolves with `cli_failed`. */
export interface CliRunner {
  runJson(command: string, args: readonly string[]): Promise<unknown>
}

export interface RegisterReadToolsOptions {
  readonly cli: { readonly available: boolean; readonly binaryPath: string }
  readonly logger: LoggerPort
  readonly runner?: CliRunner
  /**
   * Reads MUST NEVER consult the proposal store (REQ-MHP-012). The parameter
   * exists only so the qa fuzz-test can pass a poisoned substitute to verify
   * the invariant — production callers omit it.
   */
  readonly proposalStore?: unknown
}

/**
 * Shared `vaultPath` validator. Rejects path-traversal sequences and absolute
 * prefixes (Unix root, drive-letter, UNC); normalises backslashes to forward
 * slashes so downstream CLI invocations stay POSIX (REQ-MHP-023).
 */
export const vaultPath = z
  .string()
  .min(1)
  .refine((s) => !s.includes('..'), { message: 'path may not contain ..' })
  .refine((s) => !/^([a-zA-Z]:[\\/]|\/|\\\\)/.test(s), {
    message: 'absolute paths not allowed',
  })
  .transform((s) => s.replace(/\\/g, '/'))

/** Envelope returned by every Tier-A read handler. */
export type ReadResult =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } }

function cliFailed(message: string): ReadResult {
  return { ok: false, error: { code: 'cli_failed', message } }
}

function invalidArgument(message: string): ReadResult {
  return { ok: false, error: { code: 'invalid_argument', message } }
}

/**
 * Tool descriptor table — one entry per SPEC-MHP-013..024 row. The `schema`
 * is held as `z.ZodType` for storage; per-tool `toArgs` projects the validated
 * shape onto the CLI argv vector.
 */
interface ReadToolSpec {
  readonly name: string
  readonly cliCommand: string
  readonly schema: z.ZodType
  readonly toArgs: (parsed: unknown) => readonly string[]
}

const pathSchema = z.object({ path: vaultPath }).strict()
const emptySchema = z.object({}).strict()
const templateReadSchema = z.object({ name: z.string().min(1) }).strict()
const propertyReadSchema = z
  .object({ path: vaultPath, name: z.string().min(1) })
  .strict()
const diffSchema = z
  .object({ path: vaultPath, revA: z.string(), revB: z.string() })
  .strict()
const dailyReadSchema = z
  .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
  .strict()

function argsFromPath(parsed: unknown): readonly string[] {
  return [(parsed as { path: string }).path]
}
function argsEmpty(): readonly string[] {
  return []
}
function argsTemplateRead(parsed: unknown): readonly string[] {
  return [(parsed as { name: string }).name]
}
function argsPropertyRead(parsed: unknown): readonly string[] {
  const p = parsed as { path: string; name: string }
  return [p.path, p.name]
}
function argsDiff(parsed: unknown): readonly string[] {
  const p = parsed as { path: string; revA: string; revB: string }
  return [p.path, p.revA, p.revB]
}
function argsDailyRead(parsed: unknown): readonly string[] {
  const p = parsed as { date?: string }
  return p.date !== undefined ? [p.date] : []
}

const TIER_A_SPECS: readonly ReadToolSpec[] = [
  { name: 'obsidian_cli_backlinks', cliCommand: 'backlinks', schema: pathSchema, toArgs: argsFromPath },
  { name: 'obsidian_cli_links', cliCommand: 'links', schema: pathSchema, toArgs: argsFromPath },
  { name: 'obsidian_cli_unresolved', cliCommand: 'unresolved', schema: emptySchema, toArgs: argsEmpty },
  { name: 'obsidian_cli_orphans', cliCommand: 'orphans', schema: emptySchema, toArgs: argsEmpty },
  { name: 'obsidian_cli_deadends', cliCommand: 'deadends', schema: emptySchema, toArgs: argsEmpty },
  { name: 'obsidian_cli_outline', cliCommand: 'outline', schema: pathSchema, toArgs: argsFromPath },
  { name: 'obsidian_cli_diff', cliCommand: 'diff', schema: diffSchema, toArgs: argsDiff },
  { name: 'obsidian_cli_history', cliCommand: 'history', schema: pathSchema, toArgs: argsFromPath },
  { name: 'obsidian_cli_templates', cliCommand: 'templates', schema: emptySchema, toArgs: argsEmpty },
  { name: 'obsidian_cli_template_read', cliCommand: 'template:read', schema: templateReadSchema, toArgs: argsTemplateRead },
  { name: 'obsidian_cli_property_read', cliCommand: 'property:read', schema: propertyReadSchema, toArgs: argsPropertyRead },
  { name: 'obsidian_cli_daily_read', cliCommand: 'daily:read', schema: dailyReadSchema, toArgs: argsDailyRead },
]

/** Canonical tool-name list, exported for `tools/list` assertions (TEST-MHP-012). */
export const TIER_A_READ_TOOL_NAMES: readonly string[] = TIER_A_SPECS.map((s) => s.name)

function makeHandler(spec: ReadToolSpec, runner: CliRunner | undefined): ReadToolHandler {
  return async (input: Record<string, unknown>): Promise<ReadResult> => {
    const parsed = spec.schema.safeParse(input)
    if (!parsed.success) return invalidArgument(parsed.error.message)
    if (!runner) return cliFailed('obsidian-cli runner is not configured')
    try {
      const value = await runner.runJson(spec.cliCommand, spec.toArgs(parsed.data))
      return { ok: true, value }
    } catch (cause) {
      return cliFailed(cause instanceof Error ? cause.message : String(cause))
    }
  }
}

export function registerObsidianCliReadTools(
  server: ReadToolServer,
  options: RegisterReadToolsOptions,
): void {
  if (!options.cli.available) return
  for (const spec of TIER_A_SPECS) {
    server.tool(spec.name, spec.schema, makeHandler(spec, options.runner))
  }
}
