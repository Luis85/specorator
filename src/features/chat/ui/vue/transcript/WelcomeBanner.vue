<script setup lang="ts">
import type { TranscriptHydrationError } from './stores/transcriptStore';

/**
 * Reproduces `setupWindowedRender`'s welcome element (`.specorator-welcome` >
 * `.specorator-welcome-greeting`) plus `MessageRenderer.renderHydrationErrorBanner`'s
 * `.specorator-hydration-error[data-error-code]` banner — both are siblings
 * mounted directly under `messagesEl` in the legacy renderer, in that order,
 * so this component renders them as sibling roots rather than nesting the
 * banner inside the welcome block. The welcome block itself renders only when
 * a non-empty `greeting` is present — mirroring the legacy
 * `updateWelcomeVisibility()`, which hid the whole `.specorator-welcome` element
 * once the transcript had messages (its `flex: 1; min-height: 200px` styling
 * would otherwise leave a ~200px empty spacer above the first message).
 */
defineProps<{ greeting: string; hydrationError: TranscriptHydrationError | null }>();
</script>

<template>
  <div
    v-if="greeting"
    class="specorator-welcome"
  >
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
