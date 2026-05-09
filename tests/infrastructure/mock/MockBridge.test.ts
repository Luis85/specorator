import { describe, it, expect, vi } from 'vitest'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

describe('MockBridge', () => {
  it('reads a file that was seeded in the constructor', async () => {
    const bridge = new MockBridge({ 'a/b.md': 'hello' })
    expect(await bridge.readFile('a/b.md')).toBe('hello')
  })

  it('throws when a file does not exist', async () => {
    const bridge = new MockBridge()
    await expect(bridge.readFile('missing.md')).rejects.toThrow('File not found')
  })

  it('writes and reads back a file', async () => {
    const bridge = new MockBridge()
    await bridge.writeFile('foo/bar.md', 'content')
    expect(await bridge.readFile('foo/bar.md')).toBe('content')
  })

  it('lists sub-folders under a parent', async () => {
    const bridge = new MockBridge({
      'specs/dark-mode/workflow-state.md': '',
      'specs/onboarding/workflow-state.md': '',
    })
    const folders = await bridge.listFolders('specs')
    expect(folders.sort()).toEqual(['dark-mode', 'onboarding'])
  })

  it('records notices', () => {
    const bridge = new MockBridge()
    bridge.showInfo('Hello world')
    expect(bridge.getNotices()[0].message).toBe('Hello world')
    expect(bridge.getNotices()[0].severity).toBe('info')
  })

  it('tracks the last opened file', async () => {
    const bridge = new MockBridge()
    expect(bridge.getOpenedFile()).toBeNull()
    await bridge.openFile('specs/my-feature/workflow-state.md')
    expect(bridge.getOpenedFile()).toBe('specs/my-feature/workflow-state.md')
  })
})

describe('MockBridge — WorkspacePort active file', () => {
  it('getActiveFile returns null when no active file is set', () => {
    const bridge = new MockBridge()
    expect(bridge.getActiveFile()).toBeNull()
  })

  it('getActiveFile returns the snapshot after setActiveFile', () => {
    const bridge = new MockBridge()
    bridge.setActiveFile({ path: 'specs/foo/idea.md', basename: 'idea', extension: 'md' })
    expect(bridge.getActiveFile()).toEqual({
      path: 'specs/foo/idea.md',
      basename: 'idea',
      extension: 'md',
    })
  })

  it('setActiveFile fires registered onActiveFileChanged handlers', () => {
    const bridge = new MockBridge()
    const snapshot = { path: 'specs/foo/idea.md', basename: 'idea', extension: 'md' }
    const handler = vi.fn()
    bridge.onActiveFileChanged(handler)
    bridge.setActiveFile(snapshot)
    expect(handler).toHaveBeenCalledWith(snapshot)
  })

  it('setActiveFile(null) fires handler with null', () => {
    const bridge = new MockBridge()
    const handler = vi.fn()
    bridge.onActiveFileChanged(handler)
    bridge.setActiveFile(null)
    expect(handler).toHaveBeenCalledWith(null)
  })

  it('unsubscriber from onActiveFileChanged stops handler from firing', () => {
    const bridge = new MockBridge()
    const handler = vi.fn()
    const unsub = bridge.onActiveFileChanged(handler)
    unsub()
    bridge.setActiveFile({ path: 'specs/foo/idea.md', basename: 'idea', extension: 'md' })
    expect(handler).not.toHaveBeenCalled()
  })
})
