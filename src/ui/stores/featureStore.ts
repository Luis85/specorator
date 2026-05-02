import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { FeatureDto } from '../types/FeatureDto'

export const useFeatureStore = defineStore('features', () => {
  const items = ref<FeatureDto[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const activeItems = computed(() => items.value.filter((f) => f.status === 'active'))
  const draftItems = computed(() => items.value.filter((f) => f.status === 'draft'))
  const archivedItems = computed(() => items.value.filter((f) => f.status === 'archived'))

  function setItems(features: FeatureDto[]): void {
    items.value = features
  }

  function upsert(feature: FeatureDto): void {
    const idx = items.value.findIndex((f) => f.id === feature.id)
    if (idx === -1) {
      items.value.push(feature)
    } else {
      items.value[idx] = feature
    }
  }

  function remove(id: string): void {
    items.value = items.value.filter((f) => f.id !== id)
  }

  function setLoading(value: boolean): void {
    loading.value = value
  }

  function setError(message: string | null): void {
    error.value = message
  }

  return {
    items,
    loading,
    error,
    activeItems,
    draftItems,
    archivedItems,
    setItems,
    upsert,
    remove,
    setLoading,
    setError,
  }
})
