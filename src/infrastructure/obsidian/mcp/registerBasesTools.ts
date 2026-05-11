import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { VaultPort } from '@/domain/ports'
import type { ProposalStore } from '../ProposalStore'
import { applyFrontmatterUpdate, collectFiles, ok, parseFrontmatter } from './shared'

type FilterOp = 'eq' | 'neq' | 'contains' | 'in'

function matchesFilter(value: unknown, op: FilterOp, target: unknown): boolean {
  switch (op) {
    case 'eq':
      return value === target
    case 'neq':
      return value !== target
    case 'contains':
      if (typeof value === 'string' && typeof target === 'string') return value.includes(target)
      if (Array.isArray(value)) return value.includes(target)
      return false
    case 'in':
      return Array.isArray(target) && target.includes(value)
  }
}

interface BaseRecord {
  path: string
  frontmatter: Record<string, unknown>
}

async function loadBaseRecords(vault: VaultPort, folder: string): Promise<BaseRecord[]> {
  const files = (await collectFiles(vault, folder)).filter((p) => p.endsWith('.md'))
  const records = await Promise.all(
    files.map(async (path) => {
      try {
        const content = await vault.readFile(path)
        return { path, frontmatter: parseFrontmatter(content) }
      } catch {
        return null
      }
    }),
  )
  return records.filter((r): r is BaseRecord => r !== null)
}

const FilterSchema = z.object({
  field: z.string(),
  op: z.enum(['eq', 'neq', 'contains', 'in']),
  value: z.unknown(),
})

export function registerBasesTools(mcp: McpServer, vault: VaultPort, store: ProposalStore): void {
  mcp.registerTool(
    'bases_query',
    {
      description:
        'Query a folder as a frontmatter-backed base. Optional filter = { field, op: eq|neq|contains|in, value }.',
      inputSchema: {
        folder: z.string().describe('Vault-relative folder to scan recursively'),
        filter: FilterSchema.optional(),
      },
    },
    async ({ folder, filter }) => {
      const records = await loadBaseRecords(vault, folder)
      const matched = filter
        ? records.filter((r) =>
            matchesFilter(r.frontmatter[filter.field], filter.op, filter.value),
          )
        : records
      return ok({ records: matched })
    },
  )

  mcp.registerTool(
    'bases_list_fields',
    {
      description: 'Return the union of frontmatter keys across all records in a folder',
      inputSchema: { folder: z.string().describe('Vault-relative folder') },
    },
    async ({ folder }) => {
      const records = await loadBaseRecords(vault, folder)
      const fields = new Set<string>()
      for (const r of records) for (const k of Object.keys(r.frontmatter)) fields.add(k)
      return ok({ fields: Array.from(fields).sort() })
    },
  )

  mcp.registerTool(
    'bases_get_record',
    {
      description: 'Get the frontmatter record for a single note path',
      inputSchema: { path: z.string() },
    },
    async ({ path }) => {
      const content = await vault.readFile(path)
      return ok({ frontmatter: parseFrontmatter(content) })
    },
  )

  mcp.registerTool(
    'bases_find_by_field',
    {
      description: 'Find records in a folder where frontmatter[field] === value (eq shorthand)',
      inputSchema: {
        folder: z.string(),
        field: z.string(),
        value: z.unknown(),
      },
    },
    async ({ folder, field, value }) => {
      const records = await loadBaseRecords(vault, folder)
      const matched = records.filter((r) => matchesFilter(r.frontmatter[field], 'eq', value))
      return ok({ records: matched })
    },
  )

  mcp.registerTool(
    'bases_update_record',
    {
      description: 'Update frontmatter fields on a record. Queued for proposal review.',
      inputSchema: {
        path: z.string(),
        fields: z.record(z.string(), z.unknown()).describe('Frontmatter keys to merge'),
      },
    },
    async ({ path, fields }) => {
      const proposalId = store.queue('bases_update_record', { path, fields }, () =>
        applyFrontmatterUpdate(vault, path, fields),
      )
      return ok({ proposalId, status: 'pending' })
    },
  )
}
