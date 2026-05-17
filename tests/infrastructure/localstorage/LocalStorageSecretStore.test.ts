/**
 * WP-9 Track 1 — `LocalStorageSecretStore` coverage gap closure.
 *
 * The GitHub Pages demo runs in the browser, where there is no OS keychain.
 * `LocalStorageSecretStore` reflects that fact: `available` is `false`,
 * `getSecret` returns `null`, and `setSecret` is a no-op (per the
 * `SecretStorePort` contract — implementations MUST NOT throw on the
 * unavailable path).
 *
 * These tests close the prior 0% coverage gap (audit row); they also assert
 * the no-secret-in-logs invariant: even though this adapter has no logger
 * dependency, we verify that `setSecret`/`getSecret` do not leak the secret
 * value via thrown errors or side channels.
 */
import { describe, it, expect, vi } from 'vitest'
import { LocalStorageSecretStore } from '@/infrastructure/localstorage/LocalStorageSecretStore'
import { SECRET_ID_ANTHROPIC } from '@/domain/ports/SecretStorePort'

describe('LocalStorageSecretStore', () => {
  it('reports available === false (no OS keychain in the browser demo)', () => {
    const store = new LocalStorageSecretStore()
    expect(store.available).toBe(false)
  })

  describe('getSecret', () => {
    it('returns null for any id when the backend is unavailable', async () => {
      const store = new LocalStorageSecretStore()
      expect(await store.getSecret(SECRET_ID_ANTHROPIC)).toBeNull()
      expect(await store.getSecret('some-other-id')).toBeNull()
      expect(await store.getSecret('')).toBeNull()
    })
  })

  describe('setSecret', () => {
    it('is a no-op that never throws', async () => {
      const store = new LocalStorageSecretStore()
      await expect(
        store.setSecret(SECRET_ID_ANTHROPIC, 'sk-ant-redacted-value'),
      ).resolves.toBeUndefined()
    })

    it('does not persist the value (a subsequent getSecret still returns null)', async () => {
      const store = new LocalStorageSecretStore()
      await store.setSecret(SECRET_ID_ANTHROPIC, 'sk-ant-XYZ')
      expect(await store.getSecret(SECRET_ID_ANTHROPIC)).toBeNull()
    })

    it('does not throw for empty id or empty value', async () => {
      const store = new LocalStorageSecretStore()
      await expect(store.setSecret('', '')).resolves.toBeUndefined()
      await expect(store.setSecret('id', '')).resolves.toBeUndefined()
      await expect(store.setSecret('', 'secret')).resolves.toBeUndefined()
    })
  })

  describe('no-secret-in-logs invariant', () => {
    it('does not leak the secret value to console during set/get', async () => {
      const store = new LocalStorageSecretStore()
      // Spy every console channel — the adapter must never call any of them
      // with a payload that includes the secret value.
      const channels = ['log', 'info', 'warn', 'error', 'debug'] as const
      const spies = channels.map((c) => {
        return vi.spyOn(console, c).mockImplementation(() => undefined)
      })
      try {
        await store.setSecret(SECRET_ID_ANTHROPIC, 'sk-ant-do-not-leak')
        await store.getSecret(SECRET_ID_ANTHROPIC)
        for (const spy of spies) {
          for (const call of spy.mock.calls) {
            const text = JSON.stringify(call)
            expect(text).not.toContain('sk-ant-do-not-leak')
          }
        }
      } finally {
        for (const spy of spies) spy.mockRestore()
      }
    })
  })
})
