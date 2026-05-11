import { describe, it, expect } from 'vitest'
import { ALL_MODULES, helloModule, defineModule } from '@/modules'

describe('@/modules barrel', () => {
  it("ALL_MODULES includes the coreSettingsModule (id 'specorator')", () => {
    const ids = ALL_MODULES.map((m) => m.id)
    expect(ids).toContain('specorator')
  })

  it('ALL_MODULES includes the helloModule reference', () => {
    expect(ALL_MODULES).toContain(helloModule)
  })

  it('all entries in ALL_MODULES have unique ids', () => {
    const ids = ALL_MODULES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every entry exposes an init function', () => {
    for (const m of ALL_MODULES) {
      expect(typeof m.init).toBe('function')
    }
  })

  it('exports defineModule as a function', () => {
    expect(typeof defineModule).toBe('function')
  })

  it('defineModule returns its descriptor unchanged', () => {
    const desc = defineModule({ id: 'x', init: () => undefined })
    expect(desc.id).toBe('x')
    expect(typeof desc.init).toBe('function')
  })
})
