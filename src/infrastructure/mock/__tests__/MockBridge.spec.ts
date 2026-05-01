import { describe, it, expect } from 'vitest'
import { MockBridge } from '../MockBridge'

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
      'features/dark-mode/_meta.md': '',
      'features/onboarding/_meta.md': '',
    })
    const folders = await bridge.listFolders('features')
    expect(folders.sort()).toEqual(['dark-mode', 'onboarding'])
  })

  it('records notices', () => {
    const bridge = new MockBridge()
    bridge.showNotice('Hello world')
    expect(bridge.getNotices()[0].message).toBe('Hello world')
  })
})
