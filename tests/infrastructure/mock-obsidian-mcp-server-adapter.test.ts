import { describe, it, expect } from 'vitest'
import { MockObsidianMcpServerAdapter } from '@/infrastructure/mock/MockObsidianMcpServerAdapter'

describe('MockObsidianMcpServerAdapter', () => {
  it('start() returns the configured fixed port', async () => {
    const adapter = new MockObsidianMcpServerAdapter(3001)
    const result = await adapter.start()
    expect(result.port).toBe(3001)
  })

  it('getConnectionConfig() returns http transport URL with fixed port', async () => {
    const adapter = new MockObsidianMcpServerAdapter(3001)
    await adapter.start()
    expect(adapter.getConnectionConfig()).toEqual({
      transport: 'http',
      url: 'http://127.0.0.1:3001/mcp',
    })
  })

  it('stop() resolves without error', async () => {
    const adapter = new MockObsidianMcpServerAdapter()
    await adapter.start()
    await expect(adapter.stop()).resolves.toBeUndefined()
  })

  it('started reflects lifecycle state', async () => {
    const adapter = new MockObsidianMcpServerAdapter()
    expect(adapter.started).toBe(false)
    await adapter.start()
    expect(adapter.started).toBe(true)
    await adapter.stop()
    expect(adapter.started).toBe(false)
  })

  it('defaults to port 3001', async () => {
    const adapter = new MockObsidianMcpServerAdapter()
    const { port } = await adapter.start()
    expect(port).toBe(3001)
  })
})
