<script setup lang="ts">
import { computed, inject, ref, watchEffect } from 'vue';

import { t } from '../../../../../i18n/i18n';
import { renderAgentAvatar } from '../../../../agents/agentAvatar';
import { PLUGIN_KEY } from '../chatShellKeys';
import type { ChatBoundAgent } from '../stores/chatShellStore';

const props = defineProps<{ agent: ChatBoundAgent }>();
// App resolves an image-avatar path to a vault resource URL; without it the chip
// falls through to the persona's emoji/icon/initials.
const plugin = inject(PLUGIN_KEY, null);

// Mirrors SpecoratorView.syncBoundAgentChip's tooltip/aria-label: the core
// "Chatting with X" message, mirrored into aria-label since `title` is
// unreliable on non-interactive elements.
const chattingWith = computed(() => t('agentRoster.chattingWith', { name: props.agent.name }));
const chipTitle = computed(() => `${chattingWith.value} — ${t('agentRoster.bindingHint')}`);

// Mount the imperative persona avatar into a template-ref host — same pattern as
// the board's AgentAvatar.vue. renderAgentAvatar builds the colored
// .specorator-agent-avatar (icon/initials from the persona) at 18px, matching
// syncBoundAgentChip's renderAgentAvatar(el, persona, 18).
const avatarHost = ref<HTMLElement | null>(null);
watchEffect(() => {
  const el = avatarHost.value;
  if (!el) return;
  el.textContent = '';
  renderAgentAvatar(el, props.agent.persona, 18, plugin?.app);
});
</script>

<template>
  <div
    class="specorator-bound-agent-chip"
    :title="chipTitle"
    :aria-label="chattingWith"
  >
    <div
      ref="avatarHost"
      class="specorator-bound-agent-chip-avatar"
      aria-hidden="true"
    />
    <span class="specorator-bound-agent-chip-label">{{ agent.name }}</span>
  </div>
</template>
