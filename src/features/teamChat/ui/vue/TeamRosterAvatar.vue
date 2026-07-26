<script setup lang="ts">
import { inject, ref, watchEffect } from 'vue';

import { renderAgentAvatar } from '../../../agents/agentAvatar';
import { rosterAgentToPersona } from '../../../agents/personaRegistry';
import type { RosterAgent } from '../../../agents/roster/rosterTypes';
import { PLUGIN_KEY } from './keys';

const props = defineProps<{ agent: RosterAgent; size: number }>();
const host = ref<HTMLElement | null>(null);
// App resolves an image-avatar path to a vault resource URL; without it, image
// avatars fall through to emoji/icon/initials.
const plugin = inject(PLUGIN_KEY, null);

// Runs on mount and whenever the agent prop is replaced by a roster reload —
// avatar edits re-render in place. Mirrors the library AvatarSlot seam but reuses
// the shared renderAgentAvatar/rosterAgentToPersona primitives directly.
watchEffect(() => {
  const el = host.value;
  if (!el) return;
  el.textContent = '';
  renderAgentAvatar(el, rosterAgentToPersona(props.agent), props.size, plugin?.app);
});
</script>

<template>
  <span
    ref="host"
    class="specorator-team-roster-avatar"
    aria-hidden="true"
  />
</template>

<style scoped>
.specorator-team-roster-avatar {
  flex: 0 0 auto;
  display: flex;
}
</style>
