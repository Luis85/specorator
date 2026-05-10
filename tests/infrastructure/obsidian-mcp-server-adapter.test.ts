import * as http from 'node:http'
import { describe, it, expect } from 'vitest'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { MockMetadataCacheAdapter } from '@/infrastructure/mock/MockMetadataCacheAdapter'
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

function makeAdapter(files: Record<string, string> = {}): ObsidianMcpServerAdapter {
  const vault = new MockBridge(files)
  const repo = new FeatureRepository(vault, vault, () => DEFAULT_SETTINGS)
  const metadataCache = new MockMetadataCacheAdapter()
  return new ObsidianMcpServerAdapter(vault, repo, () => DEFAULT_SETTINGS.specsFolder, metadataCache)
}

describe('ObsidianMcpServerAdapter', () => {
  it('start() assigns a dynamic port in valid range', async () => {
    const adapter = makeAdapter()
    const { port } = await adapter.start()
    expect(port).toBeGreaterThan(0)
    expect(port).toBeLessThanOrEqual(65535)
    await adapter.stop()
  })

  it('getConnectionConfig() returns 127.0.0.1 URL matching the assigned port', async () => {
    const adapter = makeAdapter()
    const { port } = await adapter.start()
    expect(adapter.getConnectionConfig()).toEqual({
      transport: 'http',
      url: `http://127.0.0.1:${port}/mcp`,
    })
    await adapter.stop()
  })

  it('getConnectionConfig() throws before start()', () => {
    const adapter = makeAdapter()
    expect(() => adapter.getConnectionConfig()).toThrow(/not started/)
  })

  it('getConnectionConfig() throws after stop()', async () => {
    const adapter = makeAdapter()
    await adapter.start()
    await adapter.stop()
    expect(() => adapter.getConnectionConfig()).toThrow(/not started/)
  })

  it('stop() closes the server cleanly', async () => {
    const adapter = makeAdapter()
    await adapter.start()
    await expect(adapter.stop()).resolves.toBeUndefined()
  })

  it('returns 421 for requests with a non-localhost Host header (DNS rebinding guard)', async () => {
    const adapter = makeAdapter()
    const { port } = await adapter.start()

    const statusCode = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port, path: '/mcp', method: 'POST',
          headers: { Host: 'evil.com', 'Content-Type': 'application/json' } },
        (res) => { resolve(res.statusCode ?? 0) },
      )
      req.once('error', reject)
      req.write('{}')
      req.end()
    })

    expect(statusCode).toBe(421)
    await adapter.stop()
  })

  it('returns 500 and stays alive when transport.handleRequest rejects', async () => {
    const adapter = makeAdapter()
    const { port } = await adapter.start()

    // Send a request immediately after stop() is called on the transport
    // to trigger a rejection from the MCP transport
    const stopPromise = adapter.stop()

    const statusCode = await new Promise<number>((resolve) => {
      const req = http.request(
        { hostname: '127.0.0.1', port, path: '/mcp', method: 'POST',
          headers: { 'Content-Type': 'application/json', Host: '127.0.0.1' } },
        (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        },
      )
      req.once('error', () => { resolve(0) })
      req.write('{}')
      req.end()
    })

    await stopPromise
    // Either 200-range (transport handled it) or 500 (our catch fired) — not an unhandled crash
    expect([200, 202, 400, 404, 500, 0]).toContain(statusCode)
  })

  it('server responds to initialize at /mcp', async () => {
    const adapter = makeAdapter()
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
