# MCP Workflow Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 MCP workflow tools to `ObsidianMcpServerAdapter` — 4 read tools delegating to `IFeatureRepository` and 2 write stubs returning pending proposals.

**Architecture:** Extend the existing `ObsidianMcpServerAdapter` with a new `registerWorkflowTools()` function (parallel to the existing `registerTools()`). The adapter constructor gains two new required params: `repo: IFeatureRepository` and `specsFolder: string`. All 6 tools are registered on the same MCP server instance per request.

**Tech Stack:** TypeScript, MCP SDK (`@modelcontextprotocol/sdk`), Zod, Vitest, `MockBridge` for test isolation, `FeatureRepository` for domain access.

---

## File Map

| Action | Path | Purpose |
|---|---|---|
| Modify | `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts` | Add constructor params + `registerWorkflowTools()` |
| Modify | `src/plugin/main.ts` | Update `ObsidianMcpServerAdapter` call site |
| Modify | `tests/infrastructure/obsidian-mcp-server-adapter.test.ts` | Update 8 adapter instantiation sites |
| Modify | `tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts` | Update `beforeEach` + fix `tools/list` count (10 → 16) |
| Create | `tests/infrastructure/obsidian-mcp-server-adapter-workflow-tools.test.ts` | All 6 workflow tool tests |

---

## Task 1: Extend `ObsidianMcpServerAdapter` constructor + update call sites

**Files:**
- Modify: `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts`
- Modify: `src/plugin/main.ts`
- Modify: `tests/infrastructure/obsidian-mcp-server-adapter.test.ts`
- Modify: `tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts`

- [ ] **Step 1: Add new imports + constructor params to adapter**

In `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts`, add these imports after the existing imports:

```ts
import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import { getAllStepMeta, getStepMeta } from '@/domain/feature/FeatureStep'
import { Slug } from '@/domain/shared/Slug'
```

Replace the class constructor:

```ts
export class ObsidianMcpServerAdapter implements ObsidianMcpServerPort {
  private readonly proposalStore = new ProposalStore()
  private httpServer: http.Server | null = null
  private assignedPort = 0

  constructor(
    private readonly vault: VaultPort,
    private readonly repo: IFeatureRepository,
    private readonly specsFolder: string,
  ) {}
```

In `_handleMcpRequest`, add the `registerWorkflowTools` call right after `registerTools`:

```ts
  private async _handleMcpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const mcp = new McpServer({ name: 'specorator', version: '1.0.0' })
    registerTools(mcp, this.vault, this.proposalStore)
    registerWorkflowTools(mcp, this.repo, this.vault, this.proposalStore, this.specsFolder)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await mcp.connect(transport)
    try {
      await transport.handleRequest(req, res)
    } finally {
      await transport.close()
    }
  }
```

Add a skeleton `registerWorkflowTools` function (empty — tools added in later tasks) after `registerTools`:

```ts
function registerWorkflowTools(
  mcp: McpServer,
  repo: IFeatureRepository,
  vault: VaultPort,
  store: ProposalStore,
  specsFolder: string,
): void {
  // tools added in Tasks 3–7
}
```

- [ ] **Step 2: Update `main.ts` call site**

In `src/plugin/main.ts`, add this import after the `ObsidianMcpServerAdapter` import:

```ts
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
```

Replace the adapter instantiation inside `onload()`:

```ts
      mcpServer: new ObsidianMcpServerAdapter(
        this.bridge,
        new FeatureRepository(this.bridge, this.bridge, this.settings),
        this.settings.specsFolder,
      ),
```

- [ ] **Step 3: Update `tests/infrastructure/obsidian-mcp-server-adapter.test.ts`**

Add imports at the top:

```ts
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
```

Add a helper function before the `describe` block:

```ts
function makeAdapter(files: Record<string, string> = {}): ObsidianMcpServerAdapter {
  const vault = new MockBridge(files)
  const repo = new FeatureRepository(vault, vault, DEFAULT_SETTINGS)
  return new ObsidianMcpServerAdapter(vault, repo, DEFAULT_SETTINGS.specsFolder)
}
```

Replace every `new ObsidianMcpServerAdapter(new MockBridge())` with `makeAdapter()`. There are 8 occurrences (all in the file). The `http` import and all other code stays unchanged.

- [ ] **Step 4: Update `beforeEach` in `tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts`**

Add imports at the top of the file:

```ts
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
```

Replace the `beforeEach` block:

```ts
  beforeEach(async () => {
    vault = new MockBridge(VAULT_FILES)
    const repo = new FeatureRepository(vault, vault, DEFAULT_SETTINGS)
    adapter = new ObsidianMcpServerAdapter(vault, repo, DEFAULT_SETTINGS.specsFolder)
    ;({ port } = await adapter.start())
    await initMcp(port)
  })
```

- [ ] **Step 5: Run typecheck — expect zero errors**

```sh
npm run typecheck
```

Expected: exits with code 0, no output.

- [ ] **Step 6: Run existing adapter tests — expect all pass**

```sh
npx vitest run tests/infrastructure/obsidian-mcp-server-adapter.test.ts tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts
```

Expected: all tests pass (8 + 32 = 40 tests).

- [ ] **Step 7: Commit**

```sh
git add src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts src/plugin/main.ts tests/infrastructure/obsidian-mcp-server-adapter.test.ts tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts
git commit -m "refactor(mcp): extend adapter constructor with repo + specsFolder"
```

---

## Task 2: Create failing test file for all 6 workflow tools

**Files:**
- Create: `tests/infrastructure/obsidian-mcp-server-adapter-workflow-tools.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SPECS_FOLDER = 'specs'

const DARK_MODE_WORKFLOW_STATE = [
  '---',
  'id: abc123',
  'slug: dark-mode',
  'feature: "Dark Mode"',
  'area: "DM"',
  'status: active',
  'currentStep: 3',
  'current_stage: requirements',
  'last_updated: 2026-01-01',
  'last_agent: ""',
  'artifacts:',
  '  idea: complete',
  '  research: complete',
  '  requirements: in-progress',
  '  design: pending',
  '  spec: pending',
  '  tasks: pending',
  '  implementation-log: pending',
  '  test-plan: pending',
  '  test-report: pending',
  '  review: pending',
  '  release-notes: pending',
  '  retrospective: pending',
  'createdAt: 2026-01-01T00:00:00.000Z',
  'updatedAt: 2026-01-01T00:00:00.000Z',
  '---',
  '',
].join('\n')

const LIGHT_MODE_WORKFLOW_STATE = [
  '---',
  'id: def456',
  'slug: light-mode',
  'feature: "Light Mode"',
  'area: "LM"',
  'status: draft',
  'currentStep: 1',
  'current_stage: idea',
  'last_updated: 2026-01-02',
  'last_agent: ""',
  'artifacts:',
  '  idea: complete',
  '  research: pending',
  '  requirements: pending',
  '  design: pending',
  '  spec: pending',
  '  tasks: pending',
  '  implementation-log: pending',
  '  test-plan: pending',
  '  test-report: pending',
  '  review: pending',
  '  release-notes: pending',
  '  retrospective: pending',
  'createdAt: 2026-01-02T00:00:00.000Z',
  'updatedAt: 2026-01-02T00:00:00.000Z',
  '---',
  '',
].join('\n')

const VAULT_FILES = {
  'specs/dark-mode/workflow-state.md': DARK_MODE_WORKFLOW_STATE,
  'specs/dark-mode/idea.md': '# Idea\n',
  'specs/dark-mode/research.md': '# Research\n',
  // requirements.md intentionally absent — tests exist: false
  'specs/light-mode/workflow-state.md': LIGHT_MODE_WORKFLOW_STATE,
  'specs/light-mode/idea.md': '# Light Mode Idea\n',
}

// ── Helpers (same pattern as obsidian-mcp-server-adapter-tools.test.ts) ───────

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ObsidianMcpServerAdapter — workflow tools', () => {
  let vault: MockBridge
  let adapter: ObsidianMcpServerAdapter
  let port: number

  beforeEach(async () => {
    vault = new MockBridge(VAULT_FILES)
    const repo = new FeatureRepository(vault, vault, DEFAULT_SETTINGS)
    adapter = new ObsidianMcpServerAdapter(vault, repo, SPECS_FOLDER)
    ;({ port } = await adapter.start())
    await initMcp(port)
  })

  afterEach(async () => {
    await adapter.stop()
  })

  // ── workflow_get_state ────────────────────────────────────────────────────

  describe('workflow_get_state', () => {
    it('returns full feature DTO for existing slug', async () => {
      const resp = await callTool(port, 'workflow_get_state', { slug: 'dark-mode' })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as Record<string, unknown>
      expect(result.id).toBe('abc123')
      expect(result.slug).toBe('dark-mode')
      expect(result.title).toBe('Dark Mode')
      expect(result.status).toBe('active')
      expect(result.currentStep).toBe(3)
    })

    it('returns isError for unknown slug', async () => {
      const resp = await callTool(port, 'workflow_get_state', { slug: 'not-found' })
      expect(resp.result.isError).toBe(true)
    })
  })

  // ── workflow_list_features ────────────────────────────────────────────────

  describe('workflow_list_features', () => {
    it('returns all features with slug, stage, and title', async () => {
      const resp = await callTool(port, 'workflow_list_features', {})
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as {
        features: Array<{ slug: string; stage: string; title: string }>
      }
      expect(result.features).toHaveLength(2)
      const darkMode = result.features.find((f) => f.slug === 'dark-mode')
      expect(darkMode).toBeDefined()
      expect(darkMode?.stage).toBe('requirements')
      expect(darkMode?.title).toBe('Dark Mode')
    })

    it('returns empty array when specs folder has no features', async () => {
      const emptyVault = new MockBridge({})
      const emptyRepo = new FeatureRepository(emptyVault, emptyVault, DEFAULT_SETTINGS)
      const emptyAdapter = new ObsidianMcpServerAdapter(emptyVault, emptyRepo, SPECS_FOLDER)
      const { port: emptyPort } = await emptyAdapter.start()
      await initMcp(emptyPort)
      const resp = await callTool(emptyPort, 'workflow_list_features', {})
      const result = parseToolResult(resp) as { features: unknown[] }
      expect(result.features).toHaveLength(0)
      await emptyAdapter.stop()
    })
  })

  // ── workflow_get_stage_artifacts ──────────────────────────────────────────

  describe('workflow_get_stage_artifacts', () => {
    it('returns all 12 artifacts with correct exists flags and current stage', async () => {
      const resp = await callTool(port, 'workflow_get_stage_artifacts', { slug: 'dark-mode' })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as {
        stage: string
        artifacts: Array<{ slug: string; path: string; exists: boolean }>
      }
      expect(result.stage).toBe('requirements')
      expect(result.artifacts).toHaveLength(12)
      const idea = result.artifacts.find((a) => a.slug === 'idea')
      expect(idea?.exists).toBe(true)
      expect(idea?.path).toBe('specs/dark-mode/idea.md')
      const research = result.artifacts.find((a) => a.slug === 'research')
      expect(research?.exists).toBe(true)
      const requirements = result.artifacts.find((a) => a.slug === 'requirements')
      expect(requirements?.exists).toBe(false)
      expect(requirements?.path).toBe('specs/dark-mode/requirements.md')
    })

    it('returns isError for unknown slug', async () => {
      const resp = await callTool(port, 'workflow_get_stage_artifacts', { slug: 'not-found' })
      expect(resp.result.isError).toBe(true)
    })
  })

  // ── workflow_get_quality_gates ────────────────────────────────────────────

  describe('workflow_get_quality_gates', () => {
    it('returns all 12 gates in correct order', async () => {
      const resp = await callTool(port, 'workflow_get_quality_gates', {})
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as {
        gates: Array<{ number: number; slug: string; fileName: string }>
      }
      expect(result.gates).toHaveLength(12)
      expect(result.gates[0]).toEqual({ number: 1, slug: 'idea', fileName: 'idea.md' })
      expect(result.gates[11]).toEqual({
        number: 12,
        slug: 'retrospective',
        fileName: 'retrospective.md',
      })
    })
  })

  // ── workflow_create_artifact ──────────────────────────────────────────────

  describe('workflow_create_artifact', () => {
    it('returns pending proposal receipt without mutating the vault', async () => {
      const resp = await callTool(port, 'workflow_create_artifact', {
        slug: 'dark-mode',
        stage: 'design',
      })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { proposalId: string; status: string }
      expect(result.status).toBe('pending')
      expect(typeof result.proposalId).toBe('string')
      expect(result.proposalId.length).toBeGreaterThan(0)
      expect(await vault.fileExists('specs/dark-mode/design.md')).toBe(false)
    })
  })

  // ── workflow_propose_advance ──────────────────────────────────────────────

  describe('workflow_propose_advance', () => {
    it('returns pending proposal receipt without advancing the feature', async () => {
      const resp = await callTool(port, 'workflow_propose_advance', { slug: 'dark-mode' })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { proposalId: string; status: string }
      expect(result.status).toBe('pending')
      expect(typeof result.proposalId).toBe('string')
      expect(result.proposalId.length).toBeGreaterThan(0)
      // workflow-state.md must remain unchanged
      const state = await vault.readFile('specs/dark-mode/workflow-state.md')
      expect(state).toContain('currentStep: 3')
    })
  })
})
```

- [ ] **Step 2: Run tests — expect all to fail with "tool not found" errors**

```sh
npx vitest run tests/infrastructure/obsidian-mcp-server-adapter-workflow-tools.test.ts
```

Expected: all 8 tests fail. The `isError` tests will pass but others will fail because the tools don't exist yet. This confirms the test file wires up correctly.

---

## Task 3: Implement `workflow_get_state`

**Files:**
- Modify: `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts`

- [ ] **Step 1: Add the tool inside `registerWorkflowTools`**

Replace the `// tools added in Tasks 3–7` comment in `registerWorkflowTools` with:

```ts
  mcp.registerTool(
    'workflow_get_state',
    {
      description: 'Get the full workflow state for a feature by slug',
      inputSchema: { slug: z.string().describe('Feature slug') },
    },
    async ({ slug }) => {
      const feature = await repo.findBySlug(Slug.reconstitute(slug))
      if (!feature) throw new Error(`Feature not found: ${slug}`)
      return ok(feature.toPlainObject())
    },
  )

  // tools added in Tasks 4–7
```

- [ ] **Step 2: Run the `workflow_get_state` tests — expect both to pass**

```sh
npx vitest run tests/infrastructure/obsidian-mcp-server-adapter-workflow-tools.test.ts -t "workflow_get_state"
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```sh
git add src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts
git commit -m "feat(mcp): add workflow_get_state tool"
```

---

## Task 4: Implement `workflow_list_features`

**Files:**
- Modify: `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts`

- [ ] **Step 1: Add the tool inside `registerWorkflowTools`**

After the `workflow_get_state` registration, add:

```ts
  mcp.registerTool(
    'workflow_list_features',
    {
      description: 'List all features with their current stage and title',
      inputSchema: {},
    },
    async () => {
      const features = await repo.findAll()
      return ok({
        features: features.map((f) => ({
          slug: f.slug.toString(),
          stage: getStepMeta(f.currentStep)?.slug ?? 'unknown',
          title: f.title,
        })),
      })
    },
  )
```

- [ ] **Step 2: Run `workflow_list_features` tests — expect both to pass**

```sh
npx vitest run tests/infrastructure/obsidian-mcp-server-adapter-workflow-tools.test.ts -t "workflow_list_features"
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```sh
git add src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts
git commit -m "feat(mcp): add workflow_list_features tool"
```

---

## Task 5: Implement `workflow_get_stage_artifacts`

**Files:**
- Modify: `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts`

- [ ] **Step 1: Add the tool inside `registerWorkflowTools`**

After the `workflow_list_features` registration, add:

```ts
  mcp.registerTool(
    'workflow_get_stage_artifacts',
    {
      description: 'Get all stage artifact files for a feature and their vault existence status',
      inputSchema: { slug: z.string().describe('Feature slug') },
    },
    async ({ slug }) => {
      const feature = await repo.findBySlug(Slug.reconstitute(slug))
      if (!feature) throw new Error(`Feature not found: ${slug}`)
      const stage = getStepMeta(feature.currentStep)?.slug ?? 'unknown'
      const artifacts = await Promise.all(
        getAllStepMeta().map(async (meta) => {
          const path = `${specsFolder}/${slug}/${meta.fileName}`
          const exists = await vault.fileExists(path)
          return { slug: meta.slug, path, exists }
        }),
      )
      return ok({ stage, artifacts })
    },
  )
```

- [ ] **Step 2: Run `workflow_get_stage_artifacts` tests — expect both to pass**

```sh
npx vitest run tests/infrastructure/obsidian-mcp-server-adapter-workflow-tools.test.ts -t "workflow_get_stage_artifacts"
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```sh
git add src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts
git commit -m "feat(mcp): add workflow_get_stage_artifacts tool"
```

---

## Task 6: Implement `workflow_get_quality_gates`

**Files:**
- Modify: `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts`

- [ ] **Step 1: Add the tool inside `registerWorkflowTools`**

After the `workflow_get_stage_artifacts` registration, add:

```ts
  mcp.registerTool(
    'workflow_get_quality_gates',
    {
      description: 'Get all 12 workflow stage definitions (quality gates) in order',
      inputSchema: {},
    },
    async () => ok({ gates: getAllStepMeta() }),
  )
```

- [ ] **Step 2: Run `workflow_get_quality_gates` tests — expect 1 to pass**

```sh
npx vitest run tests/infrastructure/obsidian-mcp-server-adapter-workflow-tools.test.ts -t "workflow_get_quality_gates"
```

Expected: 1 test passes.

- [ ] **Step 3: Commit**

```sh
git add src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts
git commit -m "feat(mcp): add workflow_get_quality_gates tool"
```

---

## Task 7: Implement `workflow_create_artifact` and `workflow_propose_advance` stubs

**Files:**
- Modify: `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts`

- [ ] **Step 1: Add both stubs inside `registerWorkflowTools`**

After the `workflow_get_quality_gates` registration, add both tools and remove the `// tools added in Tasks 4–7` comment:

```ts
  mcp.registerTool(
    'workflow_create_artifact',
    {
      description: 'Queue a request to create a stage artifact — stub pending #191',
      inputSchema: {
        slug: z.string().describe('Feature slug'),
        stage: z.string().describe('Stage slug (e.g. "design")'),
      },
    },
    async ({ slug, stage }) => {
      const proposalId = store.queue('workflow_create_artifact', { slug, stage }, async () => {})
      return ok({ proposalId, status: 'pending' })
    },
  )

  mcp.registerTool(
    'workflow_propose_advance',
    {
      description: 'Queue a proposal to advance a feature to the next stage — stub pending #191',
      inputSchema: { slug: z.string().describe('Feature slug') },
    },
    async ({ slug }) => {
      const proposalId = store.queue('workflow_propose_advance', { slug }, async () => {})
      return ok({ proposalId, status: 'pending' })
    },
  )
```

- [ ] **Step 2: Run write stub tests — expect both to pass**

```sh
npx vitest run tests/infrastructure/obsidian-mcp-server-adapter-workflow-tools.test.ts -t "workflow_create_artifact|workflow_propose_advance"
```

Expected: 2 tests pass.

- [ ] **Step 3: Run the full workflow tools test file — expect all 8 to pass**

```sh
npx vitest run tests/infrastructure/obsidian-mcp-server-adapter-workflow-tools.test.ts
```

Expected: 8 tests pass, 0 failures.

- [ ] **Step 4: Commit**

```sh
git add src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts
git commit -m "feat(mcp): add workflow_create_artifact and workflow_propose_advance stubs"
```

---

## Task 8: Update `tools/list` count assertion

**Files:**
- Modify: `tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts`

- [ ] **Step 1: Update the assertion and expected list**

Find the `tools/list` describe block. It currently asserts 10 tools. Replace the whole block:

```ts
  describe('tools/list', () => {
    it('registers all 16 tools', async () => {
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
        'workflow_create_artifact',
        'workflow_get_quality_gates',
        'workflow_get_stage_artifacts',
        'workflow_get_state',
        'workflow_list_features',
        'workflow_propose_advance',
      ])
    })
  })
```

- [ ] **Step 2: Run both existing adapter test files — expect all to pass**

```sh
npx vitest run tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts tests/infrastructure/obsidian-mcp-server-adapter.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```sh
git add tests/infrastructure/obsidian-mcp-server-adapter-tools.test.ts
git commit -m "test(mcp): update tools/list assertion to 16 tools"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run full test suite and verify gate**

```sh
npm run verify
```

Expected: typecheck, lint, and all tests pass. Coverage thresholds met (80/70/80/80).

- [ ] **Step 2: If verify passes — done**

All 6 tools implemented, tests passing, `npm run verify` green.

Open PR targeting `develop` with title: `feat(mcp): workflow tools — 6 tools (issue #192)`.
