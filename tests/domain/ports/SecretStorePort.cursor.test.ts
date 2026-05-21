/**
 * T-MPS-038 — SECRET_ID_CURSOR exported and accepted by SecretStorePort.
 *
 * Satisfies REQ-MPS-010 (canonical Cursor secret id) and verifies the
 * MockSecretStore round-trip for the new constant. Mirrors the existing
 * SECRET_ID_ANTHROPIC contract from the predecessor feature.
 */
import { describe, it, expect } from 'vitest'
import { SECRET_ID_CURSOR } from '@/domain/ports'
import { MockSecretStore } from '@/infrastructure/mock/MockSecretStore'

describe('SECRET_ID_CURSOR (T-MPS-038, REQ-MPS-010)', () => {
  it('is the canonical lowercase-hyphenated id', () => {
    expect(SECRET_ID_CURSOR).toBe('specorator-cursor-apikey')
  })

  it('matches the Obsidian secretStorage id grammar (lowercase + dashes)', () => {
    expect(SECRET_ID_CURSOR).toMatch(/^[a-z0-9-]+$/)
  })

  it('is distinct from SECRET_ID_ANTHROPIC', async () => {
    const store = new MockSecretStore()
    await store.setSecret('specorator-anthropic-apikey', 'A-KEY')
    await store.setSecret(SECRET_ID_CURSOR, 'C-KEY')
    expect(await store.getSecret(SECRET_ID_CURSOR)).toBe('C-KEY')
    expect(await store.getSecret('specorator-anthropic-apikey')).toBe('A-KEY')
  })

  it('MockSecretStore accepts setSecret(SECRET_ID_CURSOR, ...) round-trip', async () => {
    const store = new MockSecretStore()
    await store.setSecret(SECRET_ID_CURSOR, 'cursor-test-key-xyz')
    expect(await store.getSecret(SECRET_ID_CURSOR)).toBe('cursor-test-key-xyz')
  })

  it('returns null when no value is stored', async () => {
    const store = new MockSecretStore()
    expect(await store.getSecret(SECRET_ID_CURSOR)).toBeNull()
  })
})
