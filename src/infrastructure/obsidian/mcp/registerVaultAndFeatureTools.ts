import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { VaultPort } from '@/domain/ports'
import type { ProposalStore } from '../ProposalStore'
import {
  applyFrontmatterUpdate,
  collectFiles,
  joinVaultPath,
  ok,
  parseFrontmatter,
} from './shared'

export function registerVaultAndFeatureTools(
  mcp: McpServer,
  vault: VaultPort,
  store: ProposalStore,
): void {
  mcp.registerTool(
    'vault_read_note',
    {
      description: 'Read the full content of a vault note',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => ok({ content: await vault.readFile(path) }),
  )

  mcp.registerTool(
    'vault_write_note',
    {
      description: 'Overwrite a vault note — queued for proposal review',
      inputSchema: { path: z.string(), content: z.string() },
    },
    async ({ path, content }) => {
      const proposalId = store.queue('vault_write_note', { path, content }, () =>
        vault.writeFile(path, content),
      )
      return ok({ proposalId, status: 'pending' })
    },
  )

  mcp.registerTool(
    'vault_append_to_note',
    {
      description: 'Append text to a vault note — queued for proposal review',
      inputSchema: { path: z.string(), content: z.string().describe('Text to append') },
    },
    async ({ path, content }) => {
      const proposalId = store.queue('vault_append_to_note', { path, content }, async () => {
        const existing = await vault.readFile(path)
        await vault.writeFile(path, existing + content)
      })
      return ok({ proposalId, status: 'pending' })
    },
  )

  mcp.registerTool(
    'vault_search',
    {
      description: 'Search vault notes for a query string (case-insensitive, recursive)',
      inputSchema: {
        query: z.string().describe('Substring to search for'),
        folder: z.string().describe('Vault-relative folder to search in'),
      },
    },
    async ({ query, folder }) => {
      const files = await collectFiles(vault, folder)
      const lower = query.toLowerCase()
      const matches: Array<{ path: string; excerpt: string }> = []
      for (const path of files) {
        try {
          const content = await vault.readFile(path)
          const idx = content.toLowerCase().indexOf(lower)
          if (idx !== -1) {
            const start = Math.max(0, idx - 60)
            const end = Math.min(content.length, idx + query.length + 60)
            matches.push({ path, excerpt: content.slice(start, end).trim() })
          }
        } catch {
          // skip unreadable files
        }
      }
      return ok({ matches })
    },
  )

  mcp.registerTool(
    'vault_list_folder',
    {
      description: 'List files and immediate subfolders in a vault folder',
      inputSchema: { folder: z.string().describe('Vault-relative folder path') },
    },
    async ({ folder }) => {
      const [files, subfolderNames] = await Promise.all([
        vault.listFiles(folder),
        vault.listFolders(folder),
      ])
      const folders = subfolderNames.map((sub) => joinVaultPath(folder, sub))
      return ok({ files, folders })
    },
  )

  mcp.registerTool(
    'vault_create_folder',
    {
      description: 'Create a folder in the vault',
      inputSchema: { path: z.string().describe('Vault-relative path to create') },
    },
    async ({ path }) => {
      await vault.createFolder(path)
      return ok({ created: true })
    },
  )

  mcp.registerTool(
    'frontmatter_get',
    {
      description: 'Get all YAML frontmatter fields from a vault note',
      inputSchema: { path: z.string() },
    },
    async ({ path }) => {
      const content = await vault.readFile(path)
      return ok({ frontmatter: parseFrontmatter(content) })
    },
  )

  mcp.registerTool(
    'frontmatter_get_field',
    {
      description: 'Get a single frontmatter field from a vault note',
      inputSchema: { path: z.string(), field: z.string().describe('Frontmatter key') },
    },
    async ({ path, field }) => {
      const content = await vault.readFile(path)
      const fm = parseFrontmatter(content)
      const value = Object.prototype.hasOwnProperty.call(fm, field) ? fm[field] : null
      return ok({ field, value })
    },
  )

  mcp.registerTool(
    'frontmatter_set_field',
    {
      description: 'Set a frontmatter field — queued for proposal review',
      inputSchema: { path: z.string(), field: z.string(), value: z.unknown() },
    },
    async ({ path, field, value }) => {
      const proposalId = store.queue('frontmatter_set_field', { path, field, value }, () =>
        applyFrontmatterUpdate(vault, path, { [field]: value }),
      )
      return ok({ proposalId, status: 'pending' })
    },
  )

  mcp.registerTool(
    'frontmatter_set_many',
    {
      description: 'Set multiple frontmatter fields at once — queued for proposal review',
      inputSchema: {
        path: z.string(),
        fields: z.record(z.string(), z.any()).describe('Key-value pairs to set'),
      },
    },
    async ({ path, fields }) => {
      const proposalId = store.queue('frontmatter_set_many', { path, fields }, () =>
        applyFrontmatterUpdate(vault, path, fields),
      )
      return ok({ proposalId, status: 'pending' })
    },
  )
}
