import { describe, it, expect, vi } from 'vitest'
import { McpServerLifecycle } from '@/core/mcp-server-lifecycle'
import { MockObsidianMcpServerAdapter } from '@/infrastructure/mock/MockObsidianMcpServerAdapter'
import { fakeModulePorts } from '../__fakes__/fake-ports'
import type { LoggerPort, ObsidianMcpServerPort } from '@/domain/ports'

function makeLogger(): LoggerPort {
  return fakeModulePorts().logger
}

describe('McpServerLifecycle.start', () => {
  it('starts the adapter when the gate is open', async () => {
    const port = new MockObsidianMcpServerAdapter()
    const lifecycle = new McpServerLifecycle({ port, isEnabled: () => true, logger: makeLogger() })
    await lifecycle.start()
    expect(port.started).toBe(true)
    expect(lifecycle.isRunning()).toBe(true)
  })

  it('is a no-op when the gate is closed', async () => {
    const port = new MockObsidianMcpServerAdapter()
    const startSpy = vi.spyOn(port, 'start')
    const lifecycle = new McpServerLifecycle({ port, isEnabled: () => false, logger: makeLogger() })
    await lifecycle.start()
    expect(startSpy).not.toHaveBeenCalled()
    expect(lifecycle.isRunning()).toBe(false)
  })

  it('is a no-op when isEnabled is omitted (default disabled)', async () => {
    const port = new MockObsidianMcpServerAdapter()
    const startSpy = vi.spyOn(port, 'start')
    const lifecycle = new McpServerLifecycle({ port, logger: makeLogger() })
    await lifecycle.start()
    expect(startSpy).not.toHaveBeenCalled()
    expect(lifecycle.isRunning()).toBe(false)
  })

  it('is a no-op when port is undefined', async () => {
    const lifecycle = new McpServerLifecycle({ isEnabled: () => true, logger: makeLogger() })
    await expect(lifecycle.start()).resolves.toBeUndefined()
    expect(lifecycle.isRunning()).toBe(false)
  })

  it('is idempotent — second start() does not call adapter.start again', async () => {
    const port = new MockObsidianMcpServerAdapter()
    const startSpy = vi.spyOn(port, 'start')
    const lifecycle = new McpServerLifecycle({ port, isEnabled: () => true, logger: makeLogger() })
    await lifecycle.start()
    await lifecycle.start()
    expect(startSpy).toHaveBeenCalledTimes(1)
  })

  it('logs error and stays stopped when adapter.start throws', async () => {
    const logger = makeLogger()
    const port: ObsidianMcpServerPort = {
      start: async () => { throw new Error('start failed') },
      stop: async () => {},
      getConnectionConfig: () => ({ transport: 'http', url: 'http://127.0.0.1:3001/mcp' }),
    }
    const lifecycle = new McpServerLifecycle({ port, isEnabled: () => true, logger })
    await lifecycle.start()
    expect(logger.error).toHaveBeenCalledWith('MCP server start failed', expect.any(Error))
    expect(lifecycle.isRunning()).toBe(false)
  })
})

describe('McpServerLifecycle.stop', () => {
  it('stops a running adapter', async () => {
    const port = new MockObsidianMcpServerAdapter()
    const lifecycle = new McpServerLifecycle({ port, isEnabled: () => true, logger: makeLogger() })
    await lifecycle.start()
    await lifecycle.stop()
    expect(port.started).toBe(false)
    expect(lifecycle.isRunning()).toBe(false)
  })

  it('is a no-op when not running', async () => {
    const port = new MockObsidianMcpServerAdapter()
    const stopSpy = vi.spyOn(port, 'stop')
    const lifecycle = new McpServerLifecycle({ port, isEnabled: () => true, logger: makeLogger() })
    await lifecycle.stop()
    expect(stopSpy).not.toHaveBeenCalled()
  })

  it('is a no-op when port is undefined', async () => {
    const lifecycle = new McpServerLifecycle({ isEnabled: () => true, logger: makeLogger() })
    await expect(lifecycle.stop()).resolves.toBeUndefined()
  })

  it('is idempotent — second stop() does not call adapter.stop again', async () => {
    const port = new MockObsidianMcpServerAdapter()
    const stopSpy = vi.spyOn(port, 'stop')
    const lifecycle = new McpServerLifecycle({ port, isEnabled: () => true, logger: makeLogger() })
    await lifecycle.start()
    await lifecycle.stop()
    await lifecycle.stop()
    expect(stopSpy).toHaveBeenCalledTimes(1)
  })

  it('logs error and clears running flag when adapter.stop throws', async () => {
    const logger = makeLogger()
    const port: ObsidianMcpServerPort = {
      start: async () => ({ port: 3001 }),
      stop: async () => { throw new Error('stop failed') },
      getConnectionConfig: () => ({ transport: 'http', url: 'http://127.0.0.1:3001/mcp' }),
    }
    const lifecycle = new McpServerLifecycle({ port, isEnabled: () => true, logger })
    await lifecycle.start()
    await lifecycle.stop()
    expect(logger.error).toHaveBeenCalledWith('MCP server stop failed', expect.any(Error))
    // PluginCore treats the server as stopped after a failed stop so future
    // start calls aren't permanently blocked.
    expect(lifecycle.isRunning()).toBe(false)
  })
})

describe('McpServerLifecycle.syncRunning', () => {
  it('starts when desired and not running', async () => {
    let enabled = false
    const port = new MockObsidianMcpServerAdapter()
    const lifecycle = new McpServerLifecycle({ port, isEnabled: () => enabled, logger: makeLogger() })
    enabled = true
    await lifecycle.syncRunning()
    expect(lifecycle.isRunning()).toBe(true)
  })

  it('stops when not desired and running', async () => {
    let enabled = true
    const port = new MockObsidianMcpServerAdapter()
    const lifecycle = new McpServerLifecycle({ port, isEnabled: () => enabled, logger: makeLogger() })
    await lifecycle.start()
    expect(lifecycle.isRunning()).toBe(true)
    enabled = false
    await lifecycle.syncRunning()
    expect(lifecycle.isRunning()).toBe(false)
  })

  it('is a no-op when desired matches running', async () => {
    const port = new MockObsidianMcpServerAdapter()
    const stopSpy = vi.spyOn(port, 'stop')
    const lifecycle = new McpServerLifecycle({ port, isEnabled: () => false, logger: makeLogger() })
    await lifecycle.syncRunning()
    expect(stopSpy).not.toHaveBeenCalled()
    expect(lifecycle.isRunning()).toBe(false)
  })

  it('is a no-op when port is undefined', async () => {
    const lifecycle = new McpServerLifecycle({ isEnabled: () => true, logger: makeLogger() })
    await expect(lifecycle.syncRunning()).resolves.toBeUndefined()
  })

  it('serialises concurrent calls — later start wins over an in-flight stop', async () => {
    let enabled = true
    let resolveStop: () => void = () => {}
    const port: ObsidianMcpServerPort = {
      start: async () => ({ port: 3001 }),
      stop: () => new Promise<void>(resolve => { resolveStop = resolve }),
      getConnectionConfig: () => ({ transport: 'http', url: 'http://127.0.0.1:3001/mcp' }),
    }
    const lifecycle = new McpServerLifecycle({ port, isEnabled: () => enabled, logger: makeLogger() })
    await lifecycle.start()
    expect(lifecycle.isRunning()).toBe(true)

    // Trigger stop — stop() will block until resolveStop() is called.
    enabled = false
    const firstSync = lifecycle.syncRunning()

    // Before stop completes, queue a start.
    enabled = true
    const secondSync = lifecycle.syncRunning()

    resolveStop()
    await Promise.all([firstSync, secondSync])

    expect(lifecycle.isRunning()).toBe(true)
  })

  it('reads isEnabled fresh on each sync — last enqueued call wins', async () => {
    let enabled = false
    const port = new MockObsidianMcpServerAdapter()
    const lifecycle = new McpServerLifecycle({ port, isEnabled: () => enabled, logger: makeLogger() })

    enabled = true
    const first = lifecycle.syncRunning()
    enabled = false
    const second = lifecycle.syncRunning()

    await Promise.all([first, second])
    expect(lifecycle.isRunning()).toBe(false)
  })

  it('swallows errors from the chained start/stop without breaking subsequent syncs', async () => {
    let enabled = true
    const port: ObsidianMcpServerPort = {
      start: async () => { throw new Error('start failed') },
      stop: async () => {},
      getConnectionConfig: () => ({ transport: 'http', url: 'http://127.0.0.1:3001/mcp' }),
    }
    const lifecycle = new McpServerLifecycle({ port, isEnabled: () => enabled, logger: makeLogger() })
    await lifecycle.syncRunning() // start throws, chain swallows
    enabled = false
    await lifecycle.syncRunning() // chain still functional
    expect(lifecycle.isRunning()).toBe(false)
  })
})
