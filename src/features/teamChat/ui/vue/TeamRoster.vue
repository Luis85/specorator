<script setup lang="ts">
import { inject, onMounted, onUnmounted, watch } from 'vue';

import { t } from '../../../../i18n/i18n';
import { withErrorNotice } from '../../../../shared/uiAction';
import { useRosterStore } from '../../../library/vue/stores/rosterStore';
import { PLUGIN_KEY } from './keys';
import { useTeamChatStore } from './stores/teamChatStore';
import TeamRosterAvatar from './TeamRosterAvatar.vue';

const AVATAR_SIZE = 32;
const ROSTER_RELOAD_DEBOUNCE_MS = 300;

const plugin = inject(PLUGIN_KEY);
if (!plugin) throw new Error('TeamRoster mounted without PLUGIN_KEY');

// Reuse the library roster store as the loader (vault I/O stays there); mirror
// its list into this leaf's read-model, which the DM surface reads (selected
// agent + presence in 4b). Instantiated in THIS leaf's Pinia, so it never shares
// state with a Library leaf.
const rosterStore = useRosterStore();
rosterStore.init(plugin);
const teamChatStore = useTeamChatStore();

// `immediate` seeds on mount and re-mirrors on every roster reload.
watch(() => rosterStore.agents, (agents) => teamChatStore.setAgents(agents), { immediate: true });

onMounted(() => void withErrorNotice(() => rosterStore.load(), t('agentRoster.actionFailed'), fail));

// Roster agents are managed through agentRosterStore (not loose vault notes), so
// a folder watch is the wrong seam: the store emits `roster:changed` on every
// save/delete. Subscribe + debounce-reload so an external edit (Agent Board,
// chat-view roster edit, provider sync, marketplace install) refreshes this leaf
// without a remount. Same shape as AgentsPanel's subscription.
let rosterOff: (() => void) | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
onMounted(() => {
  rosterOff = plugin.events.on('roster:changed', () => {
    if (reloadTimer !== null) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      void withErrorNotice(() => rosterStore.load(), t('agentRoster.actionFailed'), fail);
    }, ROSTER_RELOAD_DEBOUNCE_MS);
  });
});

onUnmounted(() => {
  if (reloadTimer !== null) {
    clearTimeout(reloadTimer);
    reloadTimer = null;
  }
  rosterOff?.();
  rosterOff = null;
});

function fail(error: unknown): void {
  // `plugin?` (not the narrowed const): a hoisted function declaration is typed
  // before the `if (!plugin) throw` guard narrows it (parity with AgentsPanel).
  plugin?.logger.scope('team-chat').error('roster load failed', error);
}
</script>

<template>
  <div class="specorator-team-roster">
    <div class="specorator-team-roster-title">
      {{ t('teamChat.viewTitle') }}
    </div>
    <div
      v-if="teamChatStore.agents.length === 0"
      class="specorator-team-roster-empty"
    >
      {{ t('teamChat.rosterEmpty') }}
    </div>
    <!-- Read-only in Phase 4a: no @click DM wiring — roster-click → live DM is 4b. -->
    <div
      v-for="agent in teamChatStore.agents"
      :key="agent.id"
      class="specorator-team-roster-row"
    >
      <TeamRosterAvatar
        :agent="agent"
        :size="AVATAR_SIZE"
      />
      <div class="specorator-team-roster-meta">
        <div class="specorator-team-roster-name">
          {{ agent.name }}
        </div>
        <div class="specorator-team-roster-desc">
          {{ agent.description || '—' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.specorator-team-roster {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-2xs);
  padding: var(--sp-space-s);
}
.specorator-team-roster-title {
  font-weight: var(--sp-weight-semibold);
  color: var(--sp-text-muted);
  font-size: var(--sp-font-smaller);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: var(--sp-space-2xs) var(--sp-space-2xs) var(--sp-space-xs);
}
.specorator-team-roster-empty {
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
  padding: var(--sp-space-2xs);
}
.specorator-team-roster-row {
  display: flex;
  align-items: center;
  gap: var(--sp-space-s);
  padding: var(--sp-space-2xs);
  border-radius: var(--sp-radius-s);
}
.specorator-team-roster-meta {
  min-width: 0;
}
.specorator-team-roster-name {
  font-weight: var(--sp-weight-medium);
  color: var(--sp-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.specorator-team-roster-desc {
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
