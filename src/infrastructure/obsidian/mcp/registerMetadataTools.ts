import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MetadataCachePort } from '@/domain/ports'
import { ok } from './shared'

export function registerMetadataTools(mcp: McpServer, metadataCache: MetadataCachePort): void {
  mcp.registerTool(
    'metadata_get_file_cache',
    {
      description: 'Get the metadata cache snapshot (tags, frontmatter, links, embeds) for a vault note',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => ok({ snapshot: metadataCache.getFileMetadata(path) }),
  )

  mcp.registerTool(
    'metadata_get_all_tags',
    {
      description: 'Get the tag → count map across the entire vault',
      inputSchema: {},
    },
    async () => ok({ tags: metadataCache.getAllTags() }),
  )

  mcp.registerTool(
    'metadata_get_resolved_links',
    {
      description: 'Get resolved outgoing links and their counts for a source note',
      inputSchema: { sourcePath: z.string().describe('Source vault path') },
    },
    async ({ sourcePath }) => ok({ links: metadataCache.getResolvedLinks(sourcePath) }),
  )
}
