/**
 * T-MPS-153 — Settings smoke against the two Obsidian secret-store states.
 *
 * Obsidian 1.11.4 introduced `App.secretStorage`. The plugin treats the
 * synchronous `available` boolean on `SecretStorePort` as the discriminator:
 *
 *   - 1.11.4 (`available === true`)  → password input renders; secret reads
 *     and writes are wired to the keychain.
 *   - 1.11.3 (`available === false`) → degraded notice renders; no input.
 *
 * Deeper field behaviour is covered by `CursorKeyField.test.ts`; this smoke
 * pins the release-criterion contract.
 */
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import CursorKeyField from '@/ui/components/settings/CursorKeyField.vue'
import { MockSecretStore } from '@/infrastructure/mock/MockSecretStore'
import { CursorKeyFieldPO } from './CursorKeyField.po'

function smoke(available: boolean) {
  const port = new MockSecretStore({ available })
  const wrapper = mount(CursorKeyField, {
    props: { port, initialValue: '' },
  })
  return { wrapper, po: new CursorKeyFieldPO(wrapper) }
}

describe('T-MPS-153 — CursorKeyField smoke under 1.11.3 / 1.11.4 secret-store states', () => {
  it('1.11.4 (available=true): renders the password field and no degraded notice', () => {
    const { po } = smoke(true)
    expect(po.input.exists()).toBe(true)
    expect(po.unavailableNotice.exists()).toBe(false)
  })

  it('1.11.3 (available=false): renders the degraded notice and no password field', () => {
    const { po } = smoke(false)
    expect(po.input.exists()).toBe(false)
    expect(po.unavailableNotice.exists()).toBe(true)
  })
})
