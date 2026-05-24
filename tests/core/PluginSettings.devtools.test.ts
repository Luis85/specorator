/**
 * T-MHP-008 — DevTools + write-gating settings additions.
 *
 * Satisfies: REQ-MHP-010, REQ-MHP-016, REQ-MHP-017, REQ-MHP-043.
 * Spec: §"Settings additions" — 5 new keys, all default `false`.
 *
 *  requireExplicitAcceptForAllWrites              boolean   default false  (REQ-MHP-010)
 *  devtools.masterEnabled                         boolean   default false  (REQ-MHP-016)
 *  devtools.autoAcceptLowRisk                     boolean   default false  (REQ-MHP-043)
 *  devtools.tools['dev:dom'].enabled              boolean   default false  (REQ-MHP-017)
 *  devtools.tools['dev:cdp'].enabled              boolean   default false  (REQ-MHP-017)
 *  devtools.tools['dev:debug'].enabled            boolean   default false  (REQ-MHP-017)
 *  devtools.tools['dev:mobile'].enabled           boolean   default false  (REQ-MHP-017)
 *  devtools.tools['devtools'].enabled             boolean   default false  (REQ-MHP-017)
 *
 * Pre-existing settings files that lack these keys MUST still load with the
 * new defaults — no shape break on older saved data.
 *
 * TDD: this test MUST fail until `PluginSettings.ts` is extended with the
 * five new keys + `DEFAULT_SETTINGS` carries the defaults.
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  DEFAULT_SETTINGS,
  type PluginSettings,
} from '@/domain/settings/PluginSettings'

const HIGH_RISK_TOOL_IDS = [
  'dev:dom',
  'dev:cdp',
  'dev:debug',
  'dev:mobile',
  'devtools',
] as const

describe('PluginSettings — MHP DevTools additions (REQ-MHP-010/-016/-017/-043)', () => {
  it('REQ-MHP-010: DEFAULT_SETTINGS.requireExplicitAcceptForAllWrites === false', () => {
    expect(DEFAULT_SETTINGS.requireExplicitAcceptForAllWrites).toBe(false)
  })

  it('REQ-MHP-016: DEFAULT_SETTINGS.devtools.masterEnabled === false', () => {
    expect(DEFAULT_SETTINGS.devtools.masterEnabled).toBe(false)
  })

  it('REQ-MHP-043: DEFAULT_SETTINGS.devtools.autoAcceptLowRisk === false', () => {
    expect(DEFAULT_SETTINGS.devtools.autoAcceptLowRisk).toBe(false)
  })

  it.each(HIGH_RISK_TOOL_IDS)(
    'REQ-MHP-017: DEFAULT_SETTINGS.devtools.tools["%s"].enabled === false',
    (toolId) => {
      const tools = DEFAULT_SETTINGS.devtools.tools as Readonly<
        Record<string, { enabled: boolean }>
      >
      expect(tools[toolId]).toBeDefined()
      expect(tools[toolId].enabled).toBe(false)
    },
  )

  it('DEFAULT_SETTINGS.devtools.tools enumerates exactly the 5 high-risk tool ids', () => {
    const keys = Object.keys(DEFAULT_SETTINGS.devtools.tools).sort()
    expect(keys).toEqual([...HIGH_RISK_TOOL_IDS].sort())
  })

  it('compile-time: PluginSettings carries requireExplicitAcceptForAllWrites: boolean', () => {
    expectTypeOf<
      PluginSettings['requireExplicitAcceptForAllWrites']
    >().toEqualTypeOf<boolean>()
  })

  it('compile-time: PluginSettings carries the devtools substructure', () => {
    expectTypeOf<PluginSettings['devtools']['masterEnabled']>().toEqualTypeOf<boolean>()
    expectTypeOf<PluginSettings['devtools']['autoAcceptLowRisk']>().toEqualTypeOf<boolean>()
  })

  it('additive: existing fields (locale, specsFolder, providerSelection) still load with their pre-MHP defaults', () => {
    // Sanity guard: no existing setting's shape changes with this addition.
    expect(DEFAULT_SETTINGS.locale).toBe('en')
    expect(DEFAULT_SETTINGS.specsFolder).toBe('specs')
    expect(DEFAULT_SETTINGS.providerSelection).toEqual({ forced: 'auto' })
  })
})
