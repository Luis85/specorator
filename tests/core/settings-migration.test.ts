import { describe, it, expect, vi } from 'vitest'
import { migrateSettings } from '@/core/settings-migration'
import { fakeModulePorts } from '../__fakes__/fake-ports'
import type { ModuleDescriptor } from '@/modules'
import type { LoggerPort } from '@/domain/ports'

function makeLogger(): LoggerPort {
  return fakeModulePorts().logger
}

function makeModule(id: string, overrides?: Partial<ModuleDescriptor>): ModuleDescriptor {
  return { id, init: vi.fn(), ...overrides }
}

describe('migrateSettings', () => {
  it('skips modules without a settingsKey', () => {
    const logger = makeLogger()
    const migrate = vi.fn()
    const mod = makeModule('a', { migrate })
    const settings: Record<string, unknown> = { unrelated: 42 }

    migrateSettings([mod], settings, logger)

    expect(migrate).not.toHaveBeenCalled()
    expect(settings.a).toBeUndefined()
  })

  it('runs migrate() when storedVersion < targetVersion', () => {
    const logger = makeLogger()
    const migrate = vi.fn((_: number, blob: unknown) => ({ ...(blob as object), v: 1 }))
    const mod = makeModule('a', {
      settingsKey: 'a',
      settingsVersion: 1,
      migrate,
    })
    const settings: Record<string, unknown> = { a: { original: true }, _moduleVersions: { a: 0 } }

    migrateSettings([mod], settings, logger)

    expect(migrate).toHaveBeenCalledWith(0, { original: true })
    expect(settings.a).toMatchObject({ original: true, v: 1 })
    expect((settings._moduleVersions as Record<string, number>).a).toBe(1)
  })

  it('skips migrate() when storedVersion equals targetVersion', () => {
    const logger = makeLogger()
    const migrate = vi.fn()
    const mod = makeModule('a', {
      settingsKey: 'a',
      settingsVersion: 2,
      migrate,
    })
    const settings: Record<string, unknown> = { a: { x: 1 }, _moduleVersions: { a: 2 } }

    migrateSettings([mod], settings, logger)

    expect(migrate).not.toHaveBeenCalled()
  })

  it('does NOT downgrade when storedVersion > targetVersion but overwrites the version record', () => {
    const logger = makeLogger()
    const migrate = vi.fn()
    const mod = makeModule('a', {
      settingsKey: 'a',
      settingsVersion: 1,
      migrate,
    })
    const settings: Record<string, unknown> = { _moduleVersions: { a: 5 }, a: { keepMe: true } }

    migrateSettings([mod], settings, logger)

    expect(migrate).not.toHaveBeenCalled()
    expect(settings.a).toEqual({ keepMe: true })
    expect((settings._moduleVersions as Record<string, number>).a).toBe(1)
  })

  it('falls back to settingsDefaults and warns when migrate() throws', () => {
    const logger = makeLogger()
    const mod = makeModule('a', {
      settingsKey: 'a',
      settingsVersion: 1,
      settingsDefaults: { fallback: true },
      migrate: () => { throw new Error('migration failed') },
    })
    const settings: Record<string, unknown> = { a: {}, _moduleVersions: { a: 0 } }

    migrateSettings([mod], settings, logger)

    expect(settings.a).toEqual({ fallback: true })
    expect(logger.warn).toHaveBeenCalledWith(
      'settings migration failed; falling back to defaults',
      expect.objectContaining({ moduleId: 'a', settingsKey: 'a' }),
    )
  })

  it('runs validateSettings after a successful migration', () => {
    const logger = makeLogger()
    const validateSettings = vi.fn((blob: unknown) => ({ ...(blob as object), validated: true }))
    const mod = makeModule('a', {
      settingsKey: 'a',
      settingsVersion: 1,
      migrate: (_: number, blob: unknown) => ({ ...(blob as object), migrated: true }),
      validateSettings,
    })
    const settings: Record<string, unknown> = { a: { x: 1 }, _moduleVersions: { a: 0 } }

    migrateSettings([mod], settings, logger)

    expect(validateSettings).toHaveBeenCalledWith(expect.objectContaining({ x: 1, migrated: true }))
    expect(settings.a).toMatchObject({ x: 1, migrated: true, validated: true })
  })

  it('falls back to settingsDefaults and warns when validateSettings throws', () => {
    const logger = makeLogger()
    const mod = makeModule('a', {
      settingsKey: 'a',
      settingsDefaults: { fallback: true },
      validateSettings: () => { throw new Error('invalid') },
    })
    const settings: Record<string, unknown> = { a: { bad: 'data' } }

    migrateSettings([mod], settings, logger)

    expect(settings.a).toEqual({ fallback: true })
    expect(logger.warn).toHaveBeenCalledWith(
      'validateSettings failed; falling back to defaults',
      expect.objectContaining({ moduleId: 'a' }),
    )
  })

  it('initialises _moduleVersions when it is missing entirely', () => {
    const logger = makeLogger()
    const migrate = vi.fn((_: number, blob: unknown) => ({ ...(blob as object), migrated: true }))
    const mod = makeModule('a', {
      settingsKey: 'a',
      settingsVersion: 1,
      migrate,
    })
    const settings: Record<string, unknown> = { a: { x: 1 } }

    migrateSettings([mod], settings, logger)

    expect(migrate).toHaveBeenCalledWith(0, { x: 1 })
    expect(settings.a).toMatchObject({ x: 1, migrated: true })
    expect(settings._moduleVersions).toEqual({ a: 1 })
  })

  it('recovers gracefully when _moduleVersions is not a plain object', () => {
    const logger = makeLogger()
    const migrate = vi.fn().mockReturnValue({ migrated: true })
    const mod = makeModule('a', {
      settingsKey: 'a',
      settingsVersion: 1,
      migrate,
    })
    const settings: Record<string, unknown> = { _moduleVersions: 'corrupted', a: {} }

    migrateSettings([mod], settings, logger)

    expect(migrate).toHaveBeenCalledWith(0, {})
    expect(settings._moduleVersions).toEqual({ a: 1 })
  })

  it('recovers when _moduleVersions is an array', () => {
    const logger = makeLogger()
    const migrate = vi.fn().mockReturnValue({ migrated: true })
    const mod = makeModule('a', {
      settingsKey: 'a',
      settingsVersion: 1,
      migrate,
    })
    const settings: Record<string, unknown> = { _moduleVersions: [1, 2, 3], a: {} }

    migrateSettings([mod], settings, logger)

    expect(migrate).toHaveBeenCalledWith(0, {})
    expect(settings._moduleVersions).toEqual({ a: 1 })
  })

  it('recovers when _moduleVersions is null', () => {
    const logger = makeLogger()
    const migrate = vi.fn().mockReturnValue({ migrated: true })
    const mod = makeModule('a', {
      settingsKey: 'a',
      settingsVersion: 1,
      migrate,
    })
    const settings: Record<string, unknown> = { _moduleVersions: null, a: {} }

    migrateSettings([mod], settings, logger)

    expect(migrate).toHaveBeenCalledWith(0, {})
  })

  it('uses an empty object for missing blobs', () => {
    const logger = makeLogger()
    const migrate = vi.fn((_: number, blob: unknown) => ({ ...(blob as object), migrated: true }))
    const mod = makeModule('a', {
      settingsKey: 'a',
      settingsVersion: 1,
      migrate,
    })
    const settings: Record<string, unknown> = {}

    migrateSettings([mod], settings, logger)

    expect(migrate).toHaveBeenCalledWith(0, {})
  })
})
