/**
 * T-MPS-047 / T-MPS-048 — CursorKeyField.vue.
 *
 * Available variant: password input + save through SecretStorePort.
 * Unavailable variant: degraded notice; no password input rendered.
 *
 * Satisfies REQ-MPS-011, REQ-MPS-012, NFR-MPS-001. PageObject co-located;
 * data-testid-only selectors per ADR-009.
 */
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import CursorKeyField from '@/ui/components/settings/CursorKeyField.vue'
import { MockSecretStore } from '@/infrastructure/mock/MockSecretStore'
import { SECRET_ID_CURSOR } from '@/domain/ports'
import { CursorKeyFieldPO } from './CursorKeyField.po'

function mountField(opts: { available: boolean; initialValue?: string }) {
  const port = new MockSecretStore({ available: opts.available })
  const wrapper = mount(CursorKeyField, {
    props: { port, initialValue: opts.initialValue ?? '' },
  })
  return { wrapper, po: new CursorKeyFieldPO(wrapper), port }
}

describe('CursorKeyField — available variant (T-MPS-047, REQ-MPS-011)', () => {
  it('renders a password input and helper description', () => {
    const { po } = mountField({ available: true })
    expect(po.input.exists()).toBe(true)
    expect(po.input.attributes('type')).toBe('password')
    expect(po.input.attributes('autocomplete')).toBe('off')
    expect(po.description.exists()).toBe(true)
    expect(po.unavailableNotice.exists()).toBe(false)
  })

  it('preserves the initial value', () => {
    const { po } = mountField({ available: true, initialValue: 'preset-key' })
    expect(po.inputValue()).toBe('preset-key')
  })

  it('writes the trimmed value to SecretStorePort.setSecret(SECRET_ID_CURSOR, …) on blur', async () => {
    const { po, port, wrapper } = mountField({ available: true })
    await po.setInput('  cursor-real-key  ')
    await po.blurInput()
    expect(await port.getSecret(SECRET_ID_CURSOR)).toBe('cursor-real-key')
    const saved = wrapper.emitted('saved')
    expect(saved).toBeTruthy()
    expect(saved?.[0]).toEqual(['cursor-real-key'])
  })

  it('emits saveFailed and never crashes when the port throws', async () => {
    const throwingPort = {
      available: true,
      getSecret: async () => null,
      setSecret: async () => {
        throw new Error('keychain locked')
      },
    }
    const wrapper = mount(CursorKeyField, { props: { port: throwingPort } })
    const po = new CursorKeyFieldPO(wrapper)
    await po.setInput('x')
    await po.blurInput()
    expect(wrapper.emitted('saveFailed')).toBeTruthy()
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('input has aria-describedby referencing description and status node ids', () => {
    const { po } = mountField({ available: true })
    const describedBy = po.input.attributes('aria-describedby') ?? ''
    expect(describedBy.length).toBeGreaterThan(0)
    const descId = po.description.attributes('id')
    const statusId = po.status.attributes('id')
    expect(descId).toBeDefined()
    expect(statusId).toBeDefined()
    expect(describedBy).toContain(descId!)
    expect(describedBy).toContain(statusId!)
  })
})

describe('CursorKeyField — unavailable variant (T-MPS-048, REQ-MPS-012)', () => {
  it('renders the degraded notice and no password input', () => {
    const { po } = mountField({ available: false })
    expect(po.unavailableNotice.exists()).toBe(true)
    expect(po.input.exists()).toBe(false)
    expect(po.description.exists()).toBe(false)
  })

  it('notice copy mentions the OS keychain limitation without leaking implementation jargon', () => {
    const { po, wrapper } = mountField({ available: false })
    expect(po.unavailableNotice.text()).toMatch(/keychain/i)
    // No forbidden-terms (NFR-CCS-012 posture)
    const text = wrapper.text().toLowerCase()
    for (const banned of ['subprocess', 'oauth', 'session_id', 'stream-json', 'zod', 'envelope']) {
      expect(text).not.toContain(banned)
    }
  })
})
