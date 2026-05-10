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
    const repo = new FeatureRepository(vault, vault, () => DEFAULT_SETTINGS)
    adapter = new ObsidianMcpServerAdapter(vault, repo, () => SPECS_FOLDER)
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
      const emptyRepo = new FeatureRepository(emptyVault, emptyVault, () => DEFAULT_SETTINGS)
      const emptyAdapter = new ObsidianMcpServerAdapter(emptyVault, emptyRepo, () => SPECS_FOLDER)
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
