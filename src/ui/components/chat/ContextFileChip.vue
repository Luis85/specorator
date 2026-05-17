<script setup lang="ts">
import type { ContextFileEntry } from '@/ui/stores/messagesStore'

defineProps<{
  file: ContextFileEntry
  disabled: boolean
}>()

const emit = defineEmits<{
  remove: []
}>()
</script>

<template>
  <!-- Auto variant: no remove button, auto label -->
  <span
    v-if="file.isAuto"
    class="sp-chat__chip sp-chat__chip--auto"
    data-testid="context-chip-auto"
  >
    <span class="sp-chat__chip-indicator" aria-hidden="true">&#9632;</span>
    {{ file.label }}
    <span class="sp-chat__chip-suffix" aria-hidden="true">(auto)</span>
    <span class="sr-only">(included automatically)</span>
  </span>

  <!-- Manual variant: with optional remove button -->
  <span
    v-else
    class="sp-chat__chip sp-chat__chip--manual"
    data-testid="context-chip-manual"
  >
    <span class="sp-chat__chip-label" :title="file.label">{{ file.label }}</span>
    <button
      v-if="!disabled"
      type="button"
      class="sp-chat__chip-remove"
      :aria-label="`Remove ${file.label} from context`"
      data-testid="context-chip-remove"
      @click="emit('remove')"
      @keydown.enter.prevent="emit('remove')"
      @keydown.space.prevent="emit('remove')"
    >
      <span aria-hidden="true">×</span>
    </button>
  </span>
</template>

<style scoped>
.sp-chat__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 9999px;
  padding: 0.1rem 0.5rem;
  font-size: 0.8125rem;
  font-family: var(--font-text);
}

.sp-chat__chip--auto {
  background: var(--background-modifier-border);
  color: var(--text-normal);
}

.sp-chat__chip--manual {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  color: var(--text-normal);
}

.sp-chat__chip-indicator {
  width: 6px;
  height: 6px;
  background: var(--interactive-accent);
  border-radius: 2px;
  flex-shrink: 0;
  font-size: 0.5rem;
  line-height: 1;
}

.sp-chat__chip-suffix {
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 400;
}

.sp-chat__chip-label {
  max-width: 14rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sp-chat__chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0 0.125rem;
  color: var(--text-muted);
  font-size: 1rem;
  line-height: 1;
  border-radius: 2px;
}

.sp-chat__chip-remove:hover,
.sp-chat__chip-remove:focus {
  color: var(--text-normal);
  background: var(--background-modifier-hover);
}
</style>
