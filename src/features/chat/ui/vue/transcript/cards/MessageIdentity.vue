<script setup lang="ts">
import { inject, ref, watchEffect } from 'vue';

import { renderAgentAvatar } from '../../../../../agents/agentAvatar';
import type { AgentPersona } from '../../../../../agents/agentTypes';
import { APP_KEY } from '../transcriptKeys';

/**
 * "From: <agent>" header above the first assistant message of a run, rendered ONLY on a
 * surface that supplies an identity (Team Chat DMs — see `TranscriptCallbacks.getMessageIdentity`).
 *
 * Additive to the message shell: it introduces `.specorator-message-identity` and touches
 * none of the classes the four still-imperative transcript consumers query
 * (`NavigationController`'s `.specorator-message-user` + `offsetTop` scan, the selection
 * controllers, `ChatDropController`, `StreamController`'s scroll host).
 */
const AVATAR_SIZE = 20;

// Nullable by design: the caller passes the identity straight through and this component
// decides whether there is anything to show, keeping the branch out of MessageBubble's
// template (which every message renders).
const props = defineProps<{ persona: AgentPersona | null }>();

const host = ref<HTMLElement | null>(null);
// App resolves an image-avatar path to a vault resource URL; without it, image
// avatars fall through to emoji/icon/initials (renderAgentAvatar's own chain).
const app = inject(APP_KEY, undefined);

// Re-renders in place when the persona is replaced by a roster edit, matching
// TeamRosterAvatar's seam.
watchEffect(() => {
  const el = host.value;
  const persona = props.persona;
  if (!el || !persona) return;
  el.textContent = '';
  renderAgentAvatar(el, persona, AVATAR_SIZE, app);
});
</script>

<template>
  <div
    v-if="props.persona"
    class="specorator-message-identity"
  >
    <span
      ref="host"
      class="specorator-message-identity-avatar"
      aria-hidden="true"
    />
    <span class="specorator-message-identity-name">{{ props.persona.name }}</span>
  </div>
</template>

<style scoped>
.specorator-message-identity {
  display: flex;
  align-items: center;
  gap: var(--size-4-1);
  margin-bottom: var(--size-2-2);
}
.specorator-message-identity-avatar {
  flex: 0 0 auto;
  display: flex;
}
.specorator-message-identity-name {
  font-size: var(--font-ui-smaller);
  font-weight: var(--font-semibold);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
