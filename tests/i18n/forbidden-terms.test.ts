/**
 * T-MPS-148 / NFR-MPS-011 — forbidden-terms guard for user-visible strings.
 * Generalised to all ten locales by T-IL-005 (TEST-IL-009, SPEC-IL-006).
 *
 * Plain-language requirement (spec §11.5, NFR-MPS-011): the user-facing
 * surface must not leak implementation jargon. Terms like "API key",
 * "subprocess", and "SDK" are admissible inside Settings field labels (where
 * the user is configuring those very things) but are forbidden everywhere
 * else (chat, badges, modals, popovers).
 *
 * Approach: scan EVERY registered locale catalogue for every value that does
 * NOT live under an allow-listed key and assert none of the forbidden terms
 * appear. P11 (i18n full locale set) extends this from the en-only scan to all
 * ten catalogues (REQ-IL-009): the eight new translations must keep the same
 * guard green with the byte-unchanged P9 `ALLOWED_PREFIXES`. Extending
 * `ALLOWED_PREFIXES` is a defect-escalation (EC-IL-005), never a default —
 * a leaked term is a translation defect to fix in the catalogue.
 */
import { describe, it, expect } from 'vitest'
import { SUPPORTED_LOCALES, type SupportedLocale } from '@/ui/i18n'
import en from '@/ui/i18n/locales/en'
import de from '@/ui/i18n/locales/de'
import es from '@/ui/i18n/locales/es'
import fr from '@/ui/i18n/locales/fr'
import ja from '@/ui/i18n/locales/ja'
import ko from '@/ui/i18n/locales/ko'
import pt from '@/ui/i18n/locales/pt'
import ru from '@/ui/i18n/locales/ru'
import zhCN from '@/ui/i18n/locales/zh-CN'
import zhTW from '@/ui/i18n/locales/zh-TW'

const FORBIDDEN = [/\bAPI key\b/i, /\bsubprocess\b/i, /\bSDK\b/i]

// Settings-tab labels are allowed to use the literal terms because the user
// is configuring those affordances. Anything outside `settings.*` is the
// chat / badge / modal / notice surface and must stay plain-language.
// The P9 provider secret field + its key-required notice are a credential-
// configuration affordance (the user is entering a provider API key), so they
// share the settings-context exception (the literal term is the clearest copy).
// BYTE-UNCHANGED from P9 — any extension is a defect-escalation (EC-IL-005).
const ALLOWED_PREFIXES = [
  'settings.',
  'errors.subprocess',
  'provider.field.',
  'agent.chat.providers.secret.',
  'agent.chat.providers.notice.keyRequired',
]

function flatten(obj: unknown, prefix = ''): Array<readonly [string, string]> {
  if (typeof obj === 'string') return [[prefix, obj]]
  if (obj === null || typeof obj !== 'object') return []
  const out: Array<readonly [string, string]> = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out.push(...flatten(v, prefix === '' ? k : `${prefix}.${k}`))
  }
  return out
}

function isAllowed(key: string): boolean {
  return ALLOWED_PREFIXES.some((p) => key.startsWith(p))
}

const CATALOGUES: Record<SupportedLocale, unknown> = {
  en,
  de,
  es,
  fr,
  ja,
  ko,
  pt,
  ru,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
}

describe('NFR-MPS-011 / TEST-IL-009 — i18n forbidden-terms guard (all ten locales)', () => {
  it.each(SUPPORTED_LOCALES)(
    '%s: no user-visible string mentions "API key" / "subprocess" / "SDK" outside the allow-list',
    (code) => {
      const entries = flatten(CATALOGUES[code]).filter(([k]) => !isAllowed(k))
      const offenders: Array<{ locale: string; key: string; value: string; pattern: string }> = []
      for (const [key, value] of entries) {
        for (const pattern of FORBIDDEN) {
          if (pattern.test(value)) {
            offenders.push({ locale: code, key, value, pattern: pattern.source })
          }
        }
      }
      expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([])
    },
  )
})
