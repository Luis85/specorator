import type { ModuleDescriptor } from '@/modules'

export function applyModuleMessages(
  mod: ModuleDescriptor,
  mergeMessages: (locale: string, messages: Record<string, string>) => void,
): void {
  if (mod.messages === undefined) return
  for (const [locale, msgs] of Object.entries(mod.messages)) {
    if (msgs !== undefined) mergeMessages(locale, msgs)
  }
}
