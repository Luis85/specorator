export interface TranslationPort {
  t(key: string, params?: Record<string, unknown>): string
}
