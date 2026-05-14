import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TFile, TFolder } from 'obsidian'
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge'
import type { PluginSettings } from '@/domain/settings/PluginSettings'

// `obsidian` is aliased to `tests/__fakes__/obsidian.stub.ts` via
// `vitest.config.ts`. The stub provides a real `normalizePath` (matching
// Obsidian's documented behaviour) plus minimal class stubs for `TFile` /
// `TFolder` / `Notice`. That lets us instantiate the real `ObsidianBridge`
// against a fake `App` and assert that `vault.getAbstractFileByPath` /
// `vault.create` / `vault.createFolder` receive normalized paths.

type AbstractFile = object | null

interface FakeVault {
  getAbstractFileByPath: ReturnType<typeof vi.fn>
  read: ReturnType<typeof vi.fn>
  modify: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  createFolder: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

interface FakeApp {
  vault: FakeVault
  fileManager: { trashFile: ReturnType<typeof vi.fn> }
  workspace: {
    getLeaf: () => { openFile: ReturnType<typeof vi.fn> }
    getActiveFile: () => null
    on: () => unknown
    offref: () => void
  }
}

function makeBridge(
  opts: { fileLookup?: (path: string) => AbstractFile } = {},
): { bridge: ObsidianBridge; app: FakeApp; openFile: ReturnType<typeof vi.fn> } {
  const openFile = vi.fn().mockResolvedValue(undefined)
  const lookup = opts.fileLookup ?? (() => null)
  const app: FakeApp = {
    vault: {
      getAbstractFileByPath: vi.fn(lookup),
      read: vi.fn().mockResolvedValue('file-contents'),
      modify: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
      createFolder: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    fileManager: { trashFile: vi.fn().mockResolvedValue(undefined) },
    workspace: {
      getLeaf: () => ({ openFile }),
      getActiveFile: () => null,
      on: () => ({}),
      offref: () => {},
    },
  }
  const settings: PluginSettings = {
    specsFolder: 'specs',
    logLevel: 'warn',
  } as PluginSettings
  const bridge = new ObsidianBridge(
    app as unknown as ConstructorParameters<typeof ObsidianBridge>[0],
    () => settings,
    async () => {},
  )
  return { bridge, app, openFile }
}

describe('ObsidianBridge.normalizePath integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('backslash inputs to forward slashes', () => {
    it('readFile normalizes backslashes before vault lookup', async () => {
      const file = new TFile()
      const { bridge, app } = makeBridge({ fileLookup: () => file })
      await bridge.readFile('foo\\bar.md')
      expect(app.vault.getAbstractFileByPath).toHaveBeenCalledWith('foo/bar.md')
    })
  })

  describe('leading slash stripped', () => {
    it('writeFile normalizes leading slash before vault.create', async () => {
      const { bridge, app } = makeBridge({ fileLookup: () => null })
      await bridge.writeFile('/foo/bar.md', 'hello')
      expect(app.vault.getAbstractFileByPath).toHaveBeenCalledWith('foo/bar.md')
      expect(app.vault.create).toHaveBeenCalledWith('foo/bar.md', 'hello')
    })

    it('fileExists normalizes leading slash', async () => {
      const file = new TFile()
      const { bridge, app } = makeBridge({ fileLookup: () => file })
      const result = await bridge.fileExists('/foo/bar.md')
      expect(result).toBe(true)
      expect(app.vault.getAbstractFileByPath).toHaveBeenCalledWith('foo/bar.md')
    })
  })

  describe('trailing slash stripped', () => {
    it('listFiles normalizes trailing slash on folder', async () => {
      const folder = new TFolder()
      folder.children = []
      const { bridge, app } = makeBridge({ fileLookup: () => folder })
      await bridge.listFiles('foo/bar/')
      expect(app.vault.getAbstractFileByPath).toHaveBeenCalledWith('foo/bar')
    })

    it('listFolders normalizes trailing slash on parent', async () => {
      const folder = new TFolder()
      folder.children = []
      const { bridge, app } = makeBridge({ fileLookup: () => folder })
      await bridge.listFolders('foo/bar/')
      expect(app.vault.getAbstractFileByPath).toHaveBeenCalledWith('foo/bar')
    })

    it('createFolder normalizes trailing slash before createFolder call', async () => {
      const { bridge, app } = makeBridge({ fileLookup: () => null })
      await bridge.createFolder('foo/bar/')
      expect(app.vault.getAbstractFileByPath).toHaveBeenCalledWith('foo/bar')
      expect(app.vault.createFolder).toHaveBeenCalledWith('foo/bar')
    })
  })

  describe('duplicate slashes collapsed', () => {
    it('deleteFile normalizes duplicate slashes', async () => {
      const file = new TFile()
      const { bridge, app } = makeBridge({ fileLookup: () => file })
      await bridge.deleteFile('foo//bar.md')
      expect(app.vault.getAbstractFileByPath).toHaveBeenCalledWith('foo/bar.md')
      expect(app.fileManager.trashFile).toHaveBeenCalledWith(file)
    })

    it('openFile normalizes duplicate slashes', async () => {
      const file = new TFile()
      const { bridge, app, openFile } = makeBridge({ fileLookup: () => file })
      await bridge.openFile('foo//bar.md')
      expect(app.vault.getAbstractFileByPath).toHaveBeenCalledWith('foo/bar.md')
      expect(openFile).toHaveBeenCalledWith(file)
    })
  })

  describe('readFile error message reports normalized path', () => {
    it('throws with normalized path, not the raw input', async () => {
      const { bridge } = makeBridge({ fileLookup: () => null })
      await expect(bridge.readFile('\\foo//bar.md/')).rejects.toThrow(
        'File not found: foo/bar.md',
      )
    })
  })
})

describe('ObsidianBridge — CommunityPluginPort', () => {
  function makeBridgeWithPlugins(enabledIds: string[] = []) {
    const { bridge, app } = makeBridge()
    const enabledPlugins = new Set<string>(enabledIds)
    ;(app as unknown as Record<string, unknown>).plugins = { enabledPlugins }
    return { bridge, app }
  }

  it('isPluginEnabled returns true for an enabled plugin', () => {
    const { bridge } = makeBridgeWithPlugins(['dataview', 'templater'])
    expect(bridge.isPluginEnabled('dataview')).toBe(true)
  })

  it('isPluginEnabled returns false for a disabled plugin', () => {
    const { bridge } = makeBridgeWithPlugins(['dataview'])
    expect(bridge.isPluginEnabled('unknown')).toBe(false)
  })

  it('listEnabledPluginIds returns all enabled ids', () => {
    const { bridge } = makeBridgeWithPlugins(['dataview', 'templater'])
    expect(bridge.listEnabledPluginIds().sort()).toEqual(['dataview', 'templater'])
  })

  it('listEnabledPluginIds returns empty array when no plugins enabled', () => {
    const { bridge } = makeBridgeWithPlugins([])
    expect(bridge.listEnabledPluginIds()).toEqual([])
  })

  it('handles missing app.plugins gracefully', () => {
    const { bridge } = makeBridge()
    expect(bridge.isPluginEnabled('dataview')).toBe(false)
    expect(bridge.listEnabledPluginIds()).toEqual([])
  })
})
