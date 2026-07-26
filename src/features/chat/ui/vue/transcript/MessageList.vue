<script setup lang="ts">
import { computed } from 'vue';

import type { ChatMessage } from '../../../../../core/types';
import MessageBubble from './MessageBubble.vue';

/**
 * Mounts the trailing render window over `messages` — the reverse of
 * `MessageRenderer.renderMessages`'s `for (i = start; i < messages.length; i++)`
 * loop. Windowing state (`renderWindowStart`) lives in the parent
 * (`TranscriptRoot`) so both the "load earlier" control and this list read
 * the same source of truth; this component just slices and mounts.
 */
const props = defineProps<{ messages: ChatMessage[]; renderWindowStart: number }>();

const windowed = computed(() => props.messages.slice(props.renderWindowStart));

/**
 * Which windowed messages OPEN an assistant run, and so carry the identity header on a
 * surface that supplies one (Team Chat DMs — see `TranscriptCallbacks.getMessageIdentity`).
 * Consecutive assistant messages group under a single header, matching every DM client
 * and avoiding an avatar wall on a tool-heavy turn.
 *
 * Computed against the FULL message list rather than the window: keyed off the window,
 * whichever message happened to sit at the window edge would look like the start of a run
 * and grow a spurious header after every "load earlier".
 */
const runStarts = computed(() => {
  const starts = new Set<string>();
  for (let i = props.renderWindowStart; i < props.messages.length; i++) {
    const msg = props.messages[i];
    if (msg.role !== 'assistant') continue;
    if (i === 0 || props.messages[i - 1].role !== 'assistant') starts.add(msg.id);
  }
  return starts;
});
</script>

<template>
  <MessageBubble
    v-for="msg in windowed"
    :key="msg.id"
    :msg="msg"
    :starts-run="runStarts.has(msg.id)"
  />
</template>
