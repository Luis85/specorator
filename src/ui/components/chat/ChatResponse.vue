<script setup lang="ts">
defineProps<{
  state: 'idle' | 'loading' | 'success' | 'trimmed-success' | 'timeout' | 'error'
  text?: string
}>()
</script>

<template>
  <!-- Idle placeholder -->
  <p
    v-if="state === 'idle'"
    class="sp-chat__response-idle"
    data-testid="chat-response-idle"
  >
    (Response will appear here.)
  </p>

  <!-- Loading state -->
  <div
    v-else-if="state === 'loading'"
    role="status"
    aria-live="polite"
    class="sp-chat__response-loading"
    data-testid="chat-response-loading"
  >
    Thinking…
  </div>

  <!-- Success state with optional trim notice -->
  <template v-else-if="state === 'trimmed-success'">
    <p
      role="status"
      aria-live="polite"
      class="sp-chat__trim-notice"
      data-testid="chat-response-trim-notice"
    >
      Some context was trimmed to keep the message within size limits.
    </p>
    <div class="sp-chat__response-text" data-testid="chat-response-text">{{ text }}</div>
  </template>

  <!-- Success state -->
  <div
    v-else-if="state === 'success'"
    class="sp-chat__response-text"
    data-testid="chat-response-text"
  >
    {{ text }}
  </div>

  <!-- Timeout error -->
  <p
    v-else-if="state === 'timeout'"
    role="alert"
    aria-live="assertive"
    class="sp-chat__error"
    data-testid="chat-response-error"
  >
    That took too long. Please try again.
  </p>

  <!-- Generic error -->
  <p
    v-else-if="state === 'error'"
    role="alert"
    aria-live="assertive"
    class="sp-chat__error"
    data-testid="chat-response-error"
  >
    Something went wrong. Please try again.
  </p>
</template>

<style scoped>
.sp-chat__response-idle {
  color: var(--text-muted);
  font-size: 0.875rem;
  margin: 0;
  font-style: italic;
}

.sp-chat__response-loading {
  color: var(--text-muted);
  font-size: 0.875rem;
  margin: 0;
}

.sp-chat__response-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-text);
  font-size: 0.875rem;
  color: var(--text-normal);
  margin: 0;
}

.sp-chat__trim-notice {
  background: var(--background-modifier-border);
  color: var(--text-warning, var(--text-muted));
  border-radius: 6px;
  padding: 0.375rem 0.625rem;
  font-size: 0.8125rem;
  margin: 0 0 0.5rem;
}

.sp-chat__error {
  color: var(--text-error);
  font-size: 0.875rem;
  margin: 0;
}
</style>
