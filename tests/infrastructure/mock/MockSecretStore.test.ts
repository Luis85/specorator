/**
 * WP-9 Track 1 — `MockSecretStore` coverage + invariant assertions.
 *
 * Raises statement coverage from the audit baseline (58%) to ≥ 95%, asserts
 * the canonical id matches Obsidian's `App.secretStorage` validator regex,
 * proves round-trip persistence (set then get returns the stored value), and
 * verifies the no-secret-in-logs invariant.
 *
 * The id-format assertion documents the SecretStorePort.ts §44 finding: the
 * previous dot-delimited / camelCase id was silently rejected by Obsidian's
 * lowercase-alphanumeric-with-dashes validator. Encoding the regex here
 * prevents a future rename from re-introducing that silent-no-op bug.
 */
import { describe, it, expect, vi } from 'vitest'
import { MockSecretStore } from '@/infrastructure/mock/MockSecretStore'
import { SECRET_ID_ANTHROPIC } from '@/domain/ports/SecretStorePort'

describe('MockSecretStore', () => {
  describe('SECRET_ID_ANTHROPIC format invariant', () => {
    it('matches Obsidian\'s App.secretStorage validator (lowercase + dashes)', () => {
      expect(SECRET_ID_ANTHROPIC).toMatch(/^[a-z0-9-]+$/)
    })
  })

  describe('availability', () => {
    it('defaults to available === true so tests exercise the production branch', () => {
      const store = new MockSecretStore()
      expect(store.available).toBe(true)
    })

    it('can be constructed with available: false to exercise the degraded branch', () => {
      const store = new MockSecretStore({ available: false })
      expect(store.available).toBe(false)
    })
  })

  describe('constructor seeding', () => {
    it('returns null for an unset id when constructed empty', async () => {
      const store = new MockSecretStore()
      expect(await store.getSecret(SECRET_ID_ANTHROPIC)).toBeNull()
    })

    it('round-trips initial values supplied at construction time', async () => {
      const store = new MockSecretStore({
        initial: { [SECRET_ID_ANTHROPIC]: 'sk-ant-initial' },
      })
      expect(await store.getSecret(SECRET_ID_ANTHROPIC)).toBe('sk-ant-initial')
    })

    it('handles multiple seeded ids independently', async () => {
      const store = new MockSecretStore({
        initial: { a: 'one', b: 'two' },
      })
      expect(await store.getSecret('a')).toBe('one')
      expect(await store.getSecret('b')).toBe('two')
      expect(await store.getSecret('c')).toBeNull()
    })
  })

  describe('round-trip persistence (the core invariant)', () => {
    it('setSecret then getSecret returns the value just stored', async () => {
      const store = new MockSecretStore()
      await store.setSecret(SECRET_ID_ANTHROPIC, 'sk-ant-round-trip')
      expect(await store.getSecret(SECRET_ID_ANTHROPIC)).toBe('sk-ant-round-trip')
    })

    it('setSecret overwrites a prior value at the same id', async () => {
      const store = new MockSecretStore()
      await store.setSecret(SECRET_ID_ANTHROPIC, 'first')
      await store.setSecret(SECRET_ID_ANTHROPIC, 'second')
      expect(await store.getSecret(SECRET_ID_ANTHROPIC)).toBe('second')
    })

    it('setSecret does not affect other ids', async () => {
      const store = new MockSecretStore()
      await store.setSecret('a', '1')
      await store.setSecret('b', '2')
      expect(await store.getSecret('a')).toBe('1')
      expect(await store.getSecret('b')).toBe('2')
    })

    it('preserves the empty string as a valid stored value (distinct from "unset")', async () => {
      const store = new MockSecretStore()
      await store.setSecret(SECRET_ID_ANTHROPIC, '')
      expect(await store.getSecret(SECRET_ID_ANTHROPIC)).toBe('')
    })
  })

  describe('unavailable branch', () => {
    it('getSecret returns null when available === false even for a seeded id', async () => {
      const store = new MockSecretStore({
        available: false,
        initial: { [SECRET_ID_ANTHROPIC]: 'sk-ant-seeded' },
      })
      expect(await store.getSecret(SECRET_ID_ANTHROPIC)).toBeNull()
    })

    it('setSecret is a no-op when available === false (contract: MUST NOT throw)', async () => {
      const store = new MockSecretStore({ available: false })
      await expect(store.setSecret(SECRET_ID_ANTHROPIC, 'sk-ant-X')).resolves.toBeUndefined()
      // Re-enable available via a fresh store and confirm the prior call did
      // not silently mutate the underlying map — flipping availability is
      // out-of-scope (the field is readonly), so we use snapshot indirectly:
      // the available:false store snapshot still reflects what was seeded.
      expect(store.snapshot()).toEqual({})
    })
  })

  describe('snapshot helper', () => {
    it('returns a plain object reflecting current contents', async () => {
      const store = new MockSecretStore()
      await store.setSecret('a', '1')
      await store.setSecret('b', '2')
      expect(store.snapshot()).toEqual({ a: '1', b: '2' })
    })

    it('returns an empty object when nothing has been stored', () => {
      const store = new MockSecretStore()
      expect(store.snapshot()).toEqual({})
    })
  })

  describe('no-secret-in-logs invariant', () => {
    it('does not leak the secret value to console during set/get', async () => {
      const store = new MockSecretStore()
      const channels = ['log', 'info', 'warn', 'error', 'debug'] as const
      const spies = channels.map((c) => vi.spyOn(console, c).mockImplementation(() => undefined))
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
