/**
 * T-MPS-040 — CursorApiAdapter.isAvailable() truth table.
 *
 * Satisfies REQ-MPS-012, REQ-MPS-013, REQ-MPS-014, TST-MPS-05, TST-MPS-07,
 * TST-MPS-08.
 */
import { describe, it, expect } from 'vitest'
import { CursorApiAdapter } from '@/infrastructure/cursor/CursorApiAdapter'
import { MockSecretStore } from '@/infrastructure/mock/MockSecretStore'
import { SECRET_ID_CURSOR } from '@/domain/ports'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'

function silentLogger() {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
}

function neverFetch(): typeof globalThis.fetch {
  // isAvailable must never hit the network.
  return (async () => {
    throw new Error('isAvailable() must not call fetch')
  }) as unknown as typeof globalThis.fetch
}

function buildAdapter(opts: {
  available?: boolean
  preview?: boolean
  key?: string | null
  settingsOverride?: Partial<PluginSettings>
}) {
  const store = new MockSecretStore({ available: opts.available ?? true })
  if (opts.key !== undefined && opts.key !== null) {
    void store.setSecret(SECRET_ID_CURSOR, opts.key)
  }
  const settings: PluginSettings = {
    ...DEFAULT_SETTINGS,
    cursorApiPreview: opts.preview ?? true,
    ...opts.settingsOverride,
  }
  return new CursorApiAdapter({
    secretStore: store,
    logger: silentLogger(),
    fetch: neverFetch(),
    baseUrl: 'https://api.cursor.sh/v1',
    getSettings: () => settings,
  })
}

describe('CursorApiAdapter.isAvailable (T-MPS-040)', () => {
  it('returns true when secret store available, preview on, key present', async () => {
    const adapter = buildAdapter({ available: true, preview: true, key: 'cursor-key' })
    expect(await adapter.isAvailable()).toBe(true)
  })

  it('returns false when SecretStorePort.available === false (REQ-MPS-012)', async () => {
    const adapter = buildAdapter({ available: false, preview: true, key: 'cursor-key' })
    expect(await adapter.isAvailable()).toBe(false)
  })

  it('returns false when cursorApiPreview === false (REQ-MPS-014)', async () => {
    const adapter = buildAdapter({ available: true, preview: false, key: 'cursor-key' })
    expect(await adapter.isAvailable()).toBe(false)
  })

  it('returns false when no key has been stored', async () => {
    const adapter = buildAdapter({ available: true, preview: true, key: null })
    expect(await adapter.isAvailable()).toBe(false)
  })

  it('returns false when the stored key is whitespace-only', async () => {
    const store = new MockSecretStore({ available: true })
    await store.setSecret(SECRET_ID_CURSOR, '   ')
    const adapter = new CursorApiAdapter({
      secretStore: store,
      logger: silentLogger(),
      fetch: neverFetch(),
      baseUrl: 'https://api.cursor.sh/v1',
      getSettings: () => ({ ...DEFAULT_SETTINGS, cursorApiPreview: true }),
    })
    expect(await adapter.isAvailable()).toBe(false)
  })

  it('collapses secretStore.getSecret() throws to false (never propagates)', async () => {
    const erroringStore = {
      available: true,
      getSecret: async () => {
        throw new Error('keychain locked')
      },
      setSecret: async () => {},
    }
    const adapter = new CursorApiAdapter({
      secretStore: erroringStore,
      logger: silentLogger(),
      fetch: neverFetch(),
      baseUrl: 'https://api.cursor.sh/v1',
      getSettings: () => ({ ...DEFAULT_SETTINGS, cursorApiPreview: true }),
    })
    expect(await adapter.isAvailable()).toBe(false)
  })
})
