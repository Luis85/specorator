<script setup lang="ts">
import { computed } from 'vue';

import { t } from '../../../../../i18n/i18n';
import type { TeamChatPresence } from '../../../teamChatPresence';

// A small idle/busy indicator for a roster row. `busy` (the agent's DM is
// streaming) pulses in the accent color; `idle` is a static faint dot. The label
// is exposed to assistive tech via role="img" + aria-label (and mirrored to the
// native title tooltip). Base idle/busy only — the finer thinking→streaming split
// is out of increment 1.
const props = defineProps<{ state: TeamChatPresence }>();

const label = computed(() =>
  props.state === 'busy' ? t('teamChat.presenceBusy') : t('teamChat.presenceIdle'));
</script>

<template>
  <span
    class="specorator-team-presence-dot"
    :class="`specorator-team-presence-dot--${state}`"
    role="img"
    :aria-label="label"
    :title="label"
  />
</template>

<style scoped>
.specorator-team-presence-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--sp-text-faint);
}
.specorator-team-presence-dot--busy {
  background: var(--sp-accent);
  animation: specorator-team-presence-pulse 1.35s ease-in-out infinite;
}
@keyframes specorator-team-presence-pulse {
  0%,
  100% {
    opacity: 0.85;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.25);
  }
}
/* Honor reduced-motion: keep the color signal, drop the pulse (parity with the
   tab-badge working dot). */
@media (prefers-reduced-motion: reduce) {
  .specorator-team-presence-dot--busy {
    animation: none;
  }
}
</style>
