import { describe, it, expect } from 'vitest'
import { MockCanvasAdapter } from '@/infrastructure/mock/MockCanvasAdapter'

describe('MockCanvasAdapter', () => {
  it('isCanvas returns true for .canvas extension', () => {
    const adapter = new MockCanvasAdapter()
    expect(adapter.isCanvas('boards/my-board.canvas')).toBe(true)
  })

  it('isCanvas returns false for other extensions', () => {
    const adapter = new MockCanvasAdapter()
    expect(adapter.isCanvas('specs/foo/idea.md')).toBe(false)
  })

  it('readCanvas throws when path not seeded', async () => {
    const adapter = new MockCanvasAdapter()
    await expect(adapter.readCanvas('boards/missing.canvas')).rejects.toThrow(
      '[MockCanvasAdapter] Canvas not found: boards/missing.canvas',
    )
  })

  it('readCanvas returns seeded data', async () => {
    const adapter = new MockCanvasAdapter()
    const data = { nodes: [{ id: '1' }], edges: [] }
    adapter.seedCanvas('boards/my-board.canvas', data)
    expect(await adapter.readCanvas('boards/my-board.canvas')).toEqual(data)
  })

  it('writeCanvas stores data readable by readCanvas', async () => {
    const adapter = new MockCanvasAdapter()
    const data = { nodes: [], edges: [{ id: 'e1' }] }
    await adapter.writeCanvas('boards/my-board.canvas', data)
    expect(await adapter.readCanvas('boards/my-board.canvas')).toEqual(data)
  })

  it('writeCanvas overwrites previously seeded data', async () => {
    const adapter = new MockCanvasAdapter()
    adapter.seedCanvas('boards/my-board.canvas', { nodes: [] })
    const updated = { nodes: [{ id: 'new' }] }
    await adapter.writeCanvas('boards/my-board.canvas', updated)
    expect(await adapter.readCanvas('boards/my-board.canvas')).toEqual(updated)
  })

  it('getWritten returns undefined for paths not yet written', () => {
    const adapter = new MockCanvasAdapter()
    expect(adapter.getWritten('boards/my-board.canvas')).toBeUndefined()
  })

  it('getWritten returns last written data', async () => {
    const adapter = new MockCanvasAdapter()
    const data = { nodes: [{ id: '2' }] }
    await adapter.writeCanvas('boards/my-board.canvas', data)
    expect(adapter.getWritten('boards/my-board.canvas')).toEqual(data)
  })

  it('getWritten does not return seeded-but-not-written data', () => {
    const adapter = new MockCanvasAdapter()
    adapter.seedCanvas('boards/my-board.canvas', { nodes: [] })
    expect(adapter.getWritten('boards/my-board.canvas')).toBeUndefined()
  })
})
