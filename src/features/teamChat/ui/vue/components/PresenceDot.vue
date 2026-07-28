<script setup lang="ts">
import { computed } from 'vue';

import { t } from '../../../../../i18n/i18n';
import type { TeamChatPresence } from '../../../teamChatPresence';

/**
 * A small status indicator for a roster row or the top bar's avatar. Three states,
 * rendered one at a time:
 *  - `busy` — the agent's DM is streaming: accent, pulsing.
 *  - `unread` — the DM moved since this leaf last showed it: accent, static. Static
 *    is what keeps it distinguishable from `busy` at a glance; two pulsing accent
 *    dots would be one signal, not two.
 *  - `idle` — a static faint dot.
 * The label is exposed to assistive tech via role="img" + aria-label (and mirrored
 * to the native title tooltip). The finer thinking→streaming split is still out of
 * increment 1.
 */
type PresenceDotState = TeamChatPresence | 'unread';

const props = defineProps<{ state: PresenceDotState }>();

const LABEL_KEYS = {
  busy: 'teamChat.presenceBusy',
  unread: 'teamChat.presenceUnread',
  idle: 'teamChat.presenceIdle',
} as const;

const label = computed(() => t(LABEL_KEYS[props.state]));
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
/* Unread shares busy's accent (both mean "something happened here") but stays
   static, so the pulse remains the unambiguous "right now" signal. Scales in
   rather than popping, since it appears mid-session on an already-rendered row. */
.specorator-team-presence-dot--unread {
  background: var(--sp-accent);
  animation: specorator-team-presence-appear 140ms ease-out;
}
@keyframes specorator-team-presence-appear {
  from {
    transform: scale(0.4);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
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
  .specorator-team-presence-dot--busy,
  .specorator-team-presence-dot--unread {
    animation: none;
  }
}
</style>
