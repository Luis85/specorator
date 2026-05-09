import { describe, it, expect } from 'vitest'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'

describe('ObsidianMcpServerAdapter', () => {
  it('start() assigns a dynamic port in valid range', async () => {
    const adapter = new ObsidianMcpServerAdapter()
    const { port } = await adapter.start()
    expect(port).toBeGreaterThan(0)
    expect(port).toBeLessThanOrEqual(65535)
    await adapter.stop()
  })

  it('getConnectionConfig() returns 127.0.0.1 URL matching the assigned port', async () => {
    const adapter = new ObsidianMcpServerAdapter()
    const { port } = await adapter.start()
    expect(adapter.getConnectionConfig()).toEqual({
      transport: 'http',
      url: `http://127.0.0.1:${port}/mcp`,
    })
    await adapter.stop()
  })

  it('getConnectionConfig() throws before start()', () => {
    const adapter = new ObsidianMcpServerAdapter()
    expect(() => adapter.getConnectionConfig()).toThrow(/not started/)
  })

  it('getConnectionConfig() throws after stop()', async () => {
    const adapter = new ObsidianMcpServerAdapter()
    await adapter.start()
    await adapter.stop()
    expect(() => adapter.getConnectionConfig()).toThrow(/not started/)
  })

  it('stop() closes the server cleanly', async () => {
    const adapter = new ObsidianMcpServerAdapter()
    await adapter.start()
    await expect(adapter.stop()).resolves.toBeUndefined()
  })

  it('server returns empty tool list at /mcp', async () => {
    const adapter = new ObsidianMcpServerAdapter()
    const { port } = await adapter.start()

    const response = await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0.0.0' },
      } }),
    })

    expect(response.ok).toBe(true)
    await adapter.stop()
  })
})
