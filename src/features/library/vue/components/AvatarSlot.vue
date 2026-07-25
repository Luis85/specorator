<script setup lang="ts">
import { inject, ref, watchEffect } from 'vue';

import { renderAgentAvatar } from '../../../agents/agentAvatar';
import { rosterAgentToPersona } from '../../../agents/personaRegistry';
import type { RosterAgent } from '../../../agents/roster/rosterTypes';
import { PLUGIN_KEY } from '../libraryKeys';

const props = defineProps<{ agent: RosterAgent; size: number }>();
const host = ref<HTMLElement | null>(null);
// App is needed to resolve an image-avatar path to a vault resource URL; absent
// it, image avatars fall through to emoji/icon/initials at render time.
const plugin = inject(PLUGIN_KEY, null);

// Runs on mount (template ref assignment is reactive) AND whenever the agent
// prop is replaced by a store reload — avatar edits re-render in place.
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
    class="specorator-vue-avatar"
    aria-hidden="true"
  />
</template>

<style scoped>
.specorator-vue-avatar {
  flex: 0 0 auto;
  display: flex;
}
</style>
