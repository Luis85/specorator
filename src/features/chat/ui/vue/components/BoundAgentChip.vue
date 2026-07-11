<script setup lang="ts">
import { computed } from 'vue';

import { t } from '../../../../../i18n/i18n';
import { mountIcon } from '../mountIcon';
import type { ChatBoundAgent } from '../stores/chatShellStore';

const props = defineProps<{ agent: ChatBoundAgent }>();

// Mirrors SpecoratorView.syncBoundAgentChip's tooltip/aria-label: the core
// "Chatting with X" message, mirrored into aria-label since `title` is
// unreliable on non-interactive elements.
const chattingWith = computed(() => t('agentRoster.chattingWith', { name: props.agent.name }));
const chipTitle = computed(() => `${chattingWith.value} — ${t('agentRoster.bindingHint')}`);

function avatarHost(el: unknown): void {
  mountIcon(el, 'user');
}
</script>

<template>
  <div
    class="specorator-bound-agent-chip"
    :title="chipTitle"
    :aria-label="chattingWith"
  >
    <div
      class="specorator-bound-agent-chip-avatar"
      aria-hidden="true"
    >
      <img
        v-if="agent.avatar"
        :src="agent.avatar"
        :alt="agent.name"
      >
      <span
        v-else
        :ref="avatarHost"
      />
    </div>
    <span class="specorator-bound-agent-chip-label">{{ agent.name }}</span>
  </div>
</template>
