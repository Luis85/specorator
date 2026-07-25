<script setup lang="ts">
import { computed, inject } from 'vue';

import { CALLBACKS_KEY } from '../keys';
import { useTeamChatStore } from '../stores/teamChatStore';
import TeamRosterAvatar from '../TeamRosterAvatar.vue';
import EditedFilesStrip from './EditedFilesStrip.vue';

// Identity header for the active DM: the bound agent's avatar + name + a one-line
// voice summary (the `voice` directive `formatBoundAgentPersona` injects), plus
// the files that agent has created/edited this thread. The active agent resolves
// from the store's `agents` + `selectedAgentId` (no dedicated slice needed); the
// files come from the view's per-tab `editedFiles` projection. Self-hides until a
// DM is active (or its agent has left the roster), so the empty-state pane below
// is never double-chromed.
const AVATAR_SIZE = 28;

const store = useTeamChatStore();
const callbacks = inject(CALLBACKS_KEY);

const activeAgent = computed(() =>
  store.selectedAgentId
    ? store.agents.find((agent) => agent.id === store.selectedAgentId)
    : undefined);

// Prefer the explicit voice directive; fall back to the routing description so a
// voice-less agent still gets a one-line subtitle rather than a bare name.
const voiceLine = computed(() =>
  activeAgent.value?.voice?.trim() || activeAgent.value?.description?.trim() || '');

function openEditedFile(path: string): void {
  callbacks?.onOpenEditedFile(path);
}
</script>

<template>
  <div
    v-if="activeAgent"
    class="specorator-team-chat-top-bar"
  >
    <TeamRosterAvatar
      :agent="activeAgent"
      :size="AVATAR_SIZE"
    />
    <div class="specorator-team-chat-top-bar-identity">
      <div class="specorator-team-chat-top-bar-name">
        {{ activeAgent.name }}
      </div>
      <div
        v-if="voiceLine"
        class="specorator-team-chat-top-bar-voice"
        :title="voiceLine"
      >
        {{ voiceLine }}
      </div>
    </div>
    <EditedFilesStrip
      :entries="store.editedFiles"
      :on-open="openEditedFile"
    />
  </div>
</template>

<style scoped>
.specorator-team-chat-top-bar {
  display: flex;
  align-items: center;
  gap: var(--sp-space-s);
  flex-shrink: 0;
  padding: var(--sp-space-xs) var(--sp-space-s);
  border-bottom: 1px solid var(--sp-border);
}
.specorator-team-chat-top-bar-identity {
  flex: 1 1 auto;
  min-width: 0;
}
.specorator-team-chat-top-bar-name {
  font-weight: var(--sp-weight-semibold);
  color: var(--sp-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.specorator-team-chat-top-bar-voice {
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The shared strip's popover opens upward (composer context); in the top bar it
   would clip above the pane, so flip it to open downward here. */
.specorator-team-chat-top-bar :deep(.specorator-edited-files-menu) {
  top: calc(100% + 6px);
  bottom: auto;
}
</style>
