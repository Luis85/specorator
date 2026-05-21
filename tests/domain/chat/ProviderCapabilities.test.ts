/**
 * T-MPS-012 — `ProviderCapabilities` shape contract.
 *
 * Covers REQ-MPS-006. The interface must expose all eight readonly fields
 * from SPEC-MPS-001 §2.4 with the documented types. The test asserts both
 * via a structural fixture and via the type-level `expectTypeOf` helper so
 * a future field-rename produces an immediate red.
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import type { ProviderCapabilities } from '@/domain/chat/ProviderCapabilities'
import type { ProviderMode } from '@/domain/chat/ProviderSelection'

describe('ProviderCapabilities', () => {
  it('accepts a structurally complete record', () => {
    const caps: ProviderCapabilities = {
      modes: ['api', 'cli'],
      models: [{ id: 'claude-sonnet-4', label: 'Claude Sonnet 4' }],
      supportsStreaming: true,
      supportsTools: true,
      supportsThinking: true,
      supportsPlanMode: false,
      supportsAttachments: ['image', 'file'],
      supportsSessionResume: true,
      modeDisabledReason: { api: null, cli: null },
    }
    expect(caps.modes).toEqual(['api', 'cli'])
    expect(caps.models[0].id).toBe('claude-sonnet-4')
    expect(caps.supportsStreaming).toBe(true)
    expect(caps.supportsAttachments).toContain('image')
    expect(caps.modeDisabledReason.api).toBeNull()
  })

  it('compile-time: required fields are present with correct types', () => {
    expectTypeOf<ProviderCapabilities>().toHaveProperty('modes').toEqualTypeOf<
      ReadonlyArray<ProviderMode>
    >()
    expectTypeOf<ProviderCapabilities>().toHaveProperty('models').toEqualTypeOf<
      ReadonlyArray<{ readonly id: string; readonly label: string }>
    >()
    expectTypeOf<ProviderCapabilities>()
      .toHaveProperty('supportsStreaming')
      .toEqualTypeOf<boolean>()
    expectTypeOf<ProviderCapabilities>()
      .toHaveProperty('supportsTools')
      .toEqualTypeOf<boolean>()
    expectTypeOf<ProviderCapabilities>()
      .toHaveProperty('supportsThinking')
      .toEqualTypeOf<boolean>()
    expectTypeOf<ProviderCapabilities>()
      .toHaveProperty('supportsPlanMode')
      .toEqualTypeOf<boolean>()
    expectTypeOf<ProviderCapabilities>()
      .toHaveProperty('supportsAttachments')
      .toEqualTypeOf<ReadonlyArray<'image' | 'file'>>()
    expectTypeOf<ProviderCapabilities>()
      .toHaveProperty('supportsSessionResume')
      .toEqualTypeOf<boolean>()
    expectTypeOf<ProviderCapabilities>()
      .toHaveProperty('modeDisabledReason')
      .toEqualTypeOf<Readonly<Record<ProviderMode, string | null>>>()
  })

  it('supports a mode-disabled reason string', () => {
    const caps: ProviderCapabilities = {
      modes: ['api'],
      models: [],
      supportsStreaming: false,
      supportsTools: false,
      supportsThinking: false,
      supportsPlanMode: false,
      supportsAttachments: [],
      supportsSessionResume: false,
      modeDisabledReason: { api: null, cli: 'Cursor CLI not resolved' },
    }
    expect(caps.modeDisabledReason.cli).toBe('Cursor CLI not resolved')
  })
})
