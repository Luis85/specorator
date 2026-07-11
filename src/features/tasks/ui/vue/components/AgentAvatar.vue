<script setup lang="ts">
import { ref, watchEffect } from 'vue';

import { renderAgentAvatar } from '../../../../agents/agentAvatar';
import type { AgentPersona } from '../../../../agents/agentTypes';

// Mirrors the Library's AvatarSlot.vue: mount the imperative `renderAgentAvatar`
// into a template-ref host. `hostClass` lets the caller carry the board's own
// wrapper class (e.g. the footer's `specorator-agent-board-card-assignee`) so
// the mounted `.specorator-agent-avatar` nests exactly as the imperative footer
// builds it.
const props = defineProps<{ persona: AgentPersona; size: number; hostClass?: string }>();
const host = ref<HTMLElement | null>(null);

watchEffect(() => {
  const el = host.value;
  if (!el) return;
  el.textContent = '';
  renderAgentAvatar(el, props.persona, props.size);
});
</script>

<template>
  <span
    ref="host"
    :class="props.hostClass"
  />
</template>
