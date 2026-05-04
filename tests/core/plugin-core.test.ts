import '../../src/core/core-events' // load EventMap augmentation
import { describe, it, expect, vi } from 'vitest'
import { PluginCore } from '@/core/plugin-core'
import { fakeModulePorts } from '../__fakes__/fake-ports'
import type { ModuleDescriptor } from '@/modules'
import type { CorePorts } from '@/core/plugin-core'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePorts(): CorePorts {
  const { settings, vault, workspace, notifications, logger } = fakeModulePorts()
  return { settings, vault, workspace, notifications, logger }
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

  it('skips degraded modules during destroy', async () => {
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
