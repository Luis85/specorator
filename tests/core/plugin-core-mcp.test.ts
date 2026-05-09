import '../../src/core/core-events'
import { describe, it, expect } from 'vitest'
import { PluginCore, type CorePorts } from '@/core/plugin-core'
import { fakeModulePorts } from '../__fakes__/fake-ports'
import { MockObsidianMcpServerAdapter } from '@/infrastructure/mock/MockObsidianMcpServerAdapter'
import type { ObsidianMcpServerPort } from '@/domain/ports'

function makePorts(overrides?: Partial<CorePorts>): CorePorts {
  const { settings, vault, workspace, notifications, logger, t } = fakeModulePorts()
  return { settings, vault, workspace, notifications, logger, t, ...overrides }
}

describe('PluginCore MCP server lifecycle', () => {
  it('starts the MCP server during init', async () => {
    const mcpServer = new MockObsidianMcpServerAdapter()
    const core = new PluginCore([], makePorts({ mcpServer }))
    await core.init({})
    expect(mcpServer.started).toBe(true)
  })

  it('stops the MCP server during destroy', async () => {
    const mcpServer = new MockObsidianMcpServerAdapter()
    const core = new PluginCore([], makePorts({ mcpServer }))
    await core.init({})
    await core.destroy()
    expect(mcpServer.started).toBe(false)
  })

  it('init succeeds without mcpServer', async () => {
    const core = new PluginCore([], makePorts())
    await expect(core.init({})).resolves.toBeUndefined()
  })

  it('destroy continues and logs error when stop() throws', async () => {
    const ports = makePorts()
    const mcpServer: ObsidianMcpServerPort = {
      start: async () => ({ port: 3001 }),
      stop: async () => { throw new Error('stop failed') },
      getConnectionConfig: () => ({ transport: 'http', url: 'http://127.0.0.1:3001/mcp' }),
    }
    const core = new PluginCore([], { ...ports, mcpServer })
    await core.init({})
    await expect(core.destroy()).resolves.toBeUndefined()
    expect(ports.logger.error).toHaveBeenCalledWith(
      'MCP server stop failed',
      expect.any(Error),
    )
  })

  it('starts MCP server after all modules are initialized', async () => {
    const order: string[] = []
    const mcpServer: ObsidianMcpServerPort = {
      start: async () => { order.push('mcp:start'); return { port: 3001 } },
      stop: async () => { order.push('mcp:stop') },
      getConnectionConfig: () => ({ transport: 'http', url: 'http://127.0.0.1:3001/mcp' }),
    }
    const mod = {
      id: 'a',
      init: () => { order.push('module:init') },
    }
    const core = new PluginCore([mod], makePorts({ mcpServer }))
    await core.init({})
    expect(order).toEqual(['module:init', 'mcp:start'])
  })
})
