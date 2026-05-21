/**
 * T-MPS-023 — `PluginSettings` defaults + shape after WS-2.
 *
 * Covers REQ-MPS-003 (settings carrier), REQ-MPS-008, REQ-MPS-014,
 * REQ-MPS-040. The flat `transportKind` field is removed; six new fields
 * are added with the defaults from SPEC-MPS-001 §2.7.
 *
 * The original `transportKind` is retained as a deprecated optional field
 * on the type until WS-3 completes the selector reshape (T-MPS-029). The
 * default does NOT include `transportKind` — the field is migration input
 * only, not a settings carrier.
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  DEFAULT_SETTINGS,
  type PluginSettings,
} from '@/domain/settings/PluginSettings'
import type {
  ProviderId,
  ProviderSelection,
} from '@/domain/chat/ProviderSelection'

describe('PluginSettings — WS-2 delta (SPEC-MPS-001 §2.7)', () => {
  it('DEFAULT_SETTINGS exposes providerSelection as { forced: auto }', () => {
    expect(DEFAULT_SETTINGS.providerSelection).toEqual({ forced: 'auto' })
  })

  it('DEFAULT_SETTINGS exposes cursorCliPath as ""', () => {
    expect(DEFAULT_SETTINGS.cursorCliPath).toBe('')
  })

  it('DEFAULT_SETTINGS exposes cursorApiPreview as false', () => {
    expect(DEFAULT_SETTINGS.cursorApiPreview).toBe(false)
  })

  it('DEFAULT_SETTINGS exposes autoPreferProvider as "claude"', () => {
    expect(DEFAULT_SETTINGS.autoPreferProvider).toBe('claude')
  })

  it('DEFAULT_SETTINGS exposes providerModel with both claude and cursor defaults', () => {
    expect(DEFAULT_SETTINGS.providerModel).toEqual({
      claude: 'claude-sonnet-4',
      cursor: 'cursor-default',
    })
  })

  it('DEFAULT_SETTINGS exposes chatTabCap = 10', () => {
    expect(DEFAULT_SETTINGS.chatTabCap).toBe(10)
  })

  it('compile-time: providerSelection is typed as ProviderSelection', () => {
    expectTypeOf<PluginSettings['providerSelection']>().toEqualTypeOf<ProviderSelection>()
  })

  it('compile-time: providerModel is keyed by ProviderId', () => {
    expectTypeOf<PluginSettings['providerModel']>().toEqualTypeOf<
      Readonly<Record<ProviderId, string>>
    >()
  })

  it('compile-time: autoPreferProvider is typed as ProviderId', () => {
    expectTypeOf<PluginSettings['autoPreferProvider']>().toEqualTypeOf<ProviderId>()
  })
})
