import { describe, it, expect, vi } from 'vitest'
import {
  validateModules,
  validateSettingsKeys,
  validateUriActions,
} from '@/core/module-validation'
import type { ModuleDescriptor } from '@/modules'

function makeModule(id: string, overrides?: Partial<ModuleDescriptor>): ModuleDescriptor {
  return { id, init: vi.fn(), ...overrides }
}

describe('validateModules', () => {
  it('accepts an empty registry', () => {
    expect(() => { validateModules([]) }).not.toThrow()
  })

  it('accepts a well-formed registry', () => {
    const a = makeModule('a')
    const b = makeModule('b', { dependsOn: ['a'] })
    expect(() => { validateModules([a, b]) }).not.toThrow()
  })

  it('rejects duplicate module IDs', () => {
    const a = makeModule('a')
    const b = makeModule('a')
    expect(() => { validateModules([a, b]) }).toThrow(/duplicate.*a/i)
  })

  it('rejects self-dependency', () => {
    const a = makeModule('a', { dependsOn: ['a'] })
    expect(() => { validateModules([a]) }).toThrow(/self.*a/i)
  })

  it('rejects unknown dependency reference', () => {
    const a = makeModule('a', { dependsOn: ['ghost'] })
    expect(() => { validateModules([a]) }).toThrow(/unknown.*ghost/i)
  })

  it('rejects duplicate settingsKey across modules', () => {
    const a = makeModule('a', { settingsKey: 'shared' })
    const b = makeModule('b', { settingsKey: 'shared' })
    expect(() => { validateModules([a, b]) }).toThrow(/duplicate settingsKey.*shared/i)
  })

  it('rejects a settingsKey starting with underscore', () => {
    const a = makeModule('a', { settingsKey: '_reserved' })
    expect(() => { validateModules([a]) }).toThrow(/reserved settingsKey.*_reserved/i)
  })

  it('rejects duplicate URI actions across modules', () => {
    const handler = vi.fn()
    const a = makeModule('a', { uriActions: [{ action: 'open-chat', handler }] })
    const b = makeModule('b', { uriActions: [{ action: 'open-chat', handler }] })
    expect(() => { validateModules([a, b]) }).toThrow(/duplicate.*open-chat/i)
  })

  it('accepts modules without dependsOn / settingsKey / uriActions', () => {
    const a = makeModule('a')
    expect(() => { validateModules([a]) }).not.toThrow()
  })
})

describe('validateSettingsKeys', () => {
  it('ignores modules without a settingsKey', () => {
    const a = makeModule('a')
    expect(() => { validateSettingsKeys([a]) }).not.toThrow()
  })

  it('accepts unique non-reserved keys', () => {
    const a = makeModule('a', { settingsKey: 'one' })
    const b = makeModule('b', { settingsKey: 'two' })
    expect(() => { validateSettingsKeys([a, b]) }).not.toThrow()
  })

  it('rejects duplicate keys', () => {
    const a = makeModule('a', { settingsKey: 'dup' })
    const b = makeModule('b', { settingsKey: 'dup' })
    expect(() => { validateSettingsKeys([a, b]) }).toThrow(/duplicate settingsKey/i)
  })

  it('rejects underscore-prefixed keys', () => {
    const a = makeModule('a', { settingsKey: '_secret' })
    expect(() => { validateSettingsKeys([a]) }).toThrow(/reserved settingsKey/i)
  })
})

describe('validateUriActions', () => {
  it('accepts modules without URI actions', () => {
    const a = makeModule('a')
    expect(() => { validateUriActions([a]) }).not.toThrow()
  })

  it('accepts unique actions across modules', () => {
    const a = makeModule('a', { uriActions: [{ action: 'one', handler: vi.fn() }] })
    const b = makeModule('b', { uriActions: [{ action: 'two', handler: vi.fn() }] })
    expect(() => { validateUriActions([a, b]) }).not.toThrow()
  })

  it('rejects duplicate actions within the same module', () => {
    const handler = vi.fn()
    const a = makeModule('a', {
      uriActions: [
        { action: 'dup', handler },
        { action: 'dup', handler },
      ],
    })
    expect(() => { validateUriActions([a]) }).toThrow(/duplicate URI action.*dup/i)
  })

  it('rejects duplicate actions across modules', () => {
    const handler = vi.fn()
    const a = makeModule('a', { uriActions: [{ action: 'dup', handler }] })
    const b = makeModule('b', { uriActions: [{ action: 'dup', handler }] })
    expect(() => { validateUriActions([a, b]) }).toThrow(/duplicate URI action.*dup/i)
  })
})
