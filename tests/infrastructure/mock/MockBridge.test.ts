import { describe, it, expect } from 'vitest'
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

describe('MockBridge — CommunityPluginPort', () => {
  it('returns empty list by default', () => {
    const bridge = new MockBridge()
    expect(bridge.listEnabledPluginIds()).toEqual([])
  })

  it('isPluginEnabled returns false when not seeded', () => {
    const bridge = new MockBridge()
    expect(bridge.isPluginEnabled('dataview')).toBe(false)
  })

  it('seedEnabledPlugins populates the enabled set', () => {
    const bridge = new MockBridge()
    bridge.seedEnabledPlugins(['dataview', 'templater'])
    expect(bridge.listEnabledPluginIds().sort()).toEqual(['dataview', 'templater'])
    expect(bridge.isPluginEnabled('dataview')).toBe(true)
    expect(bridge.isPluginEnabled('unknown')).toBe(false)
  })

  it('seedEnabledPlugins replaces previous state', () => {
    const bridge = new MockBridge()
    bridge.seedEnabledPlugins(['dataview'])
    bridge.seedEnabledPlugins(['templater'])
    expect(bridge.isPluginEnabled('dataview')).toBe(false)
    expect(bridge.isPluginEnabled('templater')).toBe(true)
  })
})
