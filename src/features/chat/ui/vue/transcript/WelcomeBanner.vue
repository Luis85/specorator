<script setup lang="ts">
import type { TranscriptHydrationError } from './stores/transcriptStore';

/**
 * Reproduces `setupWindowedRender`'s welcome element (`.specorator-welcome` >
 * `.specorator-welcome-greeting`) plus `MessageRenderer.renderHydrationErrorBanner`'s
 * `.specorator-hydration-error[data-error-code]` banner — both are siblings
 * mounted directly under `messagesEl` in the legacy renderer, in that order,
 * so this component renders them as sibling roots rather than nesting the
 * banner inside the welcome block.
 */
defineProps<{ greeting: string; hydrationError: TranscriptHydrationError | null }>();
</script>

<template>
  <div class="specorator-welcome">
    <div class="specorator-welcome-greeting">
      {{ greeting }}
    </div>
  </div>
  <div
    v-if="hydrationError"
    class="specorator-hydration-error"
    :data-error-code="hydrationError.code"
  >
    {{ hydrationError.message }}
  </div>
</template>
