<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * Two consumers, two render modes:
 *
 *   - `legacyMode === true` (default, `SpecoratorView` standalone embed)
 *       renders the full state machine — idle placeholder, loading copy,
 *       success text body, trimmed-success notice, error / timeout /
 *       structured-fail banners, and the `proposalCard` slot.
 *
 *   - `legacyMode === false` (agent sidepanel)
 *       suppresses the redundant rendering surfaces because `MessageList`
 *       is the source of truth for assistant text in that mount:
 *         * UX-#1: success/trimmed-success text body NOT rendered (MessageList
 *           shows the appended assistant `ChatMessage`).
 *         * UX-#2: `loading` "Thinking…" copy NOT rendered (MessageList's
 *           streaming bubble already shows in-flight state with a cursor).
 *         * `idle` is hidden too — the sidepanel header carries the empty
 *           state instead.
 *       The `proposalCard` slot, the trim notice, and the
 *       error / timeout / structured-fail banners still render because
 *       MessageList does not host those affordances.
 */
defineProps<{
  state:
    | 'idle'
    | 'loading'
    | 'success'
    | 'trimmed-success'
    | 'timeout'
    | 'error'
    | 'structured-fail'
  text?: string
  legacyMode?: boolean
}>()

const { t } = useI18n()
</script>

<template>
  <!-- Idle placeholder — legacy only -->
  <p
    v-if="state === 'idle' && (legacyMode ?? true)"
    class="sp-chat__response-idle"
    data-testid="chat-response-idle"
  >
    {{ t('chat.responsePlaceholder') }}
  </p>

  <!-- Loading state — legacy only (UX-#2: MessageList streaming bubble owns the agent panel). -->
  <div
    v-else-if="state === 'loading' && (legacyMode ?? true)"
    role="status"
    aria-live="polite"
    class="sp-chat__response-loading"
    data-testid="chat-response-loading"
  >
    {{ t('chat.responseLoading') }}
  </div>

  <!-- Success state with optional trim notice -->
  <template v-else-if="state === 'trimmed-success'">
    <p
      role="status"
      aria-live="polite"
      class="sp-chat__trim-notice"
      data-testid="chat-response-trim-notice"
    >
      {{ t('chat.responseTrimmed') }}
    </p>
    <!-- UX-#1: success text body lives in MessageList in the agent panel. -->
    <div
      v-if="legacyMode ?? true"
      class="sp-chat__response-text"
      data-testid="chat-response-text"
    >{{ text }}</div>
    <slot name="proposalCard" />
  </template>

  <!-- Success state -->
  <template v-else-if="state === 'success'">
    <!-- UX-#1: same suppression in the plain success branch. -->
    <div
      v-if="legacyMode ?? true"
      class="sp-chat__response-text"
      data-testid="chat-response-text"
    >{{ text }}</div>
    <slot name="proposalCard" />
  </template>

  <!-- Timeout error -->
  <p
    v-else-if="state === 'timeout'"
    role="alert"
    aria-live="assertive"
    class="sp-chat__error"
    data-testid="chat-response-error"
  >
    {{ t('chat.responseTimeout') }}
  </p>

  <!-- Generic error -->
  <p
    v-else-if="state === 'error'"
    role="alert"
    aria-live="assertive"
    class="sp-chat__error"
    data-testid="chat-response-error"
  >
    {{ t('chat.responseError') }}
  </p>

  <!-- Structured-output parse failure (REQ-ASM-025) -->
  <p
    v-else-if="state === 'structured-fail'"
    role="alert"
    aria-live="assertive"
    class="sp-chat__error"
    data-testid="chat-response-structured-fail"
  >
    {{ t('chat.response.structuredFail') }}
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
