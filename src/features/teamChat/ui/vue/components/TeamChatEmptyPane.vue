<script setup lang="ts">
import { computed, inject } from 'vue';

import { t } from '../../../../../i18n/i18n';
import { mountIcon } from '../../../../chat/ui/vue/mountIcon';
import { CALLBACKS_KEY } from '../keys';
import { useTeamChatStore } from '../stores/teamChatStore';
import TeamRosterAvatar from '../TeamRosterAvatar.vue';

/**
 * The no-DM-selected pane. Previously an icon and one line of text; now it also offers
 * up to three agent quick-picks, because a roster with agents in it should never present
 * a dead pane whose only instruction is "select an agent" while the list sits two inches
 * away (design §3.2).
 *
 * Quick-picks are the first few rows in the rail's own order — the store's `agents` is
 * already the projected roster, so the two can't disagree about who is on the team.
 */
const QUICK_PICK_LIMIT = 3;
const QUICK_PICK_AVATAR_SIZE = 24;

const store = useTeamChatStore();
const callbacks = inject(CALLBACKS_KEY);

const quickPicks = computed(() => store.agents.slice(0, QUICK_PICK_LIMIT));

// Decorative anchor; reuses the view's own `users` identity (getIcon). Painted through
// mountIcon's nodeType guard so popout leaves stay safe, matching EditedFilesStrip.
function emptyIcon(el: HTMLElement | null): void {
  mountIcon(el, 'users');
}
</script>

<template>
  <div class="specorator-team-chat-empty">
    <span
      :ref="(el) => emptyIcon(el as HTMLElement | null)"
      class="specorator-team-chat-empty-icon"
      aria-hidden="true"
    />
    <p class="specorator-team-chat-empty-headline">
      {{ t('teamChat.emptyHeadline') }}
    </p>
    <p class="specorator-team-chat-empty-text">
      {{ t('teamChat.emptyState') }}
    </p>

    <div
      v-if="quickPicks.length > 0"
      class="specorator-team-chat-empty-picks"
      :aria-label="t('teamChat.emptyQuickPicks')"
      role="group"
    >
      <button
        v-for="agent in quickPicks"
        :key="agent.id"
        type="button"
        class="specorator-team-chat-empty-pick"
        @click="callbacks?.onSelectAgent(agent.id)"
      >
        <TeamRosterAvatar
          :agent="agent"
          :size="QUICK_PICK_AVATAR_SIZE"
        />
        <span class="specorator-team-chat-empty-pick-name">{{ agent.name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.specorator-team-chat-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-space-s);
  padding: var(--sp-space-l);
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
  text-align: center;
  /* The container must not swallow clicks meant for the (childless) host beneath it;
     the interactive children opt back in below. */
  pointer-events: none;
}
.specorator-team-chat-empty-icon {
  display: flex;
  color: var(--sp-text-faint);
}
.specorator-team-chat-empty-icon :deep(svg) {
  width: 40px;
  height: 40px;
}
.specorator-team-chat-empty-headline {
  margin: 0;
  color: var(--sp-text);
  font-weight: var(--sp-weight-semibold);
}
.specorator-team-chat-empty-text {
  margin: 0;
  max-width: 32ch;
}
.specorator-team-chat-empty-picks {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--sp-space-2xs);
  pointer-events: auto;
}
.specorator-team-chat-empty-pick {
  display: flex;
  align-items: center;
  gap: var(--sp-space-2xs);
  padding: var(--sp-space-2xs) var(--sp-space-s);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-m);
  background: var(--sp-surface-raised);
  color: var(--sp-text);
  font-size: var(--sp-font-small);
  cursor: pointer;
  transition: background-color 120ms ease;
}
.specorator-team-chat-empty-pick:hover {
  background: var(--sp-surface-hover);
}
.specorator-team-chat-empty-pick:focus-visible {
  outline: 2px solid var(--sp-border-focus);
  outline-offset: 2px;
}
.specorator-team-chat-empty-pick-name {
  max-width: 16ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .specorator-team-chat-empty-pick {
    transition: none;
  }
}
</style>
