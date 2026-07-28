<script setup lang="ts">
import { computed, inject } from 'vue';

import { DEFAULT_CHAT_PROVIDER_ID } from '../../../../../core/providers/types';
import type { ChatMessage } from '../../../../../core/types';
import { shouldRenderToolCall } from './blocks/blockListViewModel';
import MessageBubble from './MessageBubble.vue';
import { CALLBACKS_KEY } from './transcriptKeys';
import { rendersMessageBubble } from './visibleContentHelpers';

/**
 * Mounts the trailing render window over `messages` — the reverse of
 * `MessageRenderer.renderMessages`'s `for (i = start; i < messages.length; i++)`
 * loop. Windowing state (`renderWindowStart`) lives in the parent
 * (`TranscriptRoot`) so both the "load earlier" control and this list read
 * the same source of truth; this component just slices and mounts.
 */
const props = defineProps<{ messages: ChatMessage[]; renderWindowStart: number }>();

const callbacks = inject(CALLBACKS_KEY, undefined);
const providerId = computed(() => callbacks?.getProviderId() ?? DEFAULT_CHAT_PROVIDER_ID);

const windowed = computed(() => props.messages.slice(props.renderWindowStart));

/** Whether this record produces any DOM at all — the same predicate `MessageBubble` branches
 *  on, so the two can never disagree about what the reader actually sees. */
function renders(msg: ChatMessage): boolean {
  return rendersMessageBubble(msg, (toolId) => {
    const toolCall = msg.toolCalls?.find((candidate) => candidate.id === toolId);
    return Boolean(toolCall && shouldRenderToolCall(toolCall, providerId.value));
  });
}

/**
 * Which windowed messages OPEN an assistant run, and so carry the identity header on a
 * surface that supplies one (Team Chat DMs). Consecutive assistant messages group under a
 * single header, matching every DM client and avoiding an avatar wall on a tool-heavy turn.
 *
 * Keyed off VISIBILITY, not `role` alone: restored history can carry an empty assistant
 * boundary record immediately before a real response, and giving the header to a record that
 * renders nothing left the visible response looking like a continuation — anonymous. An
 * invisible record therefore neither opens a run nor breaks one; it is simply not there.
 *
 * Computed against the FULL message list rather than the window: keyed off the window,
 * whichever message happened to sit at the window edge would look like the start of a run
 * and grow a spurious header after every "load earlier". The backward seed walks only as far
 * as the nearest RENDERING message, which is one step except across invisible records.
 */
const runStarts = computed(() => {
  const starts = new Set<string>();
  let runOpen = false;
  for (let i = props.renderWindowStart - 1; i >= 0; i--) {
    const previous = props.messages[i];
    if (!renders(previous)) continue;
    runOpen = previous.role === 'assistant';
    break;
  }
  for (let i = props.renderWindowStart; i < props.messages.length; i++) {
    const msg = props.messages[i];
    if (!renders(msg)) continue;
    if (msg.role !== 'assistant') {
      runOpen = false;
      continue;
    }
    if (!runOpen) {
      starts.add(msg.id);
      runOpen = true;
    }
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
