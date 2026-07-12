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
</script>

<template>
  <MessageBubble
    v-for="msg in windowed"
    :key="msg.id"
    :msg="msg"
  />
</template>
