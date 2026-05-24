import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ObsidianCliPort } from '@/domain/ports'
import type { Result } from '@/domain/shared/Result'
import type { ObsidianCliError } from '@/domain/ports'
import type { ProposalStore } from '../ProposalStore'
import { ok } from './shared'

/**
 * Commands the generic `obsidian_cli_run` tool may invoke (REQ-OCM-011). Strictly
 * read-only — every entry must be free of vault side effects. `eval` and every
 * mutating/administrative command are deliberately absent so they are unreachable
 * through the agent surface (REQ-OCM-013, NFR-OCM-002).
 *
 * `daily` is intentionally NOT here: the Obsidian CLI's daily command opens (and,
 * when missing, can create) today's note — a vault mutation that must not bypass
 * ProposalStore. A confirmed read-only daily variant is deferred (CLAR-OCM-003).
 */
export const SAFE_CLI_READ_COMMANDS: readonly string[] = [
  'search',
  'read',
  'properties',
  'tags',
  'tasks',
  'bookmarks',
  'bases',
  'list',
  'info',
]

/**
 * Map a port `Result` onto an MCP tool payload that never crashes the request
 * (REQ-OCM-014): success → `{ result }`, failure → `{ error: { code, message } }`.
 */
function wrap(result: Result<unknown, ObsidianCliError>): ReturnType<typeof ok> {
  if (result.ok) return ok({ result: result.value })
  return ok({ error: { code: result.error.code, message: result.error.message } })
}

/**
 * T-OCM-005 — CLI-backed MCP tool group (ADR-018). Reads call the official
 * Obsidian CLI through `ObsidianCliPort`; the single write tool is queued in the
 * `ProposalStore` so it mutates only on human accept (REQ-OCM-012).
 */
export function registerObsidianCliTools(
  mcp: McpServer,
  cli: ObsidianCliPort,
  store: ProposalStore,
): void {
  mcp.registerTool(
    'obsidian_cli_search',
    {
      description: 'Full-text search the vault via the official Obsidian CLI',
      inputSchema: { query: z.string().describe('Search query') },
    },
    async ({ query }) => wrap(await cli.runJson('search', [`query=${query}`])),
  )

  mcp.registerTool(
    'obsidian_cli_read_note',
    {
      description: 'Read a note via the official Obsidian CLI',
      inputSchema: { path: z.string().describe('Vault-relative note path') },
    },
    async ({ path }) => wrap(await cli.runJson('read', [`path=${path}`])),
  )

  mcp.registerTool(
    'obsidian_cli_get_properties',
    {
      description: 'Read a note\'s frontmatter/properties via the official Obsidian CLI',
      inputSchema: { path: z.string().describe('Vault-relative note path') },
    },
    async ({ path }) => wrap(await cli.runJson('properties', [`path=${path}`])),
  )

  mcp.registerTool(
    'obsidian_cli_run',
    {
      description:
        'Run an allow-listed read-only Obsidian CLI command. Mutating commands and `eval` are rejected.',
      inputSchema: {
        command: z.string().describe('CLI command (read-only allow-list)'),
        args: z
          .record(z.string(), z.string())
          .optional()
          .describe('key=value arguments passed to the command'),
      },
    },
    async ({ command, args }) => {
      if (!SAFE_CLI_READ_COMMANDS.includes(command)) {
        return ok({
          error: {
            code: 'command-not-allowed',
            message: `Command "${command}" is not on the read-only allow-list.`,
            allowed: SAFE_CLI_READ_COMMANDS,
          },
        })
      }
      const cliArgs = Object.entries(args ?? {}).map(([k, v]) => `${k}=${v}`)
      return wrap(await cli.runJson(command, cliArgs))
    },
  )

  mcp.registerTool(
    'obsidian_cli_append_note',
    {
      description: 'Append text to a note via the Obsidian CLI — queued for proposal review',
      inputSchema: {
        path: z.string().describe('Vault-relative note path'),
        content: z.string().describe('Text to append'),
      },
    },
    async ({ path, content }) => {
      const proposalId = store.queue('obsidian_cli_append_note', { path, content }, async () => {
        const outcome = await cli.run('append', [`path=${path}`, `content=${content}`])
        if (!outcome.ok) throw outcome.error
      })
      return ok({ proposalId, status: 'pending' })
    },
  )
}
