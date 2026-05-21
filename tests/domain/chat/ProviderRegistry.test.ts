/**
 * T-MPS-014 — `ProviderRegistry` interface structural contract.
 *
 * Covers REQ-MPS-006, NFR-MPS-003. The interface is implementation-free
 * in WS-2; WS-3's `buildProviderRegistry` will instantiate the runtime
 * registry. Here we exercise the contract by implementing a fake registry
 * that satisfies the interface and assert the three documented methods
 * exist with the documented return types.
 *
 * Also enforces NFR-MPS-003 (no secret-bearing field on `ProviderEntry`):
 * any property name containing 'secret', 'apiKey', 'apikey', 'token', or
 * 'password' on `ProviderEntry` would surface here.
 */
import { describe, it, expect } from 'vitest'
import type {
  ProviderEntry,
  ProviderRegistry,
} from '@/domain/chat/ProviderRegistry'
import type { ProviderCapabilities } from '@/domain/chat/ProviderCapabilities'
import type { SlashCommand } from '@/domain/chat/SlashCommand'

const fakeCaps: ProviderCapabilities = {
  modes: ['api'],
  models: [{ id: 'claude-sonnet-4', label: 'Sonnet 4' }],
  supportsStreaming: true,
  supportsTools: true,
  supportsThinking: false,
  supportsPlanMode: false,
  supportsAttachments: [],
  supportsSessionResume: false,
  modeDisabledReason: { api: null, cli: 'CLI not implemented' },
}

const claudeEntry: ProviderEntry = {
  id: 'claude',
  label: 'Claude',
  capabilities: fakeCaps,
  slashCommands: () => [] as ReadonlyArray<SlashCommand>,
}

const cursorEntry: ProviderEntry = {
  id: 'cursor',
  label: 'Cursor',
  capabilities: fakeCaps,
  slashCommands: () => [] as ReadonlyArray<SlashCommand>,
}

class FakeRegistry implements ProviderRegistry {
  constructor(private readonly entries: ReadonlyArray<ProviderEntry>) {}
  listProviders(): ReadonlyArray<ProviderEntry> {
    return this.entries
  }
  getProvider(id: ProviderEntry['id']): ProviderEntry | undefined {
    return this.entries.find((e) => e.id === id)
  }
  getCapabilities(id: ProviderEntry['id']): ProviderCapabilities | undefined {
    return this.getProvider(id)?.capabilities
  }
}

describe('ProviderRegistry interface contract', () => {
  const registry = new FakeRegistry([claudeEntry, cursorEntry])

  it('listProviders returns the registered entries', () => {
    expect(registry.listProviders().map((e) => e.id)).toEqual([
      'claude',
      'cursor',
    ])
  })

  it('getProvider returns the entry for a known id', () => {
    expect(registry.getProvider('cursor')?.label).toBe('Cursor')
  })

  it('getProvider returns undefined for an unknown id', () => {
    // @ts-expect-error — testing runtime guard against a non-ProviderId
    expect(registry.getProvider('mistral')).toBeUndefined()
  })

  it('getCapabilities returns the capability record', () => {
    expect(registry.getCapabilities('claude')).toBe(fakeCaps)
  })

  it('getCapabilities returns undefined for an unknown id', () => {
    // @ts-expect-error — testing runtime guard against a non-ProviderId
    expect(registry.getCapabilities('mistral')).toBeUndefined()
  })

  it('slashCommands returns an array (empty when none registered)', () => {
    expect(registry.getProvider('claude')?.slashCommands()).toEqual([])
  })
})

describe('ProviderEntry — no secret-bearing fields (NFR-MPS-003)', () => {
  it('field names do not include secret/token/apiKey/password', () => {
    const keys = Object.keys(claudeEntry).map((k) => k.toLowerCase())
    const forbidden = ['secret', 'apikey', 'token', 'password']
    for (const banned of forbidden) {
      expect(keys.some((k) => k.includes(banned))).toBe(false)
    }
  })
})
