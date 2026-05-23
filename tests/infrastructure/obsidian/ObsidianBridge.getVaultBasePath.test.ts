/**
 * QW-A — `ObsidianBridge.getVaultBasePath()`.
 *
 * On desktop the vault adapter is a `FileSystemAdapter` carrying the
 * vault root; the bridge returns that path so the subscription transport
 * can pass it as `cwd` to `child_process.spawn`. On mobile (or any non-FS
 * adapter) the bridge returns `null`.
 */
import { describe, it, expect } from 'vitest'
import { FileSystemAdapter } from 'obsidian'
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge'
import type { PluginSettings } from '@/domain/settings/PluginSettings'

interface FakeApp {
  vault: { adapter: unknown }
  fileManager: Record<string, unknown>
  workspace: Record<string, unknown>
}

function makeBridge(adapter: unknown): ObsidianBridge {
  const app: FakeApp = {
    vault: { adapter },
    fileManager: {},
    workspace: {},
  }
  const settings: PluginSettings = {
    specsFolder: 'specs',
    logLevel: 'warn',
  } as PluginSettings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ObsidianBridge(app as any, () => settings, async () => undefined)
}

describe('ObsidianBridge.getVaultBasePath (QW-A)', () => {
  it('returns the FileSystemAdapter base path when present', () => {
    class DesktopAdapter extends FileSystemAdapter {
      override getBasePath(): string {
        return '/Users/test/MyVault'
      }
    }
    const bridge = makeBridge(new DesktopAdapter())
    expect(bridge.getVaultBasePath()).toBe('/Users/test/MyVault')
  })

  it('returns null when the adapter is not a FileSystemAdapter (mobile)', () => {
    const bridge = makeBridge({ getBasePath: () => '/should/not/be/used' })
    expect(bridge.getVaultBasePath()).toBeNull()
  })
})
