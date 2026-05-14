<script setup lang="ts">
import type { ContextFileEntry } from '@/ui/stores/chatStore'
import ContextFileChip from './ContextFileChip.vue'

defineProps<{
  files: ReadonlyArray<ContextFileEntry>
  disabled: boolean
}>()

const emit = defineEmits<{
  remove: [{ path: string }]
}>()
</script>

<template>
  <section aria-label="Context for this message." data-testid="context-file-list">
    <p class="sp-chat__context-label">Context for this message.</p>
    <ul role="list" class="sp-chat__context-chips" aria-label="Context files">
      <li v-for="file in files" :key="file.path" role="listitem">
        <ContextFileChip
          :file="file"
          :disabled="disabled"
          @remove="emit('remove', { path: file.path })"
        />
      </li>
    </ul>
    <p
      v-if="files.length === 0"
      class="sp-chat__context-empty"
      data-testid="context-file-empty"
    >
      No file is currently open. Open a file in your vault and it will be included here automatically.
    </p>
  </section>
</template>

<style scoped>
.sp-chat__context-label {
  margin: 0 0 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sp-chat__context-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.sp-chat__context-empty {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-muted);
}
</style>
