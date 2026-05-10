# MCP Tools #193 — PR1: Metadata + Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 8 MCP tools (3 metadata reads + 4 links reads + 1 links write) to `ObsidianMcpServerAdapter`, plus the `getFirstLinkpathDest` method on `MetadataCachePort`.

**Architecture:** Extend `ObsidianMcpServerAdapter` constructor to accept a `MetadataCachePort`. Add `registerMetadataTools` and `registerLinksTools` registration functions called from `_handleMcpRequest`. All read tools delegate directly to the port; the single write tool (`links_add_to_note`) routes through the existing `ProposalStore` queue and returns `{ proposalId, status: 'pending' }`. New port method `getFirstLinkpathDest(linktext, sourcePath)` resolves wikilinks via the in-process Obsidian metadata cache (NOT a CLI shell-out).

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, Vitest, Zod, `MockBridge`, `MockMetadataCacheAdapter`. Branch off `develop` as `feat/mcp-tools-193-metadata-links`.

**Spec:** `docs/superpowers/specs/2026-05-10-mcp-tools-193-design.md`

---

## Branch setup

- [ ] **Step 0.1: Cut the feature branch from develop**

```sh
git checkout develop
git pull --ff-only
git checkout -b feat/mcp-tools-193-metadata-links
```

---

### Task 1: Extend `MetadataCachePort` with `getFirstLinkpathDest`

**Files:**
- Modify: `src/domain/ports/metadata-cache-port.ts`

- [ ] **Step 1.1: Add the new port method to the interface**

Edit `src/domain/ports/metadata-cache-port.ts`. Add `getFirstLinkpathDest` to the `MetadataCachePort` interface (after `getAllTags`):

```ts
import type { Unsubscriber } from './shared'

export interface FileMetadataSnapshot {
  path: string
  tags: string[]
  frontmatter: Record<string, unknown>
  links: string[]
  embeds: string[]
}

export interface MetadataCachePort {
  getFileMetadata(path: string): FileMetadataSnapshot | null
  getBacklinks(path: string): string[]
  getResolvedLinks(sourcePath: string): Record<string, number>
  getAllTags(): Record<string, number>
  /**
   * Resolve a wikilink (e.g. "Page Name" or "folder/page") to its absolute vault path
   * relative to the given source. Returns null if unresolved.
   * MUST use Obsidian's in-process metadata cache. Never shell out.
   */
  getFirstLinkpathDest(linktext: string, sourcePath: string): string | null
  onMetadataChanged(handler: (path: string) => void): Unsubscriber
}
```

- [ ] **Step 1.2: Run typecheck — expect failures in adapters**

Run: `npm run typecheck`
Expected: errors in `MockMetadataCacheAdapter` and `ObsidianMetadataCacheAdapter` reporting that `getFirstLinkpathDest` is missing. This is correct.

---

### Task 2: Implement `getFirstLinkpathDest` in `MockMetadataCacheAdapter`

**Files:**
- Modify: `src/infrastructure/mock/MockMetadataCacheAdapter.ts`
- Modify: `tests/infrastructure/mock/MockMetadataCacheAdapter.test.ts`

- [ ] **Step 2.1: Write the failing tests**

Append to `tests/infrastructure/mock/MockMetadataCacheAdapter.test.ts` inside the existing `describe`:

```ts
  it('getFirstLinkpathDest returns null when not seeded', () => {
    const adapter = new MockMetadataCacheAdapter()
    expect(adapter.getFirstLinkpathDest('Foo', 'specs/bar/idea.md')).toBeNull()
  })

  it('getFirstLinkpathDest returns the seeded destination', () => {
    const adapter = new MockMetadataCacheAdapter()
    adapter.seedLinkpathDest('Foo', 'specs/bar/idea.md', 'specs/foo/idea.md')
    expect(adapter.getFirstLinkpathDest('Foo', 'specs/bar/idea.md')).toBe('specs/foo/idea.md')
  })

  it('getFirstLinkpathDest is keyed by both linktext and source', () => {
    const adapter = new MockMetadataCacheAdapter()
    adapter.seedLinkpathDest('Foo', 'a.md', 'specs/a-foo.md')
    adapter.seedLinkpathDest('Foo', 'b.md', 'specs/b-foo.md')
    expect(adapter.getFirstLinkpathDest('Foo', 'a.md')).toBe('specs/a-foo.md')
    expect(adapter.getFirstLinkpathDest('Foo', 'b.md')).toBe('specs/b-foo.md')
    expect(adapter.getFirstLinkpathDest('Foo', 'c.md')).toBeNull()
  })
```

- [ ] **Step 2.2: Run tests, expect failure**

Run: `npx vitest run tests/infrastructure/mock/MockMetadataCacheAdapter.test.ts`
Expected: FAIL — `seedLinkpathDest` is not a function / `getFirstLinkpathDest` not implemented.

- [ ] **Step 2.3: Implement on `MockMetadataCacheAdapter`**

Edit `src/infrastructure/mock/MockMetadataCacheAdapter.ts`. Add a `linkpathDest` map and the two methods:

```ts
import type { MetadataCachePort, FileMetadataSnapshot, Unsubscriber } from '@/domain/ports'

export class MockMetadataCacheAdapter implements MetadataCachePort {
  private readonly metadata = new Map<string, FileMetadataSnapshot>()
  private readonly backlinks = new Map<string, string[]>()
  private readonly resolvedLinks = new Map<string, Record<string, number>>()
  private readonly linkpathDest = new Map<string, string>()
  private tags: Record<string, number> = {}
  private readonly handlers = new Set<(path: string) => void>()

  seedMetadata(path: string, snapshot: FileMetadataSnapshot): void {
    this.metadata.set(path, snapshot)
  }

  seedBacklinks(path: string, sources: string[]): void {
    this.backlinks.set(path, sources)
  }

  seedResolvedLinks(path: string, links: Record<string, number>): void {
    this.resolvedLinks.set(path, links)
  }

  seedTags(tags: Record<string, number>): void {
    this.tags = { ...tags }
  }

  seedLinkpathDest(linktext: string, sourcePath: string, dest: string): void {
    this.linkpathDest.set(`${linktext}|${sourcePath}`, dest)
  }

  triggerChange(path: string): void {
    for (const handler of this.handlers) {
      handler(path)
    }
  }

  getFileMetadata(path: string): FileMetadataSnapshot | null {
    const snapshot = this.metadata.get(path)
    return snapshot !== undefined ? structuredClone(snapshot) : null
  }

  getBacklinks(path: string): string[] {
    return [...(this.backlinks.get(path) ?? [])]
  }

  getResolvedLinks(sourcePath: string): Record<string, number> {
    return { ...(this.resolvedLinks.get(sourcePath) ?? {}) }
  }

  getAllTags(): Record<string, number> {
    return { ...this.tags }
  }

  getFirstLinkpathDest(linktext: string, sourcePath: string): string | null {
    return this.linkpathDest.get(`${linktext}|${sourcePath}`) ?? null
  }

  onMetadataChanged(handler: (path: string) => void): Unsubscriber {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }
}
```

- [ ] **Step 2.4: Run tests, expect pass**

Run: `npx vitest run tests/infrastructure/mock/MockMetadataCacheAdapter.test.ts`
Expected: PASS — all original tests + 3 new tests green.

- [ ] **Step 2.5: Commit**

```sh
git add src/domain/ports/metadata-cache-port.ts \
        src/infrastructure/mock/MockMetadataCacheAdapter.ts \
        tests/infrastructure/mock/MockMetadataCacheAdapter.test.ts
git commit -m "feat(ports): add getFirstLinkpathDest to MetadataCachePort"
```

---

### Task 3: Implement `getFirstLinkpathDest` in `ObsidianMetadataCacheAdapter`

**Files:**
- Modify: `src/infrastructure/obsidian/ObsidianMetadataCacheAdapter.ts`

This adapter is excluded from coverage (per `vitest.config`), so no test required. Wrap the live API.

- [ ] **Step 3.1: Add the method**

Edit `src/infrastructure/obsidian/ObsidianMetadataCacheAdapter.ts`. Add `getFirstLinkpathDest` after `getAllTags`:

```ts
  getFirstLinkpathDest(linktext: string, sourcePath: string): string | null {
    const dest = this.app.metadataCache.getFirstLinkpathDest(linktext, sourcePath)
    return dest?.path ?? null
  }
```

- [ ] **Step 3.2: Run typecheck, expect green**

Run: `npm run typecheck`
Expected: PASS — port and both adapters now satisfy the interface.

- [ ] **Step 3.3: Commit**

```sh
git add src/infrastructure/obsidian/ObsidianMetadataCacheAdapter.ts
git commit -m "feat(infra): wire getFirstLinkpathDest in ObsidianMetadataCacheAdapter"
```

---

### Task 4: Extend `ObsidianMcpServerAdapter` constructor with `MetadataCachePort`

**Files:**
- Modify: `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts`
- Modify: `src/plugin/main.ts`

- [ ] **Step 4.1: Add `metadataCache` to constructor**

Edit `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts`. Update imports and constructor:

```ts
import type { ObsidianMcpServerPort, McpConnectionConfig, VaultPort, MetadataCachePort } from '@/domain/ports'
```

Update the class constructor (around line 352):

```ts
  constructor(
    private readonly vault: VaultPort,
    private readonly repo: IFeatureRepository,
    private readonly specsFolder: () => string,
    private readonly metadataCache: MetadataCachePort,
  ) {
    this.advanceUseCase = new AdvanceFeatureStageUseCase(repo)
  }
```

- [ ] **Step 4.2: Wire `ObsidianMetadataCacheAdapter` in plugin entry**

Edit `src/plugin/main.ts`. Add the import:

```ts
import { ObsidianMetadataCacheAdapter } from '@/infrastructure/obsidian/ObsidianMetadataCacheAdapter'
```

Update the adapter construction (the `mcpServer` line around 50):

```ts
      mcpServer: new ObsidianMcpServerAdapter(
        this.bridge,
        new FeatureRepository(this.bridge, this.bridge, () => this.settings),
        () => this.settings.specsFolder,
        new ObsidianMetadataCacheAdapter(this.app),
      ),
```

- [ ] **Step 4.3: Update existing test constructor calls**

The existing tests construct the adapter without `metadataCache`. Update each call site to inject a fresh `MockMetadataCacheAdapter`.

Search for `new ObsidianMcpServerAdapter(` under `tests/` and update each — typically:

```ts
import { MockMetadataCacheAdapter } from '@/infrastructure/mock/MockMetadataCacheAdapter'
// ...
const metadataCache = new MockMetadataCacheAdapter()
adapter = new ObsidianMcpServerAdapter(
  vault,
  repo,
  () => DEFAULT_SETTINGS.specsFolder,
  metadataCache,
)
```

Files to touch (all in `tests/infrastructure/`):
- `obsidian-mcp-server-adapter.test.ts`
- `obsidian-mcp-server-adapter-tools.test.ts`
- `obsidian-mcp-server-adapter-workflow-tools.test.ts`

Also `tests/core/plugin-core-mcp.test.ts` if it directly constructs the adapter (search and update).

- [ ] **Step 4.4: Run typecheck, expect green**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4.5: Run existing MCP tests, expect green**

Run: `npx vitest run tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts tests/infrastructure/obsidian-mcp-server-adapter-workflow-tools.test.ts tests/infrastructure/obsidian-mcp-server-adapter.test.ts tests/core/plugin-core-mcp.test.ts`
Expected: PASS — existing tools unaffected.

- [ ] **Step 4.6: Commit**

```sh
git add src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts \
        src/plugin/main.ts \
        tests/infrastructure/obsidian-mcp-server-adapter*.test.ts \
        tests/core/plugin-core-mcp.test.ts
git commit -m "refactor(mcp): inject MetadataCachePort into ObsidianMcpServerAdapter"
```

---

### Task 5: Register metadata tools (3 reads)

**Files:**
- Modify: `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts`
- Create: `tests/infrastructure/obsidian-mcp-server-adapter-metadata-tools.test.ts`

- [ ] **Step 5.1: Write failing tests**

Create `tests/infrastructure/obsidian-mcp-server-adapter-metadata-tools.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { MockMetadataCacheAdapter } from '@/infrastructure/mock/MockMetadataCacheAdapter'
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

async function mcpPost(port: number, body: unknown): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Host: '127.0.0.1',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  const dataLine = text.split('\n').find((line) => line.startsWith('data: '))
  if (dataLine) return JSON.parse(dataLine.slice(6))
  return JSON.parse(text)
}

async function initMcp(port: number): Promise<void> {
  await mcpPost(port, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0.0.0' },
    },
  })
}

interface ToolResponse {
  result: { content: Array<{ type: string; text: string }>; isError?: boolean }
}

async function callTool(
  port: number,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  return mcpPost(port, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name, arguments: args },
  }) as Promise<ToolResponse>
}

function parseToolResult(resp: ToolResponse): unknown {
  return JSON.parse(resp.result.content[0].text)
}

describe('ObsidianMcpServerAdapter — metadata tools', () => {
  let adapter: ObsidianMcpServerAdapter
  let metadataCache: MockMetadataCacheAdapter
  let port: number

  beforeEach(async () => {
    const vault = new MockBridge({})
    const repo = new FeatureRepository(vault, vault, () => DEFAULT_SETTINGS)
    metadataCache = new MockMetadataCacheAdapter()
    adapter = new ObsidianMcpServerAdapter(
      vault,
      repo,
      () => DEFAULT_SETTINGS.specsFolder,
      metadataCache,
    )
    ;({ port } = await adapter.start())
    await initMcp(port)
  })

  afterEach(async () => {
    await adapter.stop()
  })

  describe('metadata_get_file_cache', () => {
    it('returns the seeded file metadata snapshot', async () => {
      metadataCache.seedMetadata('notes/foo.md', {
        path: 'notes/foo.md',
        tags: ['#feature'],
        frontmatter: { stage: 'idea' },
        links: ['notes/bar.md'],
        embeds: [],
      })
      const resp = await callTool(port, 'metadata_get_file_cache', { path: 'notes/foo.md' })
      expect(resp.result.isError).toBeFalsy()
      expect(parseToolResult(resp)).toEqual({
        snapshot: {
          path: 'notes/foo.md',
          tags: ['#feature'],
          frontmatter: { stage: 'idea' },
          links: ['notes/bar.md'],
          embeds: [],
        },
      })
    })

    it('returns snapshot: null when path is unknown', async () => {
      const resp = await callTool(port, 'metadata_get_file_cache', { path: 'missing.md' })
      expect(resp.result.isError).toBeFalsy()
      expect(parseToolResult(resp)).toEqual({ snapshot: null })
    })
  })

  describe('metadata_get_all_tags', () => {
    it('returns the tag count map', async () => {
      metadataCache.seedTags({ '#feature': 2, '#bug': 1 })
      const resp = await callTool(port, 'metadata_get_all_tags', {})
      expect(parseToolResult(resp)).toEqual({ tags: { '#feature': 2, '#bug': 1 } })
    })

    it('returns empty object when no tags seeded', async () => {
      const resp = await callTool(port, 'metadata_get_all_tags', {})
      expect(parseToolResult(resp)).toEqual({ tags: {} })
    })
  })

  describe('metadata_get_resolved_links', () => {
    it('returns the resolved link counts for the source', async () => {
      metadataCache.seedResolvedLinks('notes/foo.md', { 'notes/bar.md': 2, 'notes/baz.md': 1 })
      const resp = await callTool(port, 'metadata_get_resolved_links', {
        sourcePath: 'notes/foo.md',
      })
      expect(parseToolResult(resp)).toEqual({
        links: { 'notes/bar.md': 2, 'notes/baz.md': 1 },
      })
    })

    it('returns empty object for unknown source', async () => {
      const resp = await callTool(port, 'metadata_get_resolved_links', {
        sourcePath: 'unknown.md',
      })
      expect(parseToolResult(resp)).toEqual({ links: {} })
    })
  })
})
```

- [ ] **Step 5.2: Run tests, expect failure**

Run: `npx vitest run tests/infrastructure/obsidian-mcp-server-adapter-metadata-tools.test.ts`
Expected: FAIL — `metadata_get_file_cache` is not a registered tool (the MCP server reports the tool is unknown).

- [ ] **Step 5.3: Add `registerMetadataTools` and call it**

Edit `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts`. Update the import line for ports to include `MetadataCachePort` (already done in Task 4). Add a new registration function after `registerWorkflowTools`:

```ts
function registerMetadataTools(mcp: McpServer, metadataCache: MetadataCachePort): void {
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
```

Update `_handleMcpRequest` to call it:

```ts
  private async _handleMcpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const mcp = new McpServer({ name: 'specorator', version: '1.0.0' })
    registerTools(mcp, this.vault, this.proposalStore)
    registerWorkflowTools(
      mcp,
      this.repo,
      this.vault,
      this.proposalStore,
      this.specsFolder,
      this.advanceUseCase,
    )
    registerMetadataTools(mcp, this.metadataCache)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await mcp.connect(transport)
    try {
      await transport.handleRequest(req, res)
    } finally {
      await transport.close()
    }
  }
```

- [ ] **Step 5.4: Run tests, expect pass**

Run: `npx vitest run tests/infrastructure/obsidian-mcp-server-adapter-metadata-tools.test.ts`
Expected: PASS — 6 tests green.

- [ ] **Step 5.5: Commit**

```sh
git add src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts \
        tests/infrastructure/obsidian-mcp-server-adapter-metadata-tools.test.ts
git commit -m "feat(mcp): register metadata tool group (3 reads)"
```

---

### Task 6: Register links tools (4 reads + 1 write)

**Files:**
- Modify: `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts`
- Create: `tests/infrastructure/obsidian-mcp-server-adapter-links-tools.test.ts`

- [ ] **Step 6.1: Write failing tests**

Create `tests/infrastructure/obsidian-mcp-server-adapter-links-tools.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { MockMetadataCacheAdapter } from '@/infrastructure/mock/MockMetadataCacheAdapter'
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

async function mcpPost(port: number, body: unknown): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Host: '127.0.0.1',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  const dataLine = text.split('\n').find((line) => line.startsWith('data: '))
  if (dataLine) return JSON.parse(dataLine.slice(6))
  return JSON.parse(text)
}

async function initMcp(port: number): Promise<void> {
  await mcpPost(port, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0.0.0' },
    },
  })
}

interface ToolResponse {
  result: { content: Array<{ type: string; text: string }>; isError?: boolean }
}

async function callTool(
  port: number,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  return mcpPost(port, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name, arguments: args },
  }) as Promise<ToolResponse>
}

function parseToolResult(resp: ToolResponse): unknown {
  return JSON.parse(resp.result.content[0].text)
}

describe('ObsidianMcpServerAdapter — links tools', () => {
  let adapter: ObsidianMcpServerAdapter
  let vault: MockBridge
  let metadataCache: MockMetadataCacheAdapter
  let port: number

  beforeEach(async () => {
    vault = new MockBridge({
      'notes/foo.md': '# Foo\n\nBody',
    })
    const repo = new FeatureRepository(vault, vault, () => DEFAULT_SETTINGS)
    metadataCache = new MockMetadataCacheAdapter()
    adapter = new ObsidianMcpServerAdapter(
      vault,
      repo,
      () => DEFAULT_SETTINGS.specsFolder,
      metadataCache,
    )
    ;({ port } = await adapter.start())
    await initMcp(port)
  })

  afterEach(async () => {
    await adapter.stop()
  })

  describe('links_get_outgoing', () => {
    it('returns links from the seeded metadata snapshot', async () => {
      metadataCache.seedMetadata('notes/foo.md', {
        path: 'notes/foo.md',
        tags: [],
        frontmatter: {},
        links: ['notes/bar.md', 'notes/baz.md'],
        embeds: [],
      })
      const resp = await callTool(port, 'links_get_outgoing', { path: 'notes/foo.md' })
      expect(parseToolResult(resp)).toEqual({ links: ['notes/bar.md', 'notes/baz.md'] })
    })

    it('returns empty array when no metadata is cached', async () => {
      const resp = await callTool(port, 'links_get_outgoing', { path: 'unknown.md' })
      expect(parseToolResult(resp)).toEqual({ links: [] })
    })
  })

  describe('links_get_backlinks', () => {
    it('returns the seeded backlinks', async () => {
      metadataCache.seedBacklinks('notes/foo.md', ['notes/a.md', 'notes/b.md'])
      const resp = await callTool(port, 'links_get_backlinks', { path: 'notes/foo.md' })
      expect(parseToolResult(resp)).toEqual({ backlinks: ['notes/a.md', 'notes/b.md'] })
    })

    it('returns empty array when no backlinks seeded', async () => {
      const resp = await callTool(port, 'links_get_backlinks', { path: 'notes/foo.md' })
      expect(parseToolResult(resp)).toEqual({ backlinks: [] })
    })
  })

  describe('links_resolve', () => {
    it('returns the resolved destination via getFirstLinkpathDest', async () => {
      metadataCache.seedLinkpathDest('Bar', 'notes/foo.md', 'notes/bar.md')
      const resp = await callTool(port, 'links_resolve', {
        linktext: 'Bar',
        sourcePath: 'notes/foo.md',
      })
      expect(parseToolResult(resp)).toEqual({ resolved: 'notes/bar.md' })
    })

    it('returns resolved: null when unresolved', async () => {
      const resp = await callTool(port, 'links_resolve', {
        linktext: 'Missing',
        sourcePath: 'notes/foo.md',
      })
      expect(parseToolResult(resp)).toEqual({ resolved: null })
    })
  })

  describe('graph_traverse', () => {
    beforeEach(() => {
      // Graph: a → b → c, b ← d
      metadataCache.seedMetadata('a.md', {
        path: 'a.md', tags: [], frontmatter: {}, links: ['b.md'], embeds: [],
      })
      metadataCache.seedMetadata('b.md', {
        path: 'b.md', tags: [], frontmatter: {}, links: ['c.md'], embeds: [],
      })
      metadataCache.seedMetadata('c.md', {
        path: 'c.md', tags: [], frontmatter: {}, links: [], embeds: [],
      })
      metadataCache.seedMetadata('d.md', {
        path: 'd.md', tags: [], frontmatter: {}, links: ['b.md'], embeds: [],
      })
      metadataCache.seedBacklinks('b.md', ['a.md', 'd.md'])
      metadataCache.seedBacklinks('c.md', ['b.md'])
    })

    it('traverses outgoing links to depth 2', async () => {
      const resp = await callTool(port, 'graph_traverse', {
        startPath: 'a.md',
        depth: 2,
        direction: 'outgoing',
      })
      const result = parseToolResult(resp) as { nodes: string[]; edges: [string, string][] }
      expect(result.nodes.sort()).toEqual(['a.md', 'b.md', 'c.md'])
      expect(result.edges).toEqual(expect.arrayContaining([['a.md', 'b.md'], ['b.md', 'c.md']]))
    })

    it('traverses backlinks to depth 1', async () => {
      const resp = await callTool(port, 'graph_traverse', {
        startPath: 'b.md',
        depth: 1,
        direction: 'backlinks',
      })
      const result = parseToolResult(resp) as { nodes: string[]; edges: [string, string][] }
      expect(result.nodes.sort()).toEqual(['a.md', 'b.md', 'd.md'])
    })

    it('traverses both directions', async () => {
      const resp = await callTool(port, 'graph_traverse', {
        startPath: 'b.md',
        depth: 1,
        direction: 'both',
      })
      const result = parseToolResult(resp) as { nodes: string[]; edges: [string, string][] }
      expect(result.nodes.sort()).toEqual(['a.md', 'b.md', 'c.md', 'd.md'])
    })

    it('caps depth at 5', async () => {
      // Build a chain depth 10
      for (let i = 0; i < 10; i++) {
        metadataCache.seedMetadata(`n${i}.md`, {
          path: `n${i}.md`, tags: [], frontmatter: {},
          links: i < 9 ? [`n${i + 1}.md`] : [],
          embeds: [],
        })
      }
      const resp = await callTool(port, 'graph_traverse', {
        startPath: 'n0.md',
        depth: 100,
        direction: 'outgoing',
      })
      const result = parseToolResult(resp) as { nodes: string[] }
      // depth capped at 5 → nodes 0..5 visited (6 nodes)
      expect(result.nodes).toHaveLength(6)
    })

    it('handles cycles without infinite loop', async () => {
      metadataCache.seedMetadata('x.md', {
        path: 'x.md', tags: [], frontmatter: {}, links: ['y.md'], embeds: [],
      })
      metadataCache.seedMetadata('y.md', {
        path: 'y.md', tags: [], frontmatter: {}, links: ['x.md'], embeds: [],
      })
      const resp = await callTool(port, 'graph_traverse', {
        startPath: 'x.md',
        depth: 5,
        direction: 'outgoing',
      })
      const result = parseToolResult(resp) as { nodes: string[] }
      expect(result.nodes.sort()).toEqual(['x.md', 'y.md'])
    })
  })

  describe('links_add_to_note', () => {
    it('returns a pending proposal without mutating the file', async () => {
      const resp = await callTool(port, 'links_add_to_note', {
        path: 'notes/foo.md',
        target: 'notes/bar.md',
      })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { proposalId: string; status: string }
      expect(result.status).toBe('pending')
      expect(typeof result.proposalId).toBe('string')
      expect(await vault.readFile('notes/foo.md')).toBe('# Foo\n\nBody')
    })

    it('appends [[target]] when accepted', async () => {
      const resp = await callTool(port, 'links_add_to_note', {
        path: 'notes/foo.md',
        target: 'notes/bar.md',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      expect(await vault.readFile('notes/foo.md')).toBe('# Foo\n\nBody\n[[notes/bar.md]]')
    })

    it('appends [[target|display]] when displayText is given', async () => {
      const resp = await callTool(port, 'links_add_to_note', {
        path: 'notes/foo.md',
        target: 'notes/bar.md',
        displayText: 'see Bar',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      expect(await vault.readFile('notes/foo.md')).toBe('# Foo\n\nBody\n[[notes/bar.md|see Bar]]')
    })
  })
})
```

- [ ] **Step 6.2: Run tests, expect failure**

Run: `npx vitest run tests/infrastructure/obsidian-mcp-server-adapter-links-tools.test.ts`
Expected: FAIL — links tools not yet registered.

- [ ] **Step 6.3: Add `registerLinksTools` and call it**

Edit `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts`. Add `registerLinksTools` after `registerMetadataTools`:

```ts
function registerLinksTools(
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
      const cappedDepth = Math.min(depth, 5)
      const visited = new Set<string>([startPath])
      const edges: Array<[string, string]> = []
      let frontier: string[] = [startPath]
      for (let hop = 0; hop < cappedDepth; hop++) {
        const next: string[] = []
        for (const node of frontier) {
          const out =
            direction === 'outgoing' || direction === 'both'
              ? (metadataCache.getFileMetadata(node)?.links ?? [])
              : []
          const back =
            direction === 'backlinks' || direction === 'both'
              ? metadataCache.getBacklinks(node)
              : []
          for (const target of out) {
            edges.push([node, target])
            if (!visited.has(target)) {
              visited.add(target)
              next.push(target)
            }
          }
          for (const source of back) {
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
      return ok({ nodes: Array.from(visited), edges })
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
      const wikilink = displayText ? `[[${target}|${displayText}]]` : `[[${target}]]`
      const proposalId = store.queue('links_add_to_note', { path, target, displayText }, async () => {
        const existing = await vault.readFile(path)
        await vault.writeFile(path, `${existing}\n${wikilink}`)
      })
      return ok({ proposalId, status: 'pending' })
    },
  )
}
```

Update `_handleMcpRequest` to call it:

```ts
    registerMetadataTools(mcp, this.metadataCache)
    registerLinksTools(mcp, this.vault, this.metadataCache, this.proposalStore)
```

- [ ] **Step 6.4: Run tests, expect pass**

Run: `npx vitest run tests/infrastructure/obsidian-mcp-server-adapter-links-tools.test.ts`
Expected: PASS — all links tests green.

- [ ] **Step 6.5: Commit**

```sh
git add src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts \
        tests/infrastructure/obsidian-mcp-server-adapter-links-tools.test.ts
git commit -m "feat(mcp): register links tool group (4 reads + 1 write)"
```

---

### Task 7: Update existing tools/list assertion

**Files:**
- Modify: `tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts`

The existing assertion expects 16 tools. After PR1, the count is 24 (16 + 8). Update.

- [ ] **Step 7.1: Update the assertion**

In `tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts`, find the `tools/list` test and replace its expected list with the new sorted list including all 24 tool names:

```ts
      expect(names).toEqual([
        'frontmatter_get',
        'frontmatter_get_field',
        'frontmatter_set_field',
        'frontmatter_set_many',
        'graph_traverse',
        'links_add_to_note',
        'links_get_backlinks',
        'links_get_outgoing',
        'links_resolve',
        'metadata_get_all_tags',
        'metadata_get_file_cache',
        'metadata_get_resolved_links',
        'vault_append_to_note',
        'vault_create_folder',
        'vault_list_folder',
        'vault_read_note',
        'vault_search',
        'vault_write_note',
        'workflow_create_artifact',
        'workflow_get_quality_gates',
        'workflow_get_stage_artifacts',
        'workflow_get_state',
        'workflow_list_features',
        'workflow_propose_advance',
      ])
```

Also update the surrounding test name from `registers all 16 tools` to `registers all 24 tools`.

- [ ] **Step 7.2: Run the affected test, expect pass**

Run: `npx vitest run tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts`
Expected: PASS.

- [ ] **Step 7.3: Commit**

```sh
git add tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts
git commit -m "test(mcp): update tools/list expectation to 24 tools"
```

---

### Task 8: Verification gate

**Files:** none (verify only)

- [ ] **Step 8.1: Run the full verify gate**

Run: `npm run verify`
Expected: PASS — typecheck, lint, format check, tests, coverage thresholds (80/70/80/80) all green.

If any step fails, fix in place and re-run before opening the PR.

- [ ] **Step 8.2: Push and open PR**

```sh
git push -u origin feat/mcp-tools-193-metadata-links
gh pr create --base develop --title "feat(mcp): #193 PR1 — metadata + links tools" --body "$(cat <<'EOF'
## Summary

Adds 8 MCP tools to `ObsidianMcpServerAdapter` (3 metadata reads + 4 links reads + 1 links write) and a new `getFirstLinkpathDest` method on `MetadataCachePort` for in-process wikilink resolution.

Issue #193 PR1 of 3. PR2 adds canvas tools, PR3 adds bases tools.

Spec: `docs/superpowers/specs/2026-05-10-mcp-tools-193-design.md`

## Tools added

- `metadata_get_file_cache`, `metadata_get_all_tags`, `metadata_get_resolved_links`
- `links_get_outgoing`, `links_get_backlinks`, `links_resolve`, `graph_traverse`, `links_add_to_note`

## Acceptance (this PR)

- [x] Tools registered and reachable at `http://localhost:{port}/mcp`
- [x] `links_resolve` uses `MetadataCachePort.getFirstLinkpathDest()` — not CLI shell-out
- [x] `links_add_to_note` returns `{ proposalId, status: 'pending' }`
- [x] Unit tests for both tool groups
- [x] `npm run verify` green

## Test plan

- [ ] CI green on `develop` target
- [ ] Manual smoke: enable plugin, point an MCP client at the localhost URL, exercise `metadata_get_all_tags` and `links_resolve`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

- [ ] Spec coverage: PR1 covers all metadata (3) + links (5) tools and the `getFirstLinkpathDest` port addition. Canvas (PR2) + bases (PR3) deferred per spec.
- [ ] No placeholders.
- [ ] Type names consistent: `MetadataCachePort`, `ProposalStore`, `MockMetadataCacheAdapter`, `ObsidianMcpServerAdapter` used identically across tasks.
- [ ] Constructor parameter order documented: `(vault, repo, specsFolder, metadataCache)` — used the same in tests, plugin entry, and existing test fixups.
