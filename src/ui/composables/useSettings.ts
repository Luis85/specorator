import { storeToRefs } from 'pinia'
import { useSettingsPort } from './useSettingsPort'
import { useSettingsStore } from '../stores/settingsStore'
import { setLocale } from '../i18n'
import type { SupportedLocale } from '../i18n'
import { tryAsync } from '@/domain/shared/tryAsync'
import type { PluginSettings } from '@/domain/settings/PluginSettings'

export function useSettings() {
  const bridge = useSettingsPort()
  const store = useSettingsStore()
  const { settings, loading } = storeToRefs(store)

  async function loadSettings(): Promise<void> {
    store.setLoading(true)
    const result = await tryAsync(async () => {
      const s = await bridge.getSettings()
      store.setSettings(s)
      if (s.locale) setLocale(s.locale as SupportedLocale)
    })
    store.setLoading(false)
    if (!result.ok) throw result.error
  }

  async function saveSettings(updated: PluginSettings): Promise<void> {
    await bridge.saveSettings(updated)
    store.setSettings(updated)
    if (updated.locale) setLocale(updated.locale as SupportedLocale)
  }

  return {
    settings,
    loading,
    loadSettings,
    saveSettings,
  }
}
