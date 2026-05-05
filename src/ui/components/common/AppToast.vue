<script setup lang="ts">
import { useNotificationStore } from '../../stores/notificationStore'

const store = useNotificationStore()
</script>

<template>
  <div class="sp-toast-container" aria-live="polite" aria-atomic="false">
    <button
      v-for="notice in store.notices"
      :key="notice.id"
      type="button"
      class="sp-toast"
      :data-testid="`toast-${notice.id}`"
      :aria-label="`Dismiss notice: ${notice.message}`"
      @click="store.dismissNotice(notice.id)"
    >
      <span class="sp-toast__message">{{ notice.message }}</span>
      <span class="sp-toast__close" aria-hidden="true">×</span>
    </button>
  </div>
</template>

<style scoped>
.sp-toast-container {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 9999;
  pointer-events: none;
}

.sp-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--background-secondary);
  color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
  border-radius: 0.375rem;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  max-width: 20rem;
  word-break: break-word;
  text-align: left;
  cursor: pointer;
  font: inherit;
  animation: sp-toast-in 0.2s ease-out;
}

.sp-toast:hover {
  background: var(--background-modifier-hover);
}

.sp-toast__message {
  flex: 1;
}

.sp-toast__close {
  font-size: 1.125rem;
  line-height: 1;
  color: var(--text-muted);
  flex-shrink: 0;
}

@keyframes sp-toast-in {
  from { opacity: 0; transform: translateY(0.5rem); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
