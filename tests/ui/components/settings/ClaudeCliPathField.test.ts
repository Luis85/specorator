/**
 * T-ASM-016 — Tests for ClaudeCliPathField.vue.
 * Satisfies REQ-ASM-004 (field rendered), REQ-ASM-005 (autodetect surface),
 * REQ-ASM-008 (ToS disclosure copy rendered verbatim).
 *
 * PageObject co-located; data-testid-only selectors per ADR-009.
 */
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ClaudeCliPathField from '@/ui/components/settings/ClaudeCliPathField.vue'
import { ClaudeCliPathFieldPO } from './ClaudeCliPathField.po'

/** Literal REQ-ASM-008 copy — must match component byte-for-byte. */
const REQ_ASM_008_COPY =
  'Specorator does not handle your Claude.ai credentials. The `claude` CLI you installed manages its own login.'

function mountField(modelValue = '') {
  const wrapper = mount(ClaudeCliPathField, {
    props: { modelValue },
  })
  return { wrapper, po: new ClaudeCliPathFieldPO(wrapper) }
}

describe('ClaudeCliPathField (T-ASM-016)', () => {
  it('renders with an empty initial value', () => {
    const { po } = mountField('')
    expect(po.input.exists()).toBe(true)
    expect(po.inputValue()).toBe('')
  })

  it('renders with a non-empty initial value preserved', () => {
    const { po } = mountField('/usr/local/bin/claude')
    expect(po.inputValue()).toBe('/usr/local/bin/claude')
  })

  it('renders the five data-testid attributes from SPEC §7.5', () => {
    const { po } = mountField('')
    expect(po.input.exists()).toBe(true)
    expect(po.autodetectBtn.exists()).toBe(true)
    expect(po.testBtn.exists()).toBe(true)
    expect(po.description.exists()).toBe(true)
    expect(po.status.exists()).toBe(true)
  })

  it('description renders REQ-ASM-008 disclosure copy verbatim', () => {
    const { po } = mountField('')
    expect(po.description.text()).toBe(REQ_ASM_008_COPY)
  })

  it('emits update:modelValue with trimmed value on blur', async () => {
    const { wrapper, po } = mountField('')
    await po.setInput('  /opt/homebrew/bin/claude  ')
    await po.blurInput()
    const events = wrapper.emitted('update:modelValue')
    expect(events).toBeTruthy()
    expect(events?.[events.length - 1]).toEqual(['/opt/homebrew/bin/claude'])
  })

  it('does NOT emit update:modelValue on every keystroke (only on blur)', async () => {
    const { wrapper, po } = mountField('')
    await po.setInput('/usr/local/bin/claude')
    // No blur yet — no emit per SPEC §7.5 ("On blur of the text input").
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('emits autodetect (no payload) on autodetect button click', async () => {
    const { wrapper, po } = mountField('')
    await po.clickAutodetect()
    const events = wrapper.emitted('autodetect')
    expect(events).toBeTruthy()
    expect(events?.[0]).toEqual([])
  })

  it('emits test (no payload) on test button click', async () => {
    const { wrapper, po } = mountField('/usr/local/bin/claude')
    await po.clickTest()
    const events = wrapper.emitted('test')
    expect(events).toBeTruthy()
    expect(events?.[0]).toEqual([])
  })

  it('input has aria-describedby referencing the description and status node ids', () => {
    const { po } = mountField('')
    const describedBy = po.input.attributes('aria-describedby') ?? ''
    expect(describedBy.length).toBeGreaterThan(0)
    const descId = po.description.attributes('id')
    const statusId = po.status.attributes('id')
    expect(descId).toBeDefined()
    expect(statusId).toBeDefined()
    expect(describedBy).toContain(descId!)
    expect(describedBy).toContain(statusId!)
  })

  it('autodetect and test buttons expose aria-label', () => {
    const { po } = mountField('')
    expect((po.autodetectBtn.attributes('aria-label') ?? '').length).toBeGreaterThan(0)
    expect((po.testBtn.attributes('aria-label') ?? '').length).toBeGreaterThan(0)
  })

  it('no AI/SDK jargon in visible copy (NFR-CCS-012 / forbidden-terms posture)', () => {
    const { wrapper } = mountField('')
    const text = wrapper.text().toLowerCase()
    for (const banned of ['subprocess', 'oauth', 'session_id', 'stream-json', 'zod', 'envelope']) {
      expect(text).not.toContain(banned)
    }
  })
})
