<script setup lang="ts">
import { inject, ref, watchEffect } from 'vue';

import { renderAgentAvatar } from '../../../../agents/agentAvatar';
import type { AgentPersona } from '../../../../agents/agentTypes';
import { PLUGIN_KEY } from '../boardKeys';
import { DETAIL_APP_KEY } from '../detailKeys';

// Mirrors the Library's AvatarSlot.vue: mount the imperative `renderAgentAvatar`
// into a template-ref host. `hostClass` lets the caller carry the board's own
// wrapper class (e.g. the footer's `specorator-agent-board-card-assignee`) so
// the mounted `.specorator-agent-avatar` nests exactly as the imperative footer
// builds it.
const props = defineProps<{ persona: AgentPersona; size: number; hostClass?: string }>();
const host = ref<HTMLElement | null>(null);
// Image avatars need vault access to resolve their path. This component renders
// both on the board (board PLUGIN_KEY) and inside the work-order detail modal
// (DETAIL_APP_KEY); resolve App from whichever seam provided it, else fall
// through to emoji/icon/initials.
const plugin = inject(PLUGIN_KEY, null);
const detailApp = inject(DETAIL_APP_KEY, null);
const app = plugin?.app ?? detailApp ?? undefined;

watchEffect(() => {
  const el = host.value;
  if (!el) return;
  el.textContent = '';
  renderAgentAvatar(el, props.persona, props.size, app);
});
</script>

<template>
  <span
    ref="host"
    :class="props.hostClass"
  />
</template>
