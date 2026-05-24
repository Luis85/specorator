/**
 * T-MHP-124 — AutoAcceptReceipt.vue render tests (Part B §S25, §S26).
 *
 * Satisfies REQ-MHP-009 (silent vault-append receipt surface),
 * REQ-MHP-043 (DevTools low-risk auto-accept receipt surface).
 *
 * Contract under test:
 *   - kind: 'vault-append' renders `Appended to <path>.` with the path inside
 *     a `<code data-testid="auto-accept-receipt-path">`.
 *   - kind: 'devtools-low-risk' renders `Ran <tool>.` with the tool inside
 *     a `<code data-testid="auto-accept-receipt-tool">`.
 *   - The root `<p>` exposes `data-testid="auto-accept-receipt"`,
 *     `role="status"`, and `aria-label` from `chat.autoAccept.regionAriaLabel`.
 *   - Selectors are `data-testid` only per ADR-009.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AutoAcceptReceipt from '@/ui/components/chat/AutoAcceptReceipt.vue'

function mountReceipt(props: { kind: 'vault-append' | 'devtools-low-risk'; path?: string; tool?: string }) {
  return mount(AutoAcceptReceipt, {
    props,
    attachTo: document.body,
  })
}

describe('T-MHP-124 — AutoAcceptReceipt.vue (REQ-MHP-009 / REQ-MHP-043)', () => {
  it('vault-append variant renders `Appended to <path>.` with code-wrapped path', () => {
    const wrapper = mountReceipt({ kind: 'vault-append', path: 'specs/foo/idea.md' })
    const root = wrapper.find('[data-testid="auto-accept-receipt"]')
    const pathCode = wrapper.find('[data-testid="auto-accept-receipt-path"]')
    expect(root.exists()).toBe(true)
    expect(pathCode.exists()).toBe(true)
    expect(pathCode.element.tagName.toLowerCase()).toBe('code')
    expect(pathCode.text()).toBe('specs/foo/idea.md')
    expect(root.text()).toBe('Appended to specs/foo/idea.md.')
  })

  it('devtools-low-risk variant renders `Ran <tool>.` with code-wrapped tool id', () => {
    const wrapper = mountReceipt({ kind: 'devtools-low-risk', tool: 'dev:screenshot' })
    const root = wrapper.find('[data-testid="auto-accept-receipt"]')
    const toolCode = wrapper.find('[data-testid="auto-accept-receipt-tool"]')
    expect(root.exists()).toBe(true)
    expect(toolCode.exists()).toBe(true)
    expect(toolCode.element.tagName.toLowerCase()).toBe('code')
    expect(toolCode.text()).toBe('dev:screenshot')
    expect(root.text()).toBe('Ran dev:screenshot.')
  })

  it('root exposes role="status" and the regionAriaLabel i18n copy', () => {
    const wrapper = mountReceipt({ kind: 'vault-append', path: 'a.md' })
    const root = wrapper.find('[data-testid="auto-accept-receipt"]')
    expect(root.attributes('role')).toBe('status')
    expect(root.attributes('aria-label')).toBe('Automatic accept receipt.')
  })

  it('vault-append variant does NOT render the tool testid', () => {
    const wrapper = mountReceipt({ kind: 'vault-append', path: 'a.md' })
    expect(wrapper.find('[data-testid="auto-accept-receipt-tool"]').exists()).toBe(false)
  })

  it('devtools-low-risk variant does NOT render the path testid', () => {
    const wrapper = mountReceipt({ kind: 'devtools-low-risk', tool: 'dev:errors' })
    expect(wrapper.find('[data-testid="auto-accept-receipt-path"]').exists()).toBe(false)
  })

  it('renders an empty value when path/tool prop is missing (no crash)', () => {
    const wrapper = mountReceipt({ kind: 'vault-append' })
    const root = wrapper.find('[data-testid="auto-accept-receipt"]')
    expect(root.exists()).toBe(true)
    expect(root.text()).toBe('Appended to .')
  })
})
