<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  modelValue: string
  disabled: boolean
  loading: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  send: []
}>()

const textareaEl = ref<HTMLTextAreaElement | null>(null)

defineExpose({ textareaEl })

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    if (!props.disabled && !props.loading) {
      event.preventDefault()
      emit('send')
    }
  }
}

function handleInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <div class="sp-chat__input-area">
    <textarea
      ref="textareaEl"
      class="sp-chat__textarea"
      :value="modelValue"
      :readonly="disabled"
      :aria-label="'Message'"
      aria-multiline="true"
      placeholder="Ask anything about your work…"
      rows="3"
      data-testid="chat-input-textarea"
      @input="handleInput"
      @keydown="handleKeydown"
    />
    <div class="sp-chat__input-actions">
      <button
        type="button"
        class="sp-btn sp-btn--primary sp-btn--md"
        :disabled="disabled"
        aria-label="Send message"
        data-testid="chat-send-button"
        @click="!disabled && !loading && emit('send')"
      >
        <span v-if="loading" class="sp-btn__spinner" aria-hidden="true" />
        <span>{{ loading ? 'Asking…' : 'Ask' }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sp-chat__input-area {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sp-chat__textarea {
  width: 100%;
  min-height: 4.5rem;
  max-height: 8rem;
  resize: none;
  overflow-y: auto;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  background: var(--background-primary);
  color: var(--text-normal);
  font-family: var(--font-text);
  font-size: 0.875rem;
  box-sizing: border-box;
}

.sp-chat__textarea:focus {
  outline: none;
  border-color: var(--interactive-accent);
}

.sp-chat__input-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
