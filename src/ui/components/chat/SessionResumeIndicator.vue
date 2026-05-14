<script setup lang="ts">
/**
 * SessionResumeIndicator — small inline badge shown in the chat panel
 * header when the current thread was resumed from a stored sessionId.
 *
 * Satisfies SPEC-ASM-001 §7.3 (REQ-ASM-035, NFR-ASM-001, NFR-ASM-008).
 * Plain-language copy per DESIGN-ASM-001 §B3:
 *   chat.subscription.resumeAriaLabel = "Continuing prior conversation"
 *
 * The component is purely presentational; the parent (ChatSidebar)
 * binds `resumed` from `chatStore.sessionResumed`.
 */
defineProps<{
  resumed: boolean
}>()
</script>

<template>
  <span
    v-if="resumed"
    class="sp-chat__resume-badge"
    data-testid="chat-session-resume"
    aria-label="Continuing prior conversation"
  >
    <span
      aria-hidden="true"
      class="sp-chat__resume-glyph"
      data-testid="chat-session-resume-glyph"
    >↻</span>
  </span>
</template>

<style scoped>
.sp-chat__resume-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 9999px;
  background: var(--background-modifier-border);
  color: var(--sp-resume-badge-fg, var(--interactive-accent));
  font-size: 0.875rem;
  line-height: 1;
  flex-shrink: 0;
}

.sp-chat__resume-glyph {
  display: inline-block;
}
</style>
