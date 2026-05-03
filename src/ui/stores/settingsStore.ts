import { defineStore } from 'pinia'
import { ref } from 'vue'
import { type PluginSettings, DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

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
