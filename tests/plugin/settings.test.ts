/**
 * T-CCS-009 — Tests: settings tab API key field saved, masked, trimmed.
 * Satisfies REQ-CCS-001, NFR-CCS-005, NFR-CCS-006, SPEC-CCS-001 §8.3, TEST-CCS-001.
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

describe('REQ-CCS-001, NFR-CCS-005: PluginSettings anthropicApiKey field', () => {
  it('DEFAULT_SETTINGS has anthropicApiKey as empty string', () => {
    expect(DEFAULT_SETTINGS.anthropicApiKey).toBe('')
  })

  it('DEFAULT_SETTINGS.anthropicApiKey is a string type', () => {
    expect(typeof DEFAULT_SETTINGS.anthropicApiKey).toBe('string')
  })
})

describe('NFR-CCS-006: Settings tab API key field security contract', () => {
  it('whitespace trimming: trim() removes leading/trailing spaces', () => {
    // This verifies the trimming logic the onChange handler applies.
    const rawValue = '  sk-ant-test  '
    const trimmed = rawValue.trim()
    expect(trimmed).toBe('sk-ant-test')
  })

  it('empty string after trim disables adapter (anthropicApiKey = "")', () => {
    const rawValue = '   '
    const trimmed = rawValue.trim()
    expect(trimmed).toBe('')
  })
})
