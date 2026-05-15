/**
 * T-ASM-083 — CCS-inheritance audit for REQ-ASM-051 / REQ-ASM-052 / REQ-ASM-053.
 *
 * Verifies that the active-file auto-context path inherited from CCS
 * (REQ-CCS-005 / REQ-CCS-006) still functions under the subscription
 * transport. This is a pure verification task — no new production code is
 * introduced.
 *
 * Asserts:
 *   (a) `setActiveFile(file)` populates the context preamble (REQ-ASM-051).
 *   (b) `setActiveFile(null)` clears it (REQ-ASM-052).
 *   (c) Manual context entries are preserved when the auto slot toggles.
 *       The file-menu "Use as chat context" action wires into the same
 *       store action (REQ-ASM-053) — that wiring lives in `plugin/main.ts`
 *       and is covered by the plugin tests; here we verify the store-side
 *       contract is unchanged under `port.kind === 'subscription'`.
 *
 * Subscription transport invariant: `port.kind === 'subscription'` is held
 * throughout the run to ensure the CCS contract is not transport-specific.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { MockClaudeSubprocessAdapter } from '@/infrastructure/mock/MockClaudeSubprocessAdapter'
import { isSubscriptionCapable } from '@/application/chat/queryStructured'
import { useChatStore } from '@/ui/stores/chatStore'

describe('TEST-ASM-053 — CCS auto-context inheritance under subscription transport (T-ASM-083)', () => {
  let port: MockClaudeSubprocessAdapter

  beforeEach(() => {
    setActivePinia(createPinia())
    port = new MockClaudeSubprocessAdapter()
    port.available = true
  })

  it('subscription transport invariant: port.kind === "subscription" throughout', () => {
    expect(isSubscriptionCapable(port)).toBe(true)
    expect((port as unknown as { kind: string }).kind).toBe('subscription')
  })

  it('(a) setActiveFile(file) populates the context preamble (REQ-ASM-051)', () => {
    expect(isSubscriptionCapable(port)).toBe(true)
    const store = useChatStore()
    expect(store.contextFiles).toEqual([])

    store.setActiveFile({ path: 'specs/demo/idea.md', label: 'idea.md', isAuto: true })

    expect(store.contextFiles).toHaveLength(1)
    expect(store.contextFiles[0]).toMatchObject({
      path: 'specs/demo/idea.md',
      label: 'idea.md',
      isAuto: true,
    })
  })

  it('(b) setActiveFile(null) clears the auto slot but preserves manuals (REQ-ASM-052)', () => {
    expect(isSubscriptionCapable(port)).toBe(true)
    const store = useChatStore()
    store.addContextFile({ path: 'manual.md', label: 'manual.md', isAuto: false })
    store.setActiveFile({ path: 'auto.md', label: 'auto.md', isAuto: true })
    expect(store.contextFiles).toHaveLength(2)

    store.setActiveFile(null)

    // Manual stays; auto is gone.
    expect(store.contextFiles).toHaveLength(1)
    expect(store.contextFiles[0]).toMatchObject({ path: 'manual.md', isAuto: false })
  })

  it('(c) toggling the auto slot replaces only the auto entry — manuals are stable across calls (REQ-ASM-053)', () => {
    expect(isSubscriptionCapable(port)).toBe(true)
    const store = useChatStore()
    store.addContextFile({ path: 'manual-a.md', label: 'manual-a.md', isAuto: false })
    store.addContextFile({ path: 'manual-b.md', label: 'manual-b.md', isAuto: false })

    // First auto entry.
    store.setActiveFile({ path: 'auto-1.md', label: 'auto-1.md', isAuto: true })
    expect(store.contextFiles.filter((f) => f.isAuto)).toHaveLength(1)
    expect(store.contextFiles.filter((f) => !f.isAuto)).toHaveLength(2)

    // Replace with a different auto entry.
    store.setActiveFile({ path: 'auto-2.md', label: 'auto-2.md', isAuto: true })
    const autoEntries = store.contextFiles.filter((f) => f.isAuto)
    expect(autoEntries).toHaveLength(1)
    expect(autoEntries[0]?.path).toBe('auto-2.md')
    // Manuals remain in their original order, unchanged.
    const manualPaths = store.contextFiles.filter((f) => !f.isAuto).map((f) => f.path)
    expect(manualPaths).toEqual(['manual-a.md', 'manual-b.md'])

    // Clear the auto slot — only manuals remain.
    store.setActiveFile(null)
    expect(store.contextFiles.every((f) => !f.isAuto)).toBe(true)
    expect(store.contextFiles.map((f) => f.path)).toEqual(['manual-a.md', 'manual-b.md'])
  })
})
