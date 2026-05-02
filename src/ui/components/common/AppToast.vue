<script setup lang="ts">
import { useNotificationStore } from '../../stores/notificationStore'

const store = useNotificationStore()
</script>

<template>
  <Teleport to="body">
    <div class="sp-toast-container" aria-live="polite" aria-atomic="false">
      <div
        v-for="notice in store.notices"
        :key="notice.id"
        class="sp-toast"
        role="status"
      >
        {{ notice.message }}
      </div>
    </div>
  </Teleport>
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
  background: var(--background-secondary);
  color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
  border-radius: 0.375rem;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  max-width: 20rem;
  word-break: break-word;
  animation: sp-toast-in 0.2s ease-out;
}

@keyframes sp-toast-in {
  from { opacity: 0; transform: translateY(0.5rem); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
