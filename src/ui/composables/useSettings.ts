import { storeToRefs } from 'pinia'
import { useBridge } from './useBridge'
import { useSettingsStore } from '../stores/settingsStore'
import { setLocale } from '../i18n'
import type { SupportedLocale } from '../i18n'
import type { PluginSettings } from '@/infrastructure/bridge/IBridge'

export function useSettings() {
  const bridge = useBridge()
  const store = useSettingsStore()
  const { settings, loading } = storeToRefs(store)

  async function loadSettings(): Promise<void> {
    store.setLoading(true)
    try {
      const s = await bridge.getSettings()
      store.setSettings(s)
      if (s.locale) setLocale(s.locale as SupportedLocale)
    } finally {
      store.setLoading(false)
    }
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
