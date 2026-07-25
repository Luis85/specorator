<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { t } from '../../../../i18n/i18n';
import { CALLBACKS_KEY, CONTENT_HOST_KEY } from './keys';
import { useTeamChatStore } from './stores/teamChatStore';
import TeamRoster from './TeamRoster.vue';
import { useTeamChatEventRouting } from './useTeamChatEventRouting';

const store = useTeamChatStore();
const hostEl = ref<HTMLElement | null>(null);
const mountHost = inject(CONTENT_HOST_KEY);

const callbacks = inject(CALLBACKS_KEY);
if (!callbacks) throw new Error('TeamChatRoot mounted without CALLBACKS_KEY');
// Subscribe before the content-host onMounted below builds the engine, so a
// restore-time selection emit projects into the store.
useTeamChatEventRouting(callbacks.subscribe);

// Capture the opaque tab-content host synchronously on mount, before the engine
// needs it. Same "leave-me-alone host" contract as chat's TabContentHost: Vue
// owns this element but never its children — the tab engine createDiv's each
// DM's DOM into it. No v-for / reactive children here.
onMounted(() => {
  if (hostEl.value && mountHost) mountHost(hostEl.value);
});
</script>

<template>
  <div class="specorator-team-chat">
    <aside class="specorator-team-chat-roster">
      <TeamRoster />
    </aside>
    <section class="specorator-team-chat-main">
      <!-- Phase 4a shows the empty state over a childless host; 4b opens a DM
           into the host and hides this once an agent is selected. -->
      <div
        v-if="!store.selectedAgentId"
        class="specorator-team-chat-empty"
      >
        {{ t('teamChat.emptyState') }}
      </div>
      <div
        ref="hostEl"
        class="specorator-team-chat-content-host"
      />
    </section>
  </div>
</template>

<style scoped>
.specorator-team-chat {
  display: grid;
  grid-template-columns: minmax(200px, 260px) 1fr;
  height: 100%;
  min-height: 0;
}
.specorator-team-chat-roster {
  border-right: 1px solid var(--sp-border);
  overflow-y: auto;
  min-height: 0;
}
.specorator-team-chat-main {
  position: relative;
  display: flex;
  min-height: 0;
  overflow: hidden;
}
.specorator-team-chat-content-host {
  flex: 1 1 auto;
  min-height: 0;
}
.specorator-team-chat-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-space-l);
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
  text-align: center;
  pointer-events: none;
}
</style>
