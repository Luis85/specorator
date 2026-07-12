<script setup lang="ts">
import { computed } from 'vue';

import { formatDurationMmSs } from '../../../../../utils/date';
import { FLAVOR_TEXTS, STREAMING_RESPONSE_LABEL } from '../../../constants';
import { useTranscriptStore } from './stores/transcriptStore';

/**
 * Reproduces `StreamingIndicator.render`'s `.specorator-thinking` DOM
 * (`.specorator-thinking-flavor` label + `.specorator-thinking-hint` timer)
 * as a pure read-model over `store.activeStream`. Display-only: the engine
 * (Task 17) owns the 400ms debounce, the thinking-block-active suppression,
 * and ticking `elapsedSeconds` — this component only ever reflects whatever
 * `activeStream` currently says.
 *
 * Flavor selection diverges from the legacy `Math.random()` pick: `Math.random`
 * is banned in this test lane and would reshuffle the label on every
 * re-render anyway. Instead the flavor index is derived deterministically
 * from `activeStream.messageId` (a stable string hash mod `FLAVOR_TEXTS.length`)
 * so one turn always shows the same phrase across re-renders.
 */
const store = useTranscriptStore();

const visible = computed(() => {
  const s = store.activeStream;
  return s !== null && (s.isThinking || s.isWriting);
});

/** djb2-style string hash — stable across runs/platforms, no RNG. */
function flavorIndexFor(messageId: string): number {
  let hash = 5381;
  for (let i = 0; i < messageId.length; i++) {
    hash = ((hash << 5) + hash + messageId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % FLAVOR_TEXTS.length;
}

const label = computed(() => {
  const s = store.activeStream;
  if (!s) return '';
  // Writing takes precedence over thinking, matching legacy `showWriting`'s relabel.
  if (s.isWriting) return STREAMING_RESPONSE_LABEL;
  // A custom thinking-mode label (e.g. `Compacting...` for `/compact`) overrides
  // the deterministic flavor phrase.
  if (s.label) return s.label;
  return FLAVOR_TEXTS[flavorIndexFor(s.messageId)];
});

const hint = computed(() => {
  const s = store.activeStream;
  if (!s) return '';
  return ` (esc to interrupt · ${formatDurationMmSs(s.elapsedSeconds)})`;
});
</script>

<template>
  <div
    v-if="visible"
    class="specorator-thinking"
  >
    <span class="specorator-thinking-flavor">{{ label }}</span>
    <span class="specorator-thinking-hint">{{ hint }}</span>
  </div>
</template>
