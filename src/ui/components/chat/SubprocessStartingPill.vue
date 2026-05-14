<script setup lang="ts">
/**
 * SubprocessStartingPill — short-lived pill shown during the Claude CLI
 * cold-spawn window (≈300–3000 ms on macOS) to mitigate R-ASM-003.
 *
 * Satisfies SPEC-ASM-001 §7.2 (REQ-ASM-035, NFR-ASM-001, NFR-ASM-008).
 * Plain-language copy per DESIGN-ASM-001 §B3:
 *   chat.subscription.starting = "Starting up the Claude tool…"
 *
 * The component is purely presentational; the parent (ChatSidebar)
 * binds `visible` from `chatStore.cliStartingUp`.
 */
defineProps<{
  visible: boolean
}>()
</script>

<template>
  <span
    v-if="visible"
    class="sp-chat__starting-pill"
    data-testid="chat-subprocess-starting"
    role="status"
    aria-live="polite"
  >
    Starting up the Claude tool…
  </span>
</template>

<style scoped>
.sp-chat__starting-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 9999px;
  padding: 0.15rem 0.625rem;
  background: var(--background-modifier-border);
  color: var(--text-muted);
  font-family: var(--font-text);
  font-size: 0.8125rem;
  line-height: 1.2;
}
</style>
