import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { MetadataCachePort, VaultPort } from '@/domain/ports'
import type { ProposalStore } from '../ProposalStore'
import { ok } from './shared'

type TraverseDirection = 'outgoing' | 'backlinks' | 'both'

function neighborsOf(
  metadataCache: MetadataCachePort,
  node: string,
  direction: TraverseDirection,
): { outgoing: readonly string[]; incoming: readonly string[] } {
  // Outgoing expansion uses resolvedLinks keys — those are canonical vault paths.
  // getFileMetadata().links contains raw linktexts ("Page", "Page#Heading") that
  // cannot be reused as node keys for the next BFS hop.
  const outgoing =
    direction === 'outgoing' || direction === 'both'
      ? Object.keys(metadataCache.getResolvedLinks(node))
      : []
  const incoming =
    direction === 'backlinks' || direction === 'both' ? metadataCache.getBacklinks(node) : []
  return { outgoing, incoming }
}

function bfsTraverse(
  metadataCache: MetadataCachePort,
  startPath: string,
  cappedDepth: number,
  direction: TraverseDirection,
): { nodes: string[]; edges: Array<[string, string]> } {
  const visited = new Set<string>([startPath])
  const edges: Array<[string, string]> = []
  let frontier: string[] = [startPath]
  for (let hop = 0; hop < cappedDepth; hop++) {
    const next: string[] = []
    for (const node of frontier) {
      const { outgoing, incoming } = neighborsOf(metadataCache, node, direction)
      for (const target of outgoing) {
        edges.push([node, target])
        if (!visited.has(target)) {
          visited.add(target)
          next.push(target)
        }
      }
      for (const source of incoming) {
        edges.push([source, node])
        if (!visited.has(source)) {
          visited.add(source)
          next.push(source)
        }
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }
  return { nodes: Array.from(visited), edges }
}

export function registerLinksTools(
  mcp: McpServer,
  vault: VaultPort,
  metadataCache: MetadataCachePort,
  store: ProposalStore,
): void {
  mcp.registerTool(
    'links_get_outgoing',
    {
      description: 'Get outgoing wikilinks from a note (resolved + unresolved linktexts)',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => {
      const snapshot = metadataCache.getFileMetadata(path)
      return ok({ links: snapshot?.links ?? [] })
    },
  )

  mcp.registerTool(
    'links_get_backlinks',
    {
      description: 'Get vault paths that link to the given note',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => ok({ backlinks: metadataCache.getBacklinks(path) }),
  )

  mcp.registerTool(
    'links_resolve',
    {
      description: 'Resolve a wikilink linktext to its absolute vault path. Uses Obsidian metadata cache in-process.',
      inputSchema: {
        linktext: z.string().describe('Wikilink linktext, e.g. "Page Name" or "folder/page"'),
        sourcePath: z.string().describe('Source note path the link is being resolved from'),
      },
    },
    async ({ linktext, sourcePath }) =>
      ok({ resolved: metadataCache.getFirstLinkpathDest(linktext, sourcePath) }),
  )

  mcp.registerTool(
    'graph_traverse',
    {
      description: 'BFS traverse the link graph from a start node. Direction = outgoing | backlinks | both. Depth capped at 5.',
      inputSchema: {
        startPath: z.string().describe('Starting vault path'),
        depth: z.number().int().min(1).describe('Hop limit (capped at 5)'),
        direction: z.enum(['outgoing', 'backlinks', 'both']),
      },
    },
    async ({ startPath, depth, direction }) => {
      const result = bfsTraverse(metadataCache, startPath, Math.min(depth, 5), direction)
      return ok(result)
    },
  )

  mcp.registerTool(
    'links_add_to_note',
    {
      description: 'Append a wikilink [[target]] (or [[target|display]]) to a note. Queued for proposal review.',
      inputSchema: {
        path: z.string().describe('Vault-relative note path'),
        target: z.string().describe('Link target (linktext or path)'),
        displayText: z.string().optional().describe('Optional display text after the pipe'),
      },
    },
    async ({ path, target, displayText }) => {
      const hasDisplay = displayText !== undefined && displayText !== ''
      const wikilink = hasDisplay ? `[[${target}|${displayText}]]` : `[[${target}]]`
      const proposalId = store.queue('links_add_to_note', { path, target, displayText }, async () => {
        const existing = await vault.readFile(path)
        await vault.writeFile(path, `${existing}\n${wikilink}`)
      })
      return ok({ proposalId, status: 'pending' })
    },
  )
}
