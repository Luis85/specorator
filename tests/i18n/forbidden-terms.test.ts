/**
 * T-MPS-148 / NFR-MPS-011 — forbidden-terms guard for user-visible strings.
 *
 * Plain-language requirement (spec §11.5, NFR-MPS-011): the user-facing
 * surface must not leak implementation jargon. Terms like "API key",
 * "subprocess", and "SDK" are admissible inside Settings field labels (where
 * the user is configuring those very things) but are forbidden everywhere
 * else (chat, badges, modals, popovers).
 *
 * Approach: scan the English locale dictionary for every value that does
 * NOT live under a `settings.*` key and assert none of the forbidden terms
 * appear. The German bundle is opt-in (most strings still fall back to
 * English); the test re-runs against it when the key exists.
 */
import { describe, it, expect } from 'vitest'
import en from '@/ui/i18n/locales/en'

const FORBIDDEN = [/\bAPI key\b/i, /\bsubprocess\b/i, /\bSDK\b/i]

// Settings-tab labels are allowed to use the literal terms because the user
// is configuring those affordances. Anything outside `settings.*` is the
// chat / badge / modal / notice surface and must stay plain-language.
// The P9 provider secret field + its key-required notice are a credential-
// configuration affordance (the user is entering a provider API key), so they
// share the settings-context exception (the literal term is the clearest copy).
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

describe('NFR-MPS-011 — i18n forbidden-terms guard', () => {
  it('en: no user-visible string mentions "API key" / "subprocess" / "SDK" outside settings', () => {
    const entries = flatten(en).filter(([k]) => !isAllowed(k))
    const offenders: Array<{ key: string; value: string; pattern: string }> = []
    for (const [key, value] of entries) {
      for (const pattern of FORBIDDEN) {
        if (pattern.test(value)) {
          offenders.push({ key, value, pattern: pattern.source })
        }
      }
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([])
  })
})
