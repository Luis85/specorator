import '../../src/core/core-events'
import { describe, it, expect, vi } from 'vitest'
import { PluginCore, type CorePorts } from '@/core/plugin-core'
import { fakeModulePorts } from '../__fakes__/fake-ports'
import { MockObsidianMcpServerAdapter } from '@/infrastructure/mock/MockObsidianMcpServerAdapter'
import { coreSettingsModule } from '@/core/core-settings'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import type { ObsidianMcpServerPort } from '@/domain/ports'
import type { ModuleDescriptor } from '@/modules'

// PluginCore's module list is typed against the generic default `Record<string, unknown>`.
// `coreSettingsModule` is `ModuleDescriptor<PluginSettings>` (a stricter S); the registry in
// src/modules/index.ts uses `ModuleDescriptor<any>` to bridge this — mirror that here.
const coreSettingsModuleAsAny = coreSettingsModule as unknown as ModuleDescriptor

function makePorts(overrides?: Partial<CorePorts>): CorePorts {
  const { settings, vault, workspace, notifications, logger, t } = fakeModulePorts()
  return { settings, vault, workspace, notifications, logger, t, ...overrides }
}

describe('PluginCore MCP server lifecycle', () => {
  it('starts the MCP server during init when enabled', async () => {
    const mcpServer = new MockObsidianMcpServerAdapter()
    const core = new PluginCore([], makePorts({ mcpServer, isMcpServerEnabled: () => true }))
    await core.init({})
    expect(mcpServer.started).toBe(true)
    expect(core.isMcpServerRunning()).toBe(true)
  })

  it('does NOT start the MCP server during init when disabled (default)', async () => {
    const mcpServer = new MockObsidianMcpServerAdapter()
    const startSpy = vi.spyOn(mcpServer, 'start')
    const core = new PluginCore([], makePorts({ mcpServer, isMcpServerEnabled: () => false }))
    await core.init({})
    expect(startSpy).not.toHaveBeenCalled()
    expect(mcpServer.started).toBe(false)
    expect(core.isMcpServerRunning()).toBe(false)
  })

  it('does NOT start the MCP server when isMcpServerEnabled is omitted', async () => {
    const mcpServer = new MockObsidianMcpServerAdapter()
    const startSpy = vi.spyOn(mcpServer, 'start')
    const core = new PluginCore([], makePorts({ mcpServer }))
    await core.init({})
    expect(startSpy).not.toHaveBeenCalled()
    expect(core.isMcpServerRunning()).toBe(false)
  })

  it('stops the MCP server during destroy', async () => {
    const mcpServer = new MockObsidianMcpServerAdapter()
    const core = new PluginCore([], makePorts({ mcpServer, isMcpServerEnabled: () => true }))
    await core.init({})
    await core.destroy()
    expect(mcpServer.started).toBe(false)
    expect(core.isMcpServerRunning()).toBe(false)
  })

  it('init succeeds without mcpServer', async () => {
    const core = new PluginCore([], makePorts())
    await expect(core.init({})).resolves.toBeUndefined()
  })

  it('destroy continues and logs error when stop() throws', async () => {
    const ports = makePorts({ isMcpServerEnabled: () => true })
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
    // PluginCore treats the server as stopped after a failed stop so future
    // start calls aren't permanently blocked.
    expect(core.isMcpServerRunning()).toBe(false)
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
    const core = new PluginCore([mod], makePorts({ mcpServer, isMcpServerEnabled: () => true }))
    await core.init({})
    expect(order).toEqual(['module:init', 'mcp:start'])
  })
})

describe('PluginCore MCP server force-start (explicit command)', () => {
  it('startMcpServer({ force: true }) starts even when the gate says disabled', async () => {
    const mcpServer = new MockObsidianMcpServerAdapter()
    const core = new PluginCore([], makePorts({ mcpServer, isMcpServerEnabled: () => false }))
    await core.init({})
    expect(mcpServer.started).toBe(false)

    await core.startMcpServer({ force: true })
    expect(mcpServer.started).toBe(true)
    expect(core.isMcpServerRunning()).toBe(true)
  })

  it('startMcpServer() without force respects the gate', async () => {
    const mcpServer = new MockObsidianMcpServerAdapter()
    const core = new PluginCore([], makePorts({ mcpServer, isMcpServerEnabled: () => false }))
    await core.init({})

    await core.startMcpServer()
    expect(mcpServer.started).toBe(false)
  })
})

describe('PluginCore MCP server idempotency', () => {
  it('start called twice invokes adapter.start only once', async () => {
    const mcpServer = new MockObsidianMcpServerAdapter()
    const startSpy = vi.spyOn(mcpServer, 'start')
    const core = new PluginCore([], makePorts({ mcpServer, isMcpServerEnabled: () => true }))
    await core.init({}) // first start via auto-start path
    await core.startMcpServer({ force: true }) // second call — should be no-op
    expect(startSpy).toHaveBeenCalledTimes(1)
  })

  it('stop called twice invokes adapter.stop only once', async () => {
    const mcpServer = new MockObsidianMcpServerAdapter()
    const stopSpy = vi.spyOn(mcpServer, 'stop')
    const core = new PluginCore([], makePorts({ mcpServer, isMcpServerEnabled: () => true }))
    await core.init({})
    await core.stopMcpServer()
    await core.stopMcpServer() // second call — should be no-op
    expect(stopSpy).toHaveBeenCalledTimes(1)
  })
})

describe('PluginCore MCP server settings-toggle sync', () => {
  it('toggling mcpServerEnabled=true via notifySettingsChanged starts the server', async () => {
    const mcpServer = new MockObsidianMcpServerAdapter()
    let enabled = false
    const core = new PluginCore([coreSettingsModuleAsAny], makePorts({
      mcpServer,
      isMcpServerEnabled: () => enabled,
    }))
    await core.init({})
    expect(mcpServer.started).toBe(false)

    enabled = true
    await core.notifySettingsChanged('specorator', { ...DEFAULT_SETTINGS, mcpServerEnabled: true })
    expect(mcpServer.started).toBe(true)
    expect(core.isMcpServerRunning()).toBe(true)
  })

  it('toggling mcpServerEnabled=false via notifySettingsChanged stops the server', async () => {
    const mcpServer = new MockObsidianMcpServerAdapter()
    let enabled = true
    const core = new PluginCore([coreSettingsModuleAsAny], makePorts({
      mcpServer,
      isMcpServerEnabled: () => enabled,
    }))
    await core.init({})
    expect(mcpServer.started).toBe(true)

    enabled = false
    await core.notifySettingsChanged('specorator', { ...DEFAULT_SETTINGS, mcpServerEnabled: false })
    expect(mcpServer.started).toBe(false)
    expect(core.isMcpServerRunning()).toBe(false)
  })
})
