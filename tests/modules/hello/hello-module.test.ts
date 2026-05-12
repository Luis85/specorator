import '@/modules/hello/hello-events' // load EventMap augmentation
import { describe, it, expect } from 'vitest'
import { helloModule } from '@/modules/hello/hello-module'
import { fakeModulePorts } from '../../__fakes__/fake-ports'

describe('helloModule descriptor metadata', () => {
  it("has id='hello', settingsKey='hello', settingsVersion=1", () => {
    expect(helloModule.id).toBe('hello')
    expect(helloModule.settingsKey).toBe('hello')
    expect(helloModule.settingsVersion).toBe(1)
  })

  it('has settingsDefaults { showBadge: true }', () => {
    expect(helloModule.settingsDefaults).toEqual({ showBadge: true })
  })
})

describe('helloModule.validateSettings', () => {
  const validate = (raw: unknown) => {
    const fn = helloModule.validateSettings
    if (!fn) throw new Error('validateSettings is undefined')
    return fn(raw)
  }

  it('preserves explicit showBadge=false', () => {
    expect(validate({ showBadge: false })).toEqual({ showBadge: false })
  })

  it('preserves explicit showBadge=true', () => {
    expect(validate({ showBadge: true })).toEqual({ showBadge: true })
  })

  it('coerces non-boolean showBadge to true', () => {
    expect(validate({ showBadge: 'yes' })).toEqual({ showBadge: true })
    expect(validate({ showBadge: 0 })).toEqual({ showBadge: true })
    expect(validate({ showBadge: null })).toEqual({ showBadge: true })
  })

  it('returns { showBadge: true } for null input', () => {
    expect(validate(null)).toEqual({ showBadge: true })
  })

  it('returns { showBadge: true } for undefined input', () => {
    expect(validate(undefined)).toEqual({ showBadge: true })
  })

  it('returns { showBadge: true } when the key is missing', () => {
    expect(validate({})).toEqual({ showBadge: true })
  })
})

describe('helloModule.init', () => {
  it('emits hello:initialized on init with the correct moduleId', () => {
    const ports = fakeModulePorts()
    const received: Array<{ moduleId: string }> = []
    ports.bus.on('hello:initialized', (envelope) => {
      received.push(envelope.payload)
    })

    helloModule.init(ports, { showBadge: true })

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual({ moduleId: 'hello' })
  })

  it('has no destroy method (no bus subscriptions to clean up)', () => {
    const { destroy } = helloModule
    expect(destroy).toBeUndefined()
  })
})

describe('helloModule shape', () => {
  it("commands array contains 'hello:open-view'", () => {
    const ids = helloModule.commands?.map((c) => c.id) ?? []
    expect(ids).toContain('hello:open-view')
  })

  it("invoking the 'hello:open-view' command callback is a safe no-op", () => {
    const cmd = helloModule.commands?.find((c) => c.id === 'hello:open-view')
    expect(cmd).toBeDefined()
    expect(() => { cmd!.callback() }).not.toThrow()
  })

  it("views array contains 'hello-view'", () => {
    const ids = helloModule.views?.map((v) => v.id) ?? []
    expect(ids).toContain('hello-view')
  })

  it("settingsSchema has a 'showBadge' toggle field", () => {
    const field = helloModule.settingsSchema?.fields.find((f) => f.key === 'showBadge')
    expect(field).toBeDefined()
    expect(field?.type).toBe('toggle')
  })

  it("messages provide 'hello.title' for en and de", () => {
    expect(helloModule.messages?.en?.['hello.title']).toBeDefined()
    expect(helloModule.messages?.de?.['hello.title']).toBeDefined()
  })
})
