import { describe, it, expect } from 'vitest'
import { ObsidianClaudeCliAdapter } from '@/infrastructure/obsidian/ObsidianClaudeCliAdapter'
import { MockObsidianMcpServerAdapter } from '@/infrastructure/mock/MockObsidianMcpServerAdapter'

describe('ObsidianClaudeCliAdapter', () => {
  it('getMcpCliArgs() returns --mcp-url flag pair from server connection config', () => {
    const mcpServer = new MockObsidianMcpServerAdapter(3001)
    const adapter = new ObsidianClaudeCliAdapter(mcpServer)
    const args = adapter.getMcpCliArgs()
    expect(args).toEqual(['--mcp-url', 'http://localhost:3001/mcp'])
  })

  it('getMcpCliArgs() reflects a different port when adapter uses a different port', () => {
    const mcpServer = new MockObsidianMcpServerAdapter(4242)
    const adapter = new ObsidianClaudeCliAdapter(mcpServer)
    const args = adapter.getMcpCliArgs()
    expect(args).toEqual(['--mcp-url', 'http://localhost:4242/mcp'])
  })
})
