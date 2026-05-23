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
  /*
   * UX #14 (WP-8): chips were `max-width: 14rem` on the label which clipped
   * silently at narrow sidepanel widths. Switch to flex-based shrinking so
   * the chip yields proportionally to the row, with a generous lower bound
   * to keep at least the basename readable. The parent `ContextFileList`
   * controls how many chips render before the `+N more` overflow chip
   * takes over (see `VISIBLE_CHIP_LIMIT`).
   */
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 9999px;
  padding: 0.1rem 0.5rem;
  font-size: 0.8125rem;
  font-family: var(--font-text);
  max-width: 100%;
  min-width: 0;
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

.sp-chat__chip-label {
  /*
   * UX #14 (WP-8): the fixed `max-width: 14rem` clipped chips silently at
   * narrow widths. Use flex-based shrinking; the parent row controls
   * overall layout via `min-width: 0` propagation.
   */
  flex: 0 1 auto;
  min-width: 0;
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
