import '../../src/core/core-events' // load EventMap augmentation
import { describe, it, expect, vi } from 'vitest'
import { PluginCore } from '@/core/plugin-core'
import { fakeModulePorts } from '../__fakes__/fake-ports'
import type { ModuleDescriptor } from '@/modules'
import type { CorePorts } from '@/core/plugin-core'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePorts(): CorePorts {
  const { settings, vault, workspace, notifications, logger, t } = fakeModulePorts()
  return { settings, vault, workspace, notifications, logger, t }
}

function makeModule(
  id: string,
  overrides?: Partial<ModuleDescriptor>,
): ModuleDescriptor {
  return { id, init: vi.fn(), ...overrides }
}

// ── Validation ────────────────────────────────────────────────────────────────

describe('PluginCore validation', () => {
  it('rejects duplicate module IDs before any module runs', async () => {
    const ports = makePorts()
    const a = makeModule('a', { init: vi.fn() })
    const b = makeModule('a', { init: vi.fn() }) // duplicate
    const core = new PluginCore([a, b], ports)

    await expect(core.init({})).rejects.toThrow(/duplicate.*a/i)
    expect(a.init).not.toHaveBeenCalled()
    expect(b.init).not.toHaveBeenCalled()
  })

  it('rejects self-dependency with a named error', async () => {
    const ports = makePorts()
    const a = makeModule('a', { dependsOn: ['a'] })
    const core = new PluginCore([a], ports)

    await expect(core.init({})).rejects.toThrow(/self.*a/i)
  })

  it('rejects unknown dependsOn ref', async () => {
    const ports = makePorts()
    const a = makeModule('a', { dependsOn: ['ghost'] })
    const core = new PluginCore([a], ports)

    await expect(core.init({})).rejects.toThrow(/unknown.*ghost/i)
  })

  it('rejects a cycle and names the involved modules', async () => {
    const ports = makePorts()
    const a = makeModule('a', { dependsOn: ['b'] })
    const b = makeModule('b', { dependsOn: ['a'] })
    const core = new PluginCore([a, b], ports)

    // Single assertion — regex must match both IDs in the same message.
    await expect(core.init({})).rejects.toThrow(/cycle/i)
    // Separate instances to avoid re-entrant state mutations on the same core.
    const core2 = new PluginCore([a, b], ports)
    await expect(core2.init({})).rejects.toThrow(/\ba\b/)
    const core3 = new PluginCore([a, b], ports)
    await expect(core3.init({})).rejects.toThrow(/\bb\b/)
  })

  it('rejects duplicate settingsKey across modules', async () => {
    const ports = makePorts()
    const a = makeModule('a', { settingsKey: 'shared' })
    const b = makeModule('b', { settingsKey: 'shared' })
    const core = new PluginCore([a, b], ports)

    await expect(core.init({})).rejects.toThrow(/duplicate settingsKey.*shared/i)
  })

  it('rejects a settingsKey starting with underscore', async () => {
    const ports = makePorts()
    const a = makeModule('a', { settingsKey: '_reserved' })
    const core = new PluginCore([a], ports)

    await expect(core.init({})).rejects.toThrow(/reserved settingsKey.*_reserved/i)
  })
})

// ── Topo-sort & init order ────────────────────────────────────────────────────

describe('PluginCore init order', () => {
  it('initialises dependency before dependent', async () => {
    const order: string[] = []
    const ports = makePorts()
    const a = makeModule('a', { init: () => { order.push('a') } })
    const b = makeModule('b', { dependsOn: ['a'], init: () => { order.push('b') } })
    const core = new PluginCore([b, a], ports) // b declared first — topo must reorder

    await core.init({})
    expect(order).toEqual(['a', 'b'])
  })

  it('preserves declaration order for independent modules at the same depth', async () => {
    const order: string[] = []
    const ports = makePorts()
    const x = makeModule('x', { init: () => { order.push('x') } })
    const y = makeModule('y', { init: () => { order.push('y') } })
    const core = new PluginCore([x, y], ports)

    await core.init({})
    expect(order).toEqual(['x', 'y'])
  })
})

// ── Degraded modules ──────────────────────────────────────────────────────────

describe('PluginCore degraded module handling', () => {
  it('does not abort other modules when one fails init', async () => {
    const ports = makePorts()
    const a = makeModule('a', { init: () => { throw new Error('a boom') } })
    const b = makeModule('b', { init: vi.fn() })
    const core = new PluginCore([a, b], ports)

    await core.init({})
    expect(b.init).toHaveBeenCalled()
  })

  it('exposes failed modules via degradedModules getter', async () => {
    const ports = makePorts()
    const err = new Error('a boom')
    const a = makeModule('a', { init: () => { throw err } })
    const core = new PluginCore([a], ports)

    await core.init({})
    expect(core.degradedModules).toEqual([{ id: 'a', error: err }])
  })

  it('degradedModules getter is populated before core:module-degraded fires', async () => {
    const ports = makePorts()
    const a = makeModule('a', { init: () => { throw new Error('boom') } })
    const core = new PluginCore([a], ports)

    let countWhenFired = -1
    core.bus.on('core:module-degraded', () => {
      countWhenFired = core.degradedModules.length
    })

    await core.init({})
    expect(countWhenFired).toBe(1) // populated before event fired
  })

  it('emits core:module-degraded with correct moduleId and error', async () => {
    const ports = makePorts()
    const err = new Error('oops')
    const a = makeModule('a', { init: () => { throw err } })
    const core = new PluginCore([a], ports)

    const received: Array<{ moduleId: string; error: Error }> = []
    core.bus.on('core:module-degraded', (env) => { received.push(env.payload) })

    await core.init({})
    expect(received).toEqual([{ moduleId: 'a', error: err }])
  })

  it('emits core:init-complete with the correct degradedCount', async () => {
    const ports = makePorts()
    const a = makeModule('a', { init: () => { throw new Error('boom') } })
    const b = makeModule('b', { init: vi.fn() })
    const core = new PluginCore([a, b], ports)

    let degradedCount = -1
    core.bus.on('core:init-complete', (env) => { degradedCount = env.payload.degradedCount })

    await core.init({})
    expect(degradedCount).toBe(1)
  })

  it('skips dependent modules when a prerequisite is degraded', async () => {
    const ports = makePorts()
    const a = makeModule('a', { init: () => { throw new Error('a boom') } })
    const b = makeModule('b', { dependsOn: ['a'], init: vi.fn() })
    const core = new PluginCore([a, b], ports)

    await core.init({})
    expect(b.init).not.toHaveBeenCalled()
    expect(core.degradedModules.map((d) => d.id)).toEqual(['a', 'b'])
  })

  it('emits core:module-degraded for each cascaded dependent', async () => {
    const ports = makePorts()
    const a = makeModule('a', { init: () => { throw new Error('root fail') } })
    const b = makeModule('b', { dependsOn: ['a'], init: vi.fn() })
    const core = new PluginCore([a, b], ports)

    const events: string[] = []
    core.bus.on('core:module-degraded', (env) => { events.push(env.payload.moduleId) })

    await core.init({})
    expect(events).toEqual(['a', 'b'])
  })

  it('degrades a module when i18nMerge throws instead of aborting plugin init', async () => {
    const ports: CorePorts = {
      ...makePorts(),
      i18nMerge: () => { throw new Error('merge boom') },
    }
    const mod = makeModule('a', {
      messages: { en: { 'a.key': 'val' } },
      init: vi.fn(),
    })
    const core = new PluginCore([mod], ports)

    await core.init({})

    expect(core.degradedModules).toHaveLength(1)
    expect(core.degradedModules[0].id).toBe('a')
    expect(mod.init).not.toHaveBeenCalled()
  })

  it('does not abort other modules when one fails init', async () => {
    const destroySpy = vi.fn()
    const ports = makePorts()
    const a = makeModule('a', { init: () => { throw new Error('boom') }, destroy: destroySpy })
    const core = new PluginCore([a], ports)

    await core.init({})
    // destroy() is called once during init() rollback; reset the spy
    destroySpy.mockClear()
    await core.destroy()
    // Must NOT be called again in the main destroy sweep
    expect(destroySpy).not.toHaveBeenCalled()
  })
})

// ── destroy order ─────────────────────────────────────────────────────────────

describe('PluginCore destroy order', () => {
  it('destroys in reverse topo order', async () => {
    const order: string[] = []
    const ports = makePorts()
    const a = makeModule('a', { init: vi.fn(), destroy: () => { order.push('a') } })
    const b = makeModule('b', { dependsOn: ['a'], init: vi.fn(), destroy: () => { order.push('b') } })
    const core = new PluginCore([a, b], ports)

    await core.init({})
    await core.destroy()
    expect(order).toEqual(['b', 'a'])
  })

  it('emits core:destroy-complete after the full loop', async () => {
    const destroyOrder: string[] = []
    const eventOrder: string[] = []
    const ports = makePorts()
    const a = makeModule('a', { init: vi.fn(), destroy: () => { destroyOrder.push('a') } })
    const core = new PluginCore([a], ports)

    core.bus.on('core:destroy-complete', () => { eventOrder.push('event') })

    await core.init({})
    await core.destroy()
    // destroy ran before event
    expect(destroyOrder).toEqual(['a'])
    expect(eventOrder).toEqual(['event'])
  })

  it('continues teardown and logs when a module destroy throws', async () => {
    const ports = makePorts()
    const a = makeModule('a', { init: vi.fn(), destroy: vi.fn() })
    const b = makeModule('b', { init: vi.fn(), destroy: () => { throw new Error('b destroy fail') } })
    // b depends on a → destroy order: b, a
    const bDep = { ...b, dependsOn: ['a'] }
    const core = new PluginCore([a, bDep], ports)

    await core.init({})
    await expect(core.destroy()).resolves.toBeUndefined()
    expect(a.destroy).toHaveBeenCalled()
    expect(ports.logger.error).toHaveBeenCalledWith(
      'module destroy failed',
      expect.any(Error),
      expect.objectContaining({ moduleId: 'b' }),
    )
  })
})

// ── Listener-leak tripwire ────────────────────────────────────────────────────

describe('PluginCore listener-leak tripwire', () => {
  it('fires logger.warn when a module leaks a listener', async () => {
    const ports = makePorts()
    const a = makeModule('a', {
      init(p) { p.bus.on('core:init-complete', () => {}) }, // subscribe but never unsubscribe
      destroy: vi.fn(), // destroy does nothing — leak!
    })
    const core = new PluginCore([a], ports)

    await core.init({})
    await core.destroy()
    expect(ports.logger.warn).toHaveBeenCalledWith(
      'listener leak detected',
      expect.objectContaining({
        moduleId: 'a',
        released: expect.any(Number),
        subscribed: expect.any(Number),
      }),
    )
  })

  it('does NOT fire a spurious warn when a module subscribes nothing', async () => {
    const ports = makePorts()
    const a = makeModule('a', { init: vi.fn(), destroy: vi.fn() })
    const core = new PluginCore([a], ports)

    await core.init({})
    await core.destroy()
    expect(ports.logger.warn).not.toHaveBeenCalled()
  })

  it('emits core:destroy-complete with leakCount=1 when one module leaks', async () => {
    const ports = makePorts()
    const a = makeModule('a', {
      init(p) { p.bus.on('core:init-complete', () => {}) },
      destroy: vi.fn(),
    })
    const core = new PluginCore([a], ports)

    let leakCount = -1
    core.bus.on('core:destroy-complete', (env) => { leakCount = env.payload.leakCount })

    await core.init({})
    await core.destroy()
    expect(leakCount).toBe(1)
  })
})

// ── EventBus listener error routing ──────────────────────────────────────────

describe('PluginCore listener error routing', () => {
  it('routes listener errors to logger.error with envelope IDs but not payload', async () => {
    const ports = makePorts()
    const a = makeModule('a', {
      init(p) {
        p.bus.on('core:init-complete', () => { throw new Error('listener boom') })
      },
    })
    const core = new PluginCore([a], ports)
    await core.init({}) // this emits core:init-complete, triggering the bad listener

    expect(ports.logger.error).toHaveBeenCalledWith(
      'event listener error',
      expect.any(Error),
      expect.objectContaining({
        channel: 'core:init-complete',
        eventId: expect.any(String),
        traceId: expect.any(String),
      }),
    )

    // Payload must NOT appear in the logger.error call args
    const calls = (ports.logger.error as ReturnType<typeof vi.fn>).mock.calls
    const allArgs = JSON.stringify(calls)
    expect(allArgs).not.toContain('degradedCount')
  })
})

// ── Settings migration ────────────────────────────────────────────────────────

describe('PluginCore settings migration', () => {
  it('runs migrate() when storedVersion < settingsVersion', async () => {
    const ports = makePorts()
    const migrate = vi.fn((_: number, blob: unknown) => ({ ...(blob as Record<string, unknown>), v: 1 }))
    const mod = makeModule('a', {
      settingsKey: 'a',
      settingsVersion: 1,
      migrate,
    })
    const raw: Record<string, unknown> = { a: { original: true }, _moduleVersions: { a: 0 } }

    const core = new PluginCore([mod], ports)
    await core.init(raw)

    expect(migrate).toHaveBeenCalledWith(0, { original: true })
    expect(core.getModuleSettings('a')).toMatchObject({ original: true, v: 1 })
  })

  it('skips migrate() when storedVersion equals settingsVersion', async () => {
    const ports = makePorts()
    const migrate = vi.fn()
    const mod = makeModule('a', {
      settingsKey: 'a',
      settingsVersion: 2,
      migrate,
    })
    const raw: Record<string, unknown> = { a: { x: 1 }, _moduleVersions: { a: 2 } }

    const core = new PluginCore([mod], ports)
    await core.init(raw)

    expect(migrate).not.toHaveBeenCalled()
  })

  it('falls back to defaults and logs warn when migrate() throws', async () => {
    const ports = makePorts()
    const mod = makeModule('a', {
      settingsKey: 'a',
      settingsVersion: 1,
      settingsDefaults: { fallback: true },
      migrate: () => { throw new Error('migration failed') },
    })
    const raw: Record<string, unknown> = { a: {}, _moduleVersions: { a: 0 } }

    const core = new PluginCore([mod], ports)
    await core.init(raw)

    expect(core.getModuleSettings('a')).toEqual({ fallback: true })
    expect(ports.logger.warn).toHaveBeenCalledWith(
      'settings migration failed; falling back to defaults',
      expect.objectContaining({ moduleId: 'a', settingsKey: 'a' }),
    )
  })

  it('runs validateSettings after migration', async () => {
    const ports = makePorts()
    const validateSettings = vi.fn((blob: unknown) => ({ ...(blob as object), validated: true }))
    const mod = makeModule('a', {
      settingsKey: 'a',
      settingsVersion: 1,
      migrate: (_: number, blob: unknown) => ({ ...(blob as object), migrated: true }),
      validateSettings,
    })
    const raw: Record<string, unknown> = { a: { x: 1 }, _moduleVersions: { a: 0 } }

    const core = new PluginCore([mod], ports)
    await core.init(raw)

    expect(validateSettings).toHaveBeenCalledWith(expect.objectContaining({ x: 1, migrated: true }))
    expect(core.getModuleSettings('a')).toMatchObject({ x: 1, migrated: true, validated: true })
  })

  it('falls back to defaults and logs warn when validateSettings throws', async () => {
    const ports = makePorts()
    const mod = makeModule('a', {
      settingsKey: 'a',
      settingsDefaults: { fallback: true },
      validateSettings: () => { throw new Error('invalid') },
    })
    const raw: Record<string, unknown> = { a: { bad: 'data' } }

    const core = new PluginCore([mod], ports)
    await core.init(raw)

    expect(core.getModuleSettings('a')).toEqual({ fallback: true })
    expect(ports.logger.warn).toHaveBeenCalledWith(
      'validateSettings failed; falling back to defaults',
      expect.objectContaining({ moduleId: 'a' }),
    )
  })

  it('skips modules with no settingsKey', async () => {
    const ports = makePorts()
    const migrate = vi.fn()
    const mod = makeModule('a', { migrate }) // no settingsKey
    const raw: Record<string, unknown> = { unrelated: 42 }

    const core = new PluginCore([mod], ports)
    await core.init(raw)

    expect(migrate).not.toHaveBeenCalled()
    expect(core.getModuleSettings('a')).toBeUndefined()
  })

  it('exposes migrated slice via getModuleSettings()', async () => {
    const ports = makePorts()
    const mod = makeModule('x', {
      settingsKey: 'x',
      validateSettings: (blob: unknown) => ({ ...(blob as object), ok: true }),
    })
    const raw: Record<string, unknown> = { x: { value: 7 } }

    const core = new PluginCore([mod], ports)
    await core.init(raw)

    expect(core.getModuleSettings('x')).toEqual({ value: 7, ok: true })
  })

  it('recovers gracefully when _moduleVersions is not a plain object', async () => {
    const ports = makePorts()
    const migrate = vi.fn().mockReturnValue({ migrated: true })
    const mod = makeModule('a', {
      settingsKey: 'a',
      settingsVersion: 1,
      migrate,
    })
    // Simulate corrupted storage: _moduleVersions is a string, not an object.
    const raw: Record<string, unknown> = { _moduleVersions: 'corrupted', a: {} }

    const core = new PluginCore([mod], ports)
    await expect(core.init(raw)).resolves.toBeUndefined()
    // storedVersion fell back to 0, so migrate() is called (0 < 1).
    expect(migrate).toHaveBeenCalledWith(0, {})
  })
})

// ── notifySettingsChanged ─────────────────────────────────────────────────────

describe('PluginCore.notifySettingsChanged', () => {
  it('calls onSettingsChange with validated value', async () => {
    const ports = makePorts()
    const onSettingsChange = vi.fn()
    const mod = makeModule('a', {
      settingsKey: 'a',
      validateSettings: (raw: unknown) => ({ ...(raw as object), validated: true }),
      onSettingsChange,
    })
    const core = new PluginCore([mod], ports)
    await core.init({ a: {} })

    await core.notifySettingsChanged('a', { foo: 'bar' })

    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ foo: 'bar', validated: true }))
  })

  it('skips notification when validateSettings throws, and logs warn', async () => {
    const ports = makePorts()
    const onSettingsChange = vi.fn()
    const mod = makeModule('a', {
      settingsKey: 'a',
      validateSettings: () => { throw new Error('bad') },
      onSettingsChange,
    })
    const core = new PluginCore([mod], ports)
    await core.init({ a: {} })

    await core.notifySettingsChanged('a', { bad: true })

    expect(onSettingsChange).not.toHaveBeenCalled()
    expect(ports.logger.warn).toHaveBeenCalledWith(
      'validateSettings failed; skipping onSettingsChange',
      expect.objectContaining({ moduleId: 'a' }),
    )
  })

  it('catches and logs errors thrown by onSettingsChange', async () => {
    const ports = makePorts()
    const mod = makeModule('a', {
      settingsKey: 'a',
      onSettingsChange: () => { throw new Error('hook failed') },
    })
    const core = new PluginCore([mod], ports)
    await core.init({ a: {} })

    await expect(core.notifySettingsChanged('a', {})).resolves.toBeUndefined()
    expect(ports.logger.error).toHaveBeenCalledWith(
      'onSettingsChange failed',
      expect.any(Error),
      expect.objectContaining({ moduleId: 'a' }),
    )
  })

  it('updates moduleSettingsMap even when onSettingsChange is absent', async () => {
    const ports = makePorts()
    const mod = makeModule('a', {
      settingsKey: 'a',
      validateSettings: (raw: unknown) => ({ ...(raw as object), validated: true }),
      // intentionally no onSettingsChange
    })
    const core = new PluginCore([mod], ports)
    await core.init({ a: {} })

    await core.notifySettingsChanged('a', { updated: true })

    expect(core.getModuleSettings('a')).toEqual(expect.objectContaining({ updated: true, validated: true }))
  })

  it('is a no-op when settingsKey is not found', async () => {
    const ports = makePorts()
    const core = new PluginCore([], ports)
    await core.init({})

    await expect(core.notifySettingsChanged('ghost', {})).resolves.toBeUndefined()
    expect(ports.logger.warn).not.toHaveBeenCalled()
  })

  it('is a no-op before init() is called', async () => {
    const ports = makePorts()
    const onSettingsChange = vi.fn()
    const mod = makeModule('a', { settingsKey: 'a', onSettingsChange })
    const core = new PluginCore([mod], ports)

    // Do NOT call core.init()
    await core.notifySettingsChanged('a', {})

    expect(onSettingsChange).not.toHaveBeenCalled()
  })
})
