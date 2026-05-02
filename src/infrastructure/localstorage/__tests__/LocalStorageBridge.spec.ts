import { describe, it, expect, beforeEach } from 'vitest'
import { LocalStorageBridge } from '../LocalStorageBridge'
import { DEFAULT_SETTINGS } from '@/infrastructure/bridge/IBridge'

describe('LocalStorageBridge', () => {
  let bridge: LocalStorageBridge

  beforeEach(() => {
    localStorage.clear()
    bridge = new LocalStorageBridge()
  })

  describe('file operations', () => {
    it('writes and reads a file', async () => {
      await bridge.writeFile('features/dark-mode/_meta.md', '# dark mode')
      expect(await bridge.readFile('features/dark-mode/_meta.md')).toBe('# dark mode')
    })

    it('throws when reading a non-existent file', async () => {
      await expect(bridge.readFile('missing.md')).rejects.toThrow('File not found: missing.md')
    })

    it('fileExists returns true after write', async () => {
      await bridge.writeFile('a.md', 'content')
      expect(await bridge.fileExists('a.md')).toBe(true)
    })

    it('fileExists returns false for missing file', async () => {
      expect(await bridge.fileExists('nope.md')).toBe(false)
    })

    it('deletes a file', async () => {
      await bridge.writeFile('to-delete.md', 'bye')
      await bridge.deleteFile('to-delete.md')
      expect(await bridge.fileExists('to-delete.md')).toBe(false)
    })

    it('listFiles returns direct children only', async () => {
      await bridge.writeFile('features/a/_meta.md', '')
      await bridge.writeFile('features/b/_meta.md', '')
      await bridge.writeFile('other/c/_meta.md', '')
      const files = await bridge.listFiles('features/a')
      expect(files).toContain('features/a/_meta.md')
      expect(files).not.toContain('features/b/_meta.md')
    })

    it('listFolders returns immediate sub-folders', async () => {
      await bridge.writeFile('features/dark-mode/_meta.md', '')
      await bridge.writeFile('features/search/_meta.md', '')
      const folders = await bridge.listFolders('features')
      expect(folders).toContain('dark-mode')
      expect(folders).toContain('search')
    })

    it('createFolder is a no-op and does not throw', async () => {
      await expect(bridge.createFolder('features/new')).resolves.toBeUndefined()
    })
  })

  describe('settings operations', () => {
    it('returns default settings when localStorage is empty', async () => {
      const settings = await bridge.getSettings()
      expect(settings).toEqual(DEFAULT_SETTINGS)
    })

    it('persists and retrieves settings', async () => {
      const updated = { ...DEFAULT_SETTINGS, locale: 'de' }
      await bridge.saveSettings(updated)
      const loaded = await bridge.getSettings()
      expect(loaded.locale).toBe('de')
    })

    it('merges stored settings with defaults for new keys', async () => {
      localStorage.setItem('specorator:settings', JSON.stringify({ locale: 'de' }))
      const settings = await bridge.getSettings()
      expect(settings.locale).toBe('de')
      expect(settings.featuresFolder).toBe(DEFAULT_SETTINGS.featuresFolder)
    })
  })

  describe('event dispatching', () => {
    it('showNotice dispatches sp:notice CustomEvent', () => {
      const received: { message: string; durationMs: number }[] = []
      window.addEventListener('sp:notice', (e) => {
        received.push((e as CustomEvent).detail)
      })
      bridge.showNotice('hello', 2000)
      expect(received).toHaveLength(1)
      expect(received[0]).toEqual({ message: 'hello', durationMs: 2000 })
    })

    it('openFile dispatches sp:open-file CustomEvent', async () => {
      const received: { path: string }[] = []
      window.addEventListener('sp:open-file', (e) => {
        received.push((e as CustomEvent).detail)
      })
      await bridge.openFile('features/dark-mode/_meta.md')
      expect(received).toHaveLength(1)
      expect(received[0].path).toBe('features/dark-mode/_meta.md')
    })
  })

  describe('round-trip', () => {
    it('written file survives a new bridge instance (simulating page refresh)', async () => {
      await bridge.writeFile('features/x/_meta.md', 'content-x')
      const bridge2 = new LocalStorageBridge()
      expect(await bridge2.readFile('features/x/_meta.md')).toBe('content-x')
    })
  })
})
