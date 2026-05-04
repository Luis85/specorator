import { describe, it, expect, vi } from 'vitest'
import { bootstrapModules } from '@/core/bootstrap'
import { fakeModulePorts } from '../__fakes__/fake-ports'
import type { ModuleDescriptor } from '@/modules'

function makeModule(id: string, overrides?: Partial<ModuleDescriptor>): ModuleDescriptor {
  return {
    id,
    init: vi.fn(),
    ...overrides,
  }
}

describe('bootstrapModules', () => {
  it('calls init on all modules in declaration order', async () => {
    const order: string[] = []
    const ports = fakeModulePorts()
    const a = makeModule('a', { init: () => { order.push('a') } })
    const b = makeModule('b', { init: () => { order.push('b') } })

    await bootstrapModules([a, b], ports, {})

    expect(order).toEqual(['a', 'b'])
  })

  it('tears down in reverse order', async () => {
    const order: string[] = []
    const ports = fakeModulePorts()
    const a = makeModule('a', {
      init: vi.fn(),
      destroy: () => { order.push('a') },
    })
    const b = makeModule('b', {
      init: vi.fn(),
      destroy: () => { order.push('b') },
    })

    const { teardown } = await bootstrapModules([a, b], ports, {})
    await teardown()

    expect(order).toEqual(['b', 'a'])
  })

  it('handles sync void-returning init without error', async () => {
    const ports = fakeModulePorts()
    const mod = makeModule('sync', { init: () => { /* sync void */ } })

    await expect(bootstrapModules([mod], ports, {})).resolves.toBeDefined()
  })

  it('teardown resolves cleanly when no destroy methods', async () => {
    const ports = fakeModulePorts()
    const mod = makeModule('no-destroy')
    const { teardown } = await bootstrapModules([mod], ports, {})

    await expect(teardown()).resolves.toBeUndefined()
  })

  it('rolls back failing module then initialized modules in reverse when init fails', async () => {
    const destroyed: string[] = []
    const ports = fakeModulePorts()
    const a = makeModule('a', {
      init: vi.fn(),
      destroy: () => { destroyed.push('a') },
    })
    const b = makeModule('b', {
      init: () => { throw new Error('b init failed') },
      destroy: () => { destroyed.push('b') },
    })

    await expect(bootstrapModules([a, b], ports, {})).rejects.toThrow('b init failed')
    expect(destroyed).toEqual(['b', 'a'])
  })

  it('continues teardown even when a destroy method throws', async () => {
    const destroyed: string[] = []
    const ports = fakeModulePorts()
    const a = makeModule('a', {
      init: vi.fn(),
      destroy: () => { throw new Error('a destroy failed') },
    })
    const b = makeModule('b', {
      init: vi.fn(),
      destroy: () => { destroyed.push('b') },
    })

    const { teardown } = await bootstrapModules([a, b], ports, {})
    await expect(teardown()).resolves.toBeUndefined()
    expect(destroyed).toContain('b')
  })
})
