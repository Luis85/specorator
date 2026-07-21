<script setup lang="ts">
import type { RosterAgent } from '../../../agents/roster/rosterTypes';
import AgentCapsRow from './AgentCapsRow.vue';
import AgentCardActions from './AgentCardActions.vue';
import AvatarSlot from './AvatarSlot.vue';
import LibraryCard from './LibraryCard.vue';

const CARD_AVATAR_SIZE = 36;

defineProps<{ agent: RosterAgent; busy: boolean }>();
const emit = defineEmits<{
  activate: [];
  'start-chat': [];
  clone: [];
  delete: [];
}>();
</script>

<template>
  <!-- eslint-disable vue/attribute-hyphenation -- vue-tsc only resolves the
    REQUIRED ariaLabel prop in camelCase (hyphenated aria-* is typed as a
    native attribute), so lint:fix must not flip it back to aria-label. -->
  <LibraryCard
    class="specorator-vue-agent-card"
    :name="agent.name"
    :ariaLabel="agent.name"
    :busy="busy"
    @activate="emit('activate')"
  >
    <template #leading>
      <AvatarSlot
        :agent="agent"
        :size="CARD_AVATAR_SIZE"
      />
    </template>
    <div class="specorator-vue-agent-card-desc">
      {{ agent.description || '—' }}
    </div>
    <AgentCapsRow :agent="agent" />
    <template #actions>
      <AgentCardActions
        :busy="busy"
        @start-chat="emit('start-chat')"
        @clone="emit('clone')"
        @delete="emit('delete')"
      />
    </template>
  </LibraryCard>
  <!-- eslint-enable vue/attribute-hyphenation -->
</template>

<style scoped>
/* Roster-specific card delta (forked from features/agent-roster.css; the
   legacy roster view was deleted 2026-07-04 — agent-roster.css now only
   serves the embedded AgentDetailEditor). */
.specorator-vue-agent-card-desc {
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
  cursor: text;
}
</style>
