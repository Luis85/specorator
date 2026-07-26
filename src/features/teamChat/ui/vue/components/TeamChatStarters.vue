<script setup lang="ts">
import { computed, inject } from 'vue';

import { t } from '../../../../../i18n/i18n';
import { CALLBACKS_KEY } from '../keys';
import { useTeamChatStore } from '../stores/teamChatStore';
import { useActiveAgent } from '../useActiveAgent';

/**
 * The "DM open, no history" state: a greeting naming the agent plus three conversation
 * starters (design §3.2).
 *
 * Rendered in NORMAL FLOW between the top bar and the tab-content host — not as an
 * overlay. An absolutely-positioned card would sit on top of the transcript island's own
 * welcome banner (two greetings for one empty thread) and would need pointer-events
 * juggling to stay click-through. In flow it simply occupies the gap an empty transcript
 * leaves, and disappears the moment the first message renders.
 *
 * A starter FILLS the composer; it never sends. A one-click send from a suggestion is
 * how you accidentally spend a provider turn you only meant to read.
 */
const store = useTeamChatStore();
const callbacks = inject(CALLBACKS_KEY);

const activeAgent = useActiveAgent();

const starters = computed(() => [
  t('teamChat.starterExplain'),
  t('teamChat.starterPlan'),
  t('teamChat.starterReview'),
]);
</script>

<template>
  <div
    v-if="activeAgent && store.activeDmIsEmpty"
    class="specorator-team-chat-starters"
  >
    <p class="specorator-team-chat-starters-title">
      {{ t('teamChat.dmGreetingTitle', { agent: activeAgent.name }) }}
    </p>
    <p class="specorator-team-chat-starters-body">
      {{ activeAgent.voice?.trim() || activeAgent.description?.trim() || t('teamChat.dmGreetingBody') }}
    </p>
    <div
      class="specorator-team-chat-starters-list"
      role="group"
      :aria-label="t('teamChat.startersLabel')"
    >
      <button
        v-for="starter in starters"
        :key="starter"
        type="button"
        class="specorator-team-chat-starter"
        @click="callbacks?.onFillComposer(starter)"
      >
        {{ starter }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.specorator-team-chat-starters {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-2xs);
  padding: var(--sp-space-m) var(--sp-space-s);
  /* Same reading measure as the transcript below, so the greeting and the first
     response share one left edge instead of stepping. */
  width: 100%;
  max-width: 56rem;
}
.specorator-team-chat-starters-title {
  margin: 0;
  color: var(--sp-text);
  font-weight: var(--sp-weight-semibold);
}
.specorator-team-chat-starters-body {
  margin: 0;
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
}
.specorator-team-chat-starters-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-space-2xs);
  margin-top: var(--sp-space-2xs);
}
.specorator-team-chat-starter {
  padding: var(--sp-space-2xs) var(--sp-space-s);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-m);
  background: var(--sp-surface-raised);
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
  text-align: left;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
.specorator-team-chat-starter:hover {
  background: var(--sp-surface-hover);
  color: var(--sp-text);
}
.specorator-team-chat-starter:focus-visible {
  outline: 2px solid var(--sp-border-focus);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .specorator-team-chat-starter {
    transition: none;
  }
}
</style>
