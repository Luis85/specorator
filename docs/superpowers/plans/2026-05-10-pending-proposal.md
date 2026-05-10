# PendingProposal Mechanism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace write-tool stubs in `ObsidianMcpServerAdapter` with a real proposal queue so MCP write tools return a receipt instead of mutating the vault directly, and accept/reject calls apply or discard the mutation.

**Architecture:** A new `ProposalStore` class (instance-level on the adapter) holds a `Map<proposalId, ProposalEntry>` where each entry captures a `mutate` closure at queue time. Write tools call `store.queue()` and return `{ proposalId, status: 'pending' }`. The adapter exposes `acceptProposal`, `rejectProposal`, and `getProposals` as public methods (not on the port interface).

**Tech Stack:** TypeScript, `node:crypto` (randomUUID), `yaml` (parse + stringify, already a dependency), Vitest, `@modelcontextprotocol/sdk`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/infrastructure/obsidian/ProposalStore.ts` | **Create** | `PendingProposal` type, `ProposalStore` class |
| `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts` | **Modify** | Wire store, update write tools, add public methods, add `applyFrontmatterUpdate` |
| `tests/infrastructure/proposal-store.test.ts` | **Create** | Pure unit tests for `ProposalStore` (no HTTP) |
| `tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts` | **Modify** | Replace stub assertions with real accept/reject behavior tests |

---

## Task 1: Write failing `ProposalStore` unit tests

**Files:**
- Create: `tests/infrastructure/proposal-store.test.ts`

- [ ] **Step 1.1: Create the test file**

```ts
import { describe, it, expect, vi } from 'vitest'
import { ProposalStore } from '@/infrastructure/obsidian/ProposalStore'

describe('ProposalStore', () => {
  describe('queue()', () => {
    it('returns a non-empty string proposalId', () => {
      const store = new ProposalStore()
      const id = store.queue('vault_write_note', { path: 'a.md' }, async () => {})
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    })

    it('returns a unique id for each call', () => {
      const store = new ProposalStore()
      const id1 = store.queue('vault_write_note', {}, async () => {})
      const id2 = store.queue('vault_write_note', {}, async () => {})
      expect(id1).not.toBe(id2)
    })
  })

  describe('getAll()', () => {
    it('returns queued proposal with status pending and correct shape', () => {
      const store = new ProposalStore()
      const params = { path: 'a.md', content: 'hi' }
      const id = store.queue('vault_write_note', params, async () => {})
      const all = store.getAll()
      expect(all).toHaveLength(1)
      expect(all[0]).toEqual({
        proposalId: id,
        toolName: 'vault_write_note',
        params,
        status: 'pending',
      })
    })

    it('does not expose mutate closure', () => {
      const store = new ProposalStore()
      store.queue('vault_write_note', {}, async () => {})
      const all = store.getAll()
      expect('mutate' in all[0]).toBe(false)
    })

    it('returns all queued proposals', () => {
      const store = new ProposalStore()
      store.queue('vault_write_note', {}, async () => {})
      store.queue('vault_append_to_note', {}, async () => {})
      expect(store.getAll()).toHaveLength(2)
    })
  })

  describe('get()', () => {
    it('returns the proposal for a known id', () => {
      const store = new ProposalStore()
      const id = store.queue('vault_write_note', { path: 'x.md' }, async () => {})
      const p = store.get(id)
      expect(p?.proposalId).toBe(id)
      expect(p?.status).toBe('pending')
    })

    it('returns undefined for unknown id', () => {
      const store = new ProposalStore()
      expect(store.get('no-such-id')).toBeUndefined()
    })

    it('does not expose mutate closure', () => {
      const store = new ProposalStore()
      const id = store.queue('vault_write_note', {}, async () => {})
      expect('mutate' in store.get(id)!).toBe(false)
    })
  })

  describe('accept()', () => {
    it('calls mutate fn exactly once and sets status to accepted', async () => {
      const store = new ProposalStore()
      const mutate = vi.fn().mockResolvedValue(undefined)
      const id = store.queue('vault_write_note', {}, mutate)
      await store.accept(id)
      expect(mutate).toHaveBeenCalledOnce()
      expect(store.get(id)?.status).toBe('accepted')
    })

    it('throws on unknown id', async () => {
      const store = new ProposalStore()
      await expect(store.accept('no-such-id')).rejects.toThrow('no-such-id')
    })

    it('throws when already accepted', async () => {
      const store = new ProposalStore()
      const id = store.queue('vault_write_note', {}, async () => {})
      await store.accept(id)
      await expect(store.accept(id)).rejects.toThrow(id)
    })

    it('throws when already rejected', async () => {
      const store = new ProposalStore()
      const id = store.queue('vault_write_note', {}, async () => {})
      store.reject(id)
      await expect(store.accept(id)).rejects.toThrow(id)
    })
  })

  describe('reject()', () => {
    it('sets status to rejected without calling mutate', () => {
      const store = new ProposalStore()
      const mutate = vi.fn().mockResolvedValue(undefined)
      const id = store.queue('vault_write_note', {}, mutate)
      store.reject(id)
      expect(mutate).not.toHaveBeenCalled()
      expect(store.get(id)?.status).toBe('rejected')
    })

    it('throws on unknown id', () => {
      const store = new ProposalStore()
      expect(() => store.reject('no-such-id')).toThrow('no-such-id')
    })

    it('throws when already accepted', async () => {
      const store = new ProposalStore()
      const id = store.queue('vault_write_note', {}, async () => {})
      await store.accept(id)
      expect(() => store.reject(id)).toThrow(id)
    })

    it('throws when already rejected', () => {
      const store = new ProposalStore()
      const id = store.queue('vault_write_note', {}, async () => {})
      store.reject(id)
      expect(() => store.reject(id)).toThrow(id)
    })
  })
})
```

- [ ] **Step 1.2: Run tests — confirm they fail**

```
npx vitest run tests/infrastructure/proposal-store.test.ts
```

Expected: all tests FAIL with `Cannot find module '@/infrastructure/obsidian/ProposalStore'`.

---

## Task 2: Implement `ProposalStore`

**Files:**
- Create: `src/infrastructure/obsidian/ProposalStore.ts`

- [ ] **Step 2.1: Create the implementation**

```ts
import { randomUUID } from 'node:crypto'

export type PendingProposal = {
  proposalId: string
  toolName: string
  params: unknown
  status: 'pending' | 'accepted' | 'rejected'
}

type ProposalEntry = PendingProposal & { mutate: () => Promise<void> }

export class ProposalStore {
  private readonly entries = new Map<string, ProposalEntry>()

  queue(toolName: string, params: unknown, mutate: () => Promise<void>): string {
    const proposalId = randomUUID()
    this.entries.set(proposalId, { proposalId, toolName, params, status: 'pending', mutate })
    return proposalId
  }

  async accept(proposalId: string): Promise<void> {
    const entry = this.#getOrThrow(proposalId)
    this.#assertPending(entry)
    await entry.mutate()
    entry.status = 'accepted'
  }

  reject(proposalId: string): void {
    const entry = this.#getOrThrow(proposalId)
    this.#assertPending(entry)
    entry.status = 'rejected'
  }

  getAll(): ReadonlyArray<PendingProposal> {
    return Array.from(this.entries.values()).map(({ mutate: _m, ...rest }) => rest)
  }

  get(proposalId: string): PendingProposal | undefined {
    const entry = this.entries.get(proposalId)
    if (!entry) return undefined
    const { mutate: _m, ...rest } = entry
    return rest
  }

  #getOrThrow(proposalId: string): ProposalEntry {
    const entry = this.entries.get(proposalId)
    if (!entry) throw new Error(`Unknown proposal: ${proposalId}`)
    return entry
  }

  #assertPending(entry: ProposalEntry): void {
    if (entry.status !== 'pending')
      throw new Error(`Proposal not pending: ${entry.proposalId} (${entry.status})`)
  }
}
```

- [ ] **Step 2.2: Run tests — confirm they pass**

```
npx vitest run tests/infrastructure/proposal-store.test.ts
```

Expected: all 14 tests PASS.

- [ ] **Step 2.3: Commit**

```
git add src/infrastructure/obsidian/ProposalStore.ts tests/infrastructure/proposal-store.test.ts
git commit -m "feat(mcp): add ProposalStore — queue/accept/reject for write tool proposals"
```

---

## Task 3: Update `ObsidianMcpServerAdapter`

**Files:**
- Modify: `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts`

Replace the entire file content. Changes from the current version:
- Delete `STUB_PROPOSAL_ID` constant
- Import `stringify as stringifyYaml` from `yaml`
- Import `ProposalStore` and `PendingProposal` from `./ProposalStore`
- Add `applyFrontmatterUpdate` module-level async function
- Add `private readonly proposalStore = new ProposalStore()` field on the class
- Add `acceptProposal`, `rejectProposal`, `getProposals` public methods
- Update `registerTools` signature to accept `store: ProposalStore` as third param
- Replace stub returns in write tools with `store.queue(...)` calls
- Pass `this.proposalStore` to `registerTools` in `_handleMcpRequest`

- [ ] **Step 3.1: Replace file content**

```ts
import * as http from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { ObsidianMcpServerPort, McpConnectionConfig, VaultPort } from '@/domain/ports'
import { ProposalStore, type PendingProposal } from './ProposalStore'

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (!match) return {}
  try {
    const result = parseYaml(match[1]) as unknown
    if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
      return result as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

async function applyFrontmatterUpdate(
  vault: VaultPort,
  path: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const content = await vault.readFile(path)
  const existing = parseFrontmatter(content)
  const merged = { ...existing, ...updates }
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  await vault.writeFile(path, `---\n${stringifyYaml(merged)}---\n${body}`)
}

function joinVaultPath(parent: string, child: string): string {
  const p = parent.replace(/\/+$/, '')
  return p ? `${p}/${child}` : child
}

async function collectFiles(vault: VaultPort, folder: string): Promise<string[]> {
  const [files, subfolders] = await Promise.all([vault.listFiles(folder), vault.listFolders(folder)])
  const nested = await Promise.all(
    subfolders.map((sub) => collectFiles(vault, joinVaultPath(folder, sub))),
  )
  return [...files, ...nested.flat()]
}

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
}

function registerTools(mcp: McpServer, vault: VaultPort, store: ProposalStore): void {
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
      inputSchema: { path: z.string(), field: z.string(), value: z.any() },
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

export class ObsidianMcpServerAdapter implements ObsidianMcpServerPort {
  private readonly proposalStore = new ProposalStore()
  private httpServer: http.Server | null = null
  private assignedPort = 0

  constructor(private readonly vault: VaultPort) {}

  async acceptProposal(proposalId: string): Promise<void> {
    await this.proposalStore.accept(proposalId)
  }

  rejectProposal(proposalId: string): void {
    this.proposalStore.reject(proposalId)
  }

  getProposals(): ReadonlyArray<PendingProposal> {
    return this.proposalStore.getAll()
  }

  async start(): Promise<{ port: number }> {
    const server = http.createServer((req, res) => {
      const host = req.headers.host?.split(':')[0] ?? ''
      if (host !== '127.0.0.1' && host !== 'localhost') {
        res.writeHead(421).end()
        return
      }
      if (req.url === '/mcp') {
        void this._handleMcpRequest(req, res).catch(() => {
          if (!res.headersSent) res.writeHead(500).end()
        })
      } else {
        res.writeHead(404).end()
      }
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })

    const addr = server.address()
    const port = addr !== null && typeof addr === 'object' ? addr.port : 0

    this.httpServer = server
    this.assignedPort = port

    return { port }
  }

  private async _handleMcpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const mcp = new McpServer({ name: 'specorator', version: '1.0.0' })
    registerTools(mcp, this.vault, this.proposalStore)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await mcp.connect(transport)
    try {
      await transport.handleRequest(req, res)
    } finally {
      await transport.close()
    }
  }

  async stop(): Promise<void> {
    const server = this.httpServer
    if (server !== null) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err !== undefined) reject(err)
          else resolve()
        })
      })
    }
    this.httpServer = null
    this.assignedPort = 0
  }

  getConnectionConfig(): McpConnectionConfig {
    if (this.assignedPort === 0) {
      throw new Error('MCP server not started — call start() first')
    }
    return { transport: 'http', url: `http://127.0.0.1:${this.assignedPort}/mcp` }
  }
}
```

- [ ] **Step 3.2: Run typecheck**

```
npm run typecheck
```

Expected: no errors.

---

## Task 4: Update integration tests

**Files:**
- Modify: `tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts`

Replace the entire file. Key changes from current version:
- Delete `const STUB_PROPOSAL_ID` constant
- Add `parseFrontmatter` helper (copy of the module-level one — needed to verify accept results)
- Replace stub-assertion write tool tests with real vault-mutation tests
- Keep all read tool tests and `tools/list` test unchanged

- [ ] **Step 4.1: Replace file content**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { parse as parseYaml } from 'yaml'

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
  result: {
    content: Array<{ type: string; text: string }>
    isError?: boolean
  }
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

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (!match) return {}
  try {
    const result = parseYaml(match[1]) as unknown
    if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
      return result as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

const VAULT_FILES = {
  'notes/hello.md': '# Hello\n\nWorld content here',
  'notes/another.md': '# Another\n\nSome other stuff',
  'specs/dark-mode/workflow-state.md':
    '---\nid: abc123\nslug: dark-mode\nstatus: active\ncurrentStep: 3\n---\nBody content',
  'specs/dark-mode/idea.md': '# Idea\n\nSome idea content',
}

describe('ObsidianMcpServerAdapter — vault + frontmatter tools', () => {
  let adapter: ObsidianMcpServerAdapter
  let vault: MockBridge
  let port: number

  beforeEach(async () => {
    vault = new MockBridge(VAULT_FILES)
    adapter = new ObsidianMcpServerAdapter(vault)
    ;({ port } = await adapter.start())
    await initMcp(port)
  })

  afterEach(async () => {
    await adapter.stop()
  })

  describe('tools/list', () => {
    it('registers all 10 tools', async () => {
      const resp = (await mcpPost(port, {
        jsonrpc: '2.0',
        id: 99,
        method: 'tools/list',
        params: {},
      })) as { result: { tools: Array<{ name: string }> } }
      const names = resp.result.tools.map((t) => t.name).sort()
      expect(names).toEqual([
        'frontmatter_get',
        'frontmatter_get_field',
        'frontmatter_set_field',
        'frontmatter_set_many',
        'vault_append_to_note',
        'vault_create_folder',
        'vault_list_folder',
        'vault_read_note',
        'vault_search',
        'vault_write_note',
      ])
    })
  })

  describe('vault_read_note', () => {
    it('returns file content for existing path', async () => {
      const resp = await callTool(port, 'vault_read_note', { path: 'notes/hello.md' })
      expect(resp.result.isError).toBeFalsy()
      expect(parseToolResult(resp)).toEqual({ content: '# Hello\n\nWorld content here' })
    })

    it('returns isError when file not found', async () => {
      const resp = await callTool(port, 'vault_read_note', { path: 'missing.md' })
      expect(resp.result.isError).toBe(true)
    })
  })

  describe('vault_write_note', () => {
    it('returns a pending proposal receipt without mutating the vault', async () => {
      const resp = await callTool(port, 'vault_write_note', {
        path: 'notes/new.md',
        content: '# New note',
      })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { proposalId: string; status: string }
      expect(result.status).toBe('pending')
      expect(typeof result.proposalId).toBe('string')
      expect(result.proposalId.length).toBeGreaterThan(0)
      expect(await vault.fileExists('notes/new.md')).toBe(false)
    })

    it('accept writes the note content to the vault', async () => {
      const resp = await callTool(port, 'vault_write_note', {
        path: 'notes/new.md',
        content: '# New note',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      expect(await vault.readFile('notes/new.md')).toBe('# New note')
    })

    it('reject leaves the vault unchanged', async () => {
      const resp = await callTool(port, 'vault_write_note', {
        path: 'notes/new.md',
        content: '# New note',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      adapter.rejectProposal(proposalId)
      expect(await vault.fileExists('notes/new.md')).toBe(false)
    })
  })

  describe('vault_append_to_note', () => {
    it('returns a pending proposal receipt without mutating the vault', async () => {
      const resp = await callTool(port, 'vault_append_to_note', {
        path: 'notes/hello.md',
        content: '\n\nAppended text',
      })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { proposalId: string; status: string }
      expect(result.status).toBe('pending')
      expect(await vault.readFile('notes/hello.md')).toBe('# Hello\n\nWorld content here')
    })

    it('accept appends the content to the existing file', async () => {
      const resp = await callTool(port, 'vault_append_to_note', {
        path: 'notes/hello.md',
        content: '\n\nAppended text',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      expect(await vault.readFile('notes/hello.md')).toBe(
        '# Hello\n\nWorld content here\n\nAppended text',
      )
    })

    it('reject leaves the vault unchanged', async () => {
      const resp = await callTool(port, 'vault_append_to_note', {
        path: 'notes/hello.md',
        content: '\n\nAppended text',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      adapter.rejectProposal(proposalId)
      expect(await vault.readFile('notes/hello.md')).toBe('# Hello\n\nWorld content here')
    })
  })

  describe('vault_search', () => {
    it('returns files containing the query string (case-insensitive)', async () => {
      const resp = await callTool(port, 'vault_search', { query: 'world', folder: 'notes' })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { matches: Array<{ path: string; excerpt: string }> }
      const paths = result.matches.map((m) => m.path)
      expect(paths).toContain('notes/hello.md')
      expect(paths).not.toContain('notes/another.md')
    })

    it('returns empty matches when nothing found', async () => {
      const resp = await callTool(port, 'vault_search', {
        query: 'zzz-no-match',
        folder: 'notes',
      })
      expect(parseToolResult(resp)).toEqual({ matches: [] })
    })

    it('searches recursively across subfolders', async () => {
      const resp = await callTool(port, 'vault_search', { query: 'idea', folder: 'specs' })
      const result = parseToolResult(resp) as { matches: Array<{ path: string }> }
      expect(result.matches.map((m) => m.path)).toContain('specs/dark-mode/idea.md')
    })

    it('produces no double-slash paths when folder has trailing slash', async () => {
      const resp = await callTool(port, 'vault_search', { query: 'idea', folder: 'specs/' })
      const result = parseToolResult(resp) as { matches: Array<{ path: string }> }
      expect(result.matches.every((m) => !m.path.includes('//'))).toBe(true)
      expect(result.matches.map((m) => m.path)).toContain('specs/dark-mode/idea.md')
    })
  })

  describe('vault_list_folder', () => {
    it('returns files in the given folder', async () => {
      const resp = await callTool(port, 'vault_list_folder', { folder: 'notes' })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { files: string[]; folders: string[] }
      expect(result.files).toContain('notes/hello.md')
      expect(result.files).toContain('notes/another.md')
    })

    it('returns subfolders as full paths', async () => {
      const resp = await callTool(port, 'vault_list_folder', { folder: 'specs' })
      const result = parseToolResult(resp) as { files: string[]; folders: string[] }
      expect(result.folders).toContain('specs/dark-mode')
    })

    it('produces no double-slash paths when folder has trailing slash', async () => {
      const resp = await callTool(port, 'vault_list_folder', { folder: 'specs/' })
      const result = parseToolResult(resp) as { files: string[]; folders: string[] }
      expect(result.folders.every((f) => !f.includes('//'))).toBe(true)
      expect(result.folders).toContain('specs/dark-mode')
    })
  })

  describe('vault_create_folder', () => {
    it('returns created: true', async () => {
      const resp = await callTool(port, 'vault_create_folder', { path: 'new-folder' })
      expect(resp.result.isError).toBeFalsy()
      expect(parseToolResult(resp)).toEqual({ created: true })
    })
  })

  describe('frontmatter_get', () => {
    it('returns all frontmatter fields', async () => {
      const resp = await callTool(port, 'frontmatter_get', {
        path: 'specs/dark-mode/workflow-state.md',
      })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { frontmatter: Record<string, unknown> }
      expect(result.frontmatter).toMatchObject({
        id: 'abc123',
        slug: 'dark-mode',
        status: 'active',
      })
    })

    it('returns empty frontmatter for note without frontmatter', async () => {
      const resp = await callTool(port, 'frontmatter_get', { path: 'notes/hello.md' })
      expect(resp.result.isError).toBeFalsy()
      expect(parseToolResult(resp)).toEqual({ frontmatter: {} })
    })

    it('returns isError when file not found', async () => {
      const resp = await callTool(port, 'frontmatter_get', { path: 'missing.md' })
      expect(resp.result.isError).toBe(true)
    })
  })

  describe('frontmatter_get_field', () => {
    it('returns value for existing field', async () => {
      const resp = await callTool(port, 'frontmatter_get_field', {
        path: 'specs/dark-mode/workflow-state.md',
        field: 'slug',
      })
      expect(resp.result.isError).toBeFalsy()
      expect(parseToolResult(resp)).toEqual({ field: 'slug', value: 'dark-mode' })
    })

    it('returns null for field not present in frontmatter', async () => {
      const resp = await callTool(port, 'frontmatter_get_field', {
        path: 'specs/dark-mode/workflow-state.md',
        field: 'nonexistent',
      })
      expect(parseToolResult(resp)).toEqual({ field: 'nonexistent', value: null })
    })

    it('returns isError when file not found', async () => {
      const resp = await callTool(port, 'frontmatter_get_field', {
        path: 'missing.md',
        field: 'slug',
      })
      expect(resp.result.isError).toBe(true)
    })
  })

  describe('frontmatter_set_field', () => {
    it('returns a pending proposal receipt without mutating the vault', async () => {
      const resp = await callTool(port, 'frontmatter_set_field', {
        path: 'specs/dark-mode/workflow-state.md',
        field: 'status',
        value: 'draft',
      })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { proposalId: string; status: string }
      expect(result.status).toBe('pending')
      const unchanged = await vault.readFile('specs/dark-mode/workflow-state.md')
      expect(parseFrontmatter(unchanged).status).toBe('active')
    })

    it('accept merges the field while preserving other frontmatter and body', async () => {
      const resp = await callTool(port, 'frontmatter_set_field', {
        path: 'specs/dark-mode/workflow-state.md',
        field: 'status',
        value: 'draft',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      const updated = await vault.readFile('specs/dark-mode/workflow-state.md')
      const fm = parseFrontmatter(updated)
      expect(fm.status).toBe('draft')
      expect(fm.id).toBe('abc123')
      expect(fm.slug).toBe('dark-mode')
      expect(updated).toContain('Body content')
    })

    it('reject leaves the vault unchanged', async () => {
      const resp = await callTool(port, 'frontmatter_set_field', {
        path: 'specs/dark-mode/workflow-state.md',
        field: 'status',
        value: 'draft',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      adapter.rejectProposal(proposalId)
      const unchanged = await vault.readFile('specs/dark-mode/workflow-state.md')
      expect(parseFrontmatter(unchanged).status).toBe('active')
    })
  })

  describe('frontmatter_set_many', () => {
    it('returns a pending proposal receipt without mutating the vault', async () => {
      const resp = await callTool(port, 'frontmatter_set_many', {
        path: 'specs/dark-mode/workflow-state.md',
        fields: { status: 'done', newField: 42 },
      })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { proposalId: string; status: string }
      expect(result.status).toBe('pending')
      const unchanged = await vault.readFile('specs/dark-mode/workflow-state.md')
      expect(parseFrontmatter(unchanged).status).toBe('active')
    })

    it('accept merges all fields while preserving other frontmatter and body', async () => {
      const resp = await callTool(port, 'frontmatter_set_many', {
        path: 'specs/dark-mode/workflow-state.md',
        fields: { status: 'done', newField: 42 },
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      const updated = await vault.readFile('specs/dark-mode/workflow-state.md')
      const fm = parseFrontmatter(updated)
      expect(fm.status).toBe('done')
      expect(fm.newField).toBe(42)
      expect(fm.id).toBe('abc123')
      expect(updated).toContain('Body content')
    })

    it('reject leaves the vault unchanged', async () => {
      const resp = await callTool(port, 'frontmatter_set_many', {
        path: 'specs/dark-mode/workflow-state.md',
        fields: { status: 'done', newField: 42 },
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      adapter.rejectProposal(proposalId)
      const unchanged = await vault.readFile('specs/dark-mode/workflow-state.md')
      expect(parseFrontmatter(unchanged).status).toBe('active')
    })
  })
})
```

- [ ] **Step 4.2: Run all MCP tests — confirm they pass**

```
npx vitest run tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts tests/infrastructure/obsidian-mcp-server-adapter.test.ts tests/infrastructure/proposal-store.test.ts tests/core/plugin-core-mcp.test.ts
```

Expected: all tests PASS.

- [ ] **Step 4.3: Commit**

```
git add src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts
git commit -m "feat(mcp): wire ProposalStore into adapter — write tools queue proposals, accept/reject apply or discard mutations"
```

---

## Task 5: Verify and close

- [ ] **Step 5.1: Run full verify gate**

```
npm run verify
```

Expected: typecheck, lint, all tests, coverage thresholds — all green. If coverage drops below threshold (80/70/80/80), it means a branch in `ProposalStore` or `applyFrontmatterUpdate` is untested — add the missing test case and re-run.

- [ ] **Step 5.2: Confirm issue acceptance criteria**

Check each item from issue #191:
- `PendingProposal` type defined → `src/infrastructure/obsidian/ProposalStore.ts`
- In-memory store inside adapter layer → `ProposalStore` held on `ObsidianMcpServerAdapter`
- Write tools return `{ proposalId, status: 'pending' }` with no vault mutation → verified by integration tests
- `acceptProposal()` applies mutation, status `'accepted'` → verified by integration + unit tests
- `rejectProposal()` sets `'rejected'`, vault unchanged → verified by integration + unit tests
- Store accessible to sidebar module (read-only accessor) → `adapter.getProposals()` exists
- Unit tests: queue, accept, reject flows → `tests/infrastructure/proposal-store.test.ts`
- `npm run verify` green → Step 5.1
