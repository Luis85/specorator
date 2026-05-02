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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(i18n.global as any).locale.value = locale
}
