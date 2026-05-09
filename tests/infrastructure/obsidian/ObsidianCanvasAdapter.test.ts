import { describe, it, expect } from 'vitest'
import { ObsidianCanvasAdapter } from '@/infrastructure/obsidian/ObsidianCanvasAdapter'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

describe('ObsidianCanvasAdapter', () => {
  it('isCanvas returns true for .canvas extension', () => {
    const adapter = new ObsidianCanvasAdapter(new MockBridge())
    expect(adapter.isCanvas('boards/my-board.canvas')).toBe(true)
  })

  it('isCanvas returns false for other extensions', () => {
    const adapter = new ObsidianCanvasAdapter(new MockBridge())
    expect(adapter.isCanvas('specs/foo/idea.md')).toBe(false)
  })

  it('readCanvas parses JSON from VaultPort', async () => {
    const data = { nodes: [{ id: '1' }], edges: [] }
    const bridge = new MockBridge({ 'boards/my-board.canvas': JSON.stringify(data) })
    const adapter = new ObsidianCanvasAdapter(bridge)
    expect(await adapter.readCanvas('boards/my-board.canvas')).toEqual(data)
  })

  it('writeCanvas serialises JSON to VaultPort', async () => {
    const bridge = new MockBridge()
    const adapter = new ObsidianCanvasAdapter(bridge)
    const data = { nodes: [], edges: [{ id: 'e1' }] }
    await adapter.writeCanvas('boards/my-board.canvas', data)
    const written = await bridge.readFile('boards/my-board.canvas')
    expect(JSON.parse(written)).toEqual(data)
  })

  it('round-trips canvas data through write then read', async () => {
    const bridge = new MockBridge()
    const adapter = new ObsidianCanvasAdapter(bridge)
    const data = { nodes: [{ id: 'n1', type: 'text', text: 'hello' }], edges: [] }
    await adapter.writeCanvas('boards/test.canvas', data)
    expect(await adapter.readCanvas('boards/test.canvas')).toEqual(data)
  })
})
