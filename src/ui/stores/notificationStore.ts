import { defineStore } from 'pinia'
import { ref } from 'vue'

interface Notice {
  id: number
  message: string
  durationMs: number
}

let nextId = 0

export const useNotificationStore = defineStore('notifications', () => {
  const notices = ref<Notice[]>([])

  function addNotice(message: string, durationMs = 4000) {
    const id = ++nextId
    notices.value.push({ id, message, durationMs })
    setTimeout(() => {
      notices.value = notices.value.filter((n) => n.id !== id)
    }, durationMs)
  }

  return { notices, addNotice }
})
