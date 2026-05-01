import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PluginSettings } from '@/infrastructure/bridge/IBridge'
import { DEFAULT_SETTINGS } from '@/infrastructure/bridge/IBridge'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<PluginSettings>({ ...DEFAULT_SETTINGS })
  const loading = ref(false)

  function setSettings(value: PluginSettings): void {
    settings.value = value
  }

  function setLoading(value: boolean): void {
    loading.value = value
  }

  return { settings, loading, setSettings, setLoading }
})
