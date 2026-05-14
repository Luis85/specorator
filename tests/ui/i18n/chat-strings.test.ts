/**
 * T-CCS-029 — Tests: i18n strings contain no prohibited terms.
 * Satisfies REQ-CCS-023, SPEC-CCS-001 §9.5, TEST-CCS-023.
 */
import { describe, it, expect } from 'vitest'
import en from '@/ui/i18n/locales/en'

const PROHIBITED_TERMS = [
  'system prompt',
  'API',
  'SDK',
  'subprocess',
  'tokens',
  'idea',
  'research',
  'requirements',
  'design',
  'spec',
  'tasks',
  'implementation',
  'retrospective',
]

describe('REQ-CCS-023: chat i18n strings contain no prohibited terms', () => {
  const chatValues = Object.values(en.chat)

  for (const term of PROHIBITED_TERMS) {
    it(`no chat string contains the term "${term}"`, () => {
      for (const value of chatValues) {
        expect(value.toLowerCase()).not.toContain(term.toLowerCase())
      }
    })
  }
})
