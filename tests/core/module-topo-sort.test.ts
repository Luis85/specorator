import { describe, it, expect, vi } from 'vitest'
import { topoSort } from '@/core/module-topo-sort'
import type { ModuleDescriptor } from '@/modules'

function makeModule(id: string, overrides?: Partial<ModuleDescriptor>): ModuleDescriptor {
  return { id, init: vi.fn(), ...overrides }
}

describe('topoSort', () => {
  it('returns an empty array for no modules', () => {
    expect(topoSort([])).toEqual([])
  })

  it('preserves declaration order when there are no dependencies', () => {
    const a = makeModule('a')
    const b = makeModule('b')
    const c = makeModule('c')
    expect(topoSort([a, b, c]).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('places a dependency before its dependant', () => {
    const a = makeModule('a')
    const b = makeModule('b', { dependsOn: ['a'] })
    expect(topoSort([b, a]).map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('preserves declaration order across independent modules at the same depth', () => {
    const x = makeModule('x')
    const y = makeModule('y')
    expect(topoSort([x, y]).map((m) => m.id)).toEqual(['x', 'y'])
  })

  it('handles a chain of dependencies', () => {
    const a = makeModule('a')
    const b = makeModule('b', { dependsOn: ['a'] })
    const c = makeModule('c', { dependsOn: ['b'] })
    expect(topoSort([c, b, a]).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('handles a diamond (a → b, a → c, both → d)', () => {
    const a = makeModule('a')
    const b = makeModule('b', { dependsOn: ['a'] })
    const c = makeModule('c', { dependsOn: ['a'] })
    const d = makeModule('d', { dependsOn: ['b', 'c'] })
    const order = topoSort([d, c, b, a]).map((m) => m.id)
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'))
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'))
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'))
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'))
  })

  it('throws on a 2-cycle and lists both modules', () => {
    const a = makeModule('a', { dependsOn: ['b'] })
    const b = makeModule('b', { dependsOn: ['a'] })
    expect(() => topoSort([a, b])).toThrow(/cycle/i)
    expect(() => topoSort([a, b])).toThrow(/\ba\b/)
    expect(() => topoSort([a, b])).toThrow(/\bb\b/)
  })

  it('throws on a 3-cycle and names every involved module', () => {
    const a = makeModule('a', { dependsOn: ['c'] })
    const b = makeModule('b', { dependsOn: ['a'] })
    const c = makeModule('c', { dependsOn: ['b'] })
    expect(() => topoSort([a, b, c])).toThrow(/cycle.*a.*b.*c|cycle.*c.*b.*a|cycle.*b.*a.*c/i)
  })
})
