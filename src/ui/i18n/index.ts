import { createI18n } from 'vue-i18n'
import type en from './locales/en'
import enMessages from './locales/en'
import deMessages from './locales/de'

/** Type of the EN message catalogue — used for component type-safety. */
export type MessageSchema = typeof en
export type SupportedLocale = 'en' | 'de'

export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'de']

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  // Typed as unknown to avoid literal-type conflicts between locale files;
  // vue-i18n still validates keys at runtime.
  messages: { en: enMessages, de: deMessages } as unknown as Record<SupportedLocale, MessageSchema>,
})

export function setLocale(locale: SupportedLocale): void {
  const ref = (i18n.global as { locale: { value: SupportedLocale } }).locale
  ref.value = locale
}

function flatToNested(flat: Record<string, string>): Record<string, unknown> {
  const nested: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.')
    let current = nested
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) current[parts[i]] = {}
      current = current[parts[i]] as Record<string, unknown>
    }
    current[parts[parts.length - 1]] = value
  }
  return nested
}

interface I18nGlobalMerge {
  mergeLocaleMessage(locale: string, messages: Record<string, unknown>): void
  t(key: string, params: Record<string, unknown>): string
}

const globalMerge = i18n.global as unknown as I18nGlobalMerge

export function i18nMerge(locale: string, messages: Record<string, string>): void {
  globalMerge.mergeLocaleMessage(locale, flatToNested(messages))
}

export function i18nTranslate(key: string, params?: Record<string, unknown>): string {
  return globalMerge.t(key, params ?? {})
}
