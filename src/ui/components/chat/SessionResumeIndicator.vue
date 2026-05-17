<script setup lang="ts">
/**
 * SessionResumeIndicator — pill shown in the chat panel header when the
 * current thread was resumed from a stored sessionId.
 *
 * Satisfies SPEC-ASM-001 §7.3 (REQ-ASM-035, NFR-ASM-001, NFR-ASM-008).
 * Plain-language copy per DESIGN-ASM-001 §B3 — see `chat.session.resumeAriaLabel`
 * and `chat.session.resumeLabel` in `src/ui/i18n/locales/{en,de}.ts`.
 *
 * WP-8 changes:
 *   - UX #17: the glyph-only badge gained a visible "Resumed" text label so
 *     sighted users see the same affordance as screen-reader users.
 *   - UX #20: pills are differentiated by leading glyph + per-pill tint —
 *     `↻` for resume, on a faint-accent background.
 *
 * The component is purely presentational; the parent (ChatSidebar)
 * binds `resumed` from `chatStore.sessionResumed`.
 */
import { useI18n } from 'vue-i18n'

defineProps<{
  resumed: boolean
}>()

const { t } = useI18n()
</script>

<template>
  <span
    v-if="resumed"
    class="sp-chat__resume-badge"
    data-testid="chat-session-resume"
    :aria-label="t('chat.session.resumeAriaLabel')"
  >
    <span
      aria-hidden="true"
      class="sp-chat__resume-glyph"
      data-testid="chat-session-resume-glyph"
    >↻</span>
    <span class="sp-chat__resume-label" data-testid="chat-session-resume-label">
      {{ t('chat.session.resumeLabel') }}
    </span>
  </span>
</template>

<style scoped>
/*
 * UX #17 + UX #20 (WP-8): drop the round-glyph-only chrome and render as a
 * tinted pill that matches the other header pills' shape. The leading `↻`
 * glyph plus the faint-accent tint differentiate it from
 * `SubprocessStartingPill` (`⌛`, neutral) and `TransportStatusPill` (`▶`,
 * faint-blend).
 */
.sp-chat__resume-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 9999px;
  padding: 0.15rem 0.625rem;
  background: var(
    --background-modifier-success,
    var(--background-secondary-alt, var(--background-secondary))
  );
  color: var(--text-accent, var(--text-normal));
  font-family: var(--font-text);
  font-size: 0.8125rem;
  line-height: 1.2;
}

.sp-chat__resume-glyph {
  display: inline-block;
  font-size: 0.875rem;
  line-height: 1;
}

.sp-chat__resume-label {
  font-weight: 500;
}
</style>
