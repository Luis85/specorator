import { describe, it, expect } from 'vitest'
import { helloModule } from '@/modules/hello/hello-module'
import { fakeModulePorts } from '../../__fakes__/fake-ports'

describe('helloModule', () => {
  it('emits hello:initialized on init with the correct moduleId', () => {
    const ports = fakeModulePorts()
    const received: Array<{ moduleId: string }> = []
    ports.bus.on('hello:initialized', (envelope) => {
      received.push(envelope.payload)
    })

    helloModule.init(ports, {})

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual({ moduleId: 'hello' })
  })

  it('has no destroy method (no bus subscriptions to clean up)', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { destroy } = helloModule
    expect(destroy).toBeUndefined()
  })
})
