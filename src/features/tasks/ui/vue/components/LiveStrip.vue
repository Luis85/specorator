<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';

import { t } from '../../../../../i18n/i18n';
import type { TaskSpec } from '../../../model/taskTypes';
import {
  computeLiveStrip,
  formatElapsed,
  type LiveStripPatch,
  staleAriaLabel,
  staleGlyph,
  staleTier,
} from '../../agentBoardLiveHeartbeat';
import { useAgentBoardStore } from '../stores/agentBoardStore';

// The live heartbeat/ledger strip. Only mounted for live statuses (running /
// needs_input / needs_approval); the card gates rendering.
const props = defineProps<{ task: TaskSpec }>();

const store = useAgentBoardStore();

// Resolved per-task reads. The heartbeat prefers the live overlay tick over the
// work order's (transition-only) frontmatter heartbeat; the ledger prefers the
// live overlay line and otherwise falls back inside computeLiveStrip.
function heartbeatSource(): string | null {
  return store.liveHeartbeats.get(props.task.frontmatter.id) ?? props.task.frontmatter.heartbeat ?? null;
}
function ledgerOverride(): string | undefined {
  return store.liveLedger.get(props.task.frontmatter.id);
}

const patch = shallowRef<LiveStripPatch>(
  computeLiveStrip(props.task, heartbeatSource(), ledgerOverride(), store.nowMs),
);

// Recompute on THIS task's heartbeat/ledger/task change AND on a board-clock
// tick (`store.nowMs`). The clock is what escalates the freshness dot + advances
// elapsed on a hung run with no new heartbeat.
//
// PERF BOUNDARY: a `recordHeartbeat` for ANOTHER task replaces the whole
// heartbeat map but leaves this task's resolved heartbeat/ledger primitives (and
// `nowMs`) identical, so the watch does NOT fire — this strip's `patch` and
// render stay put, keeping a heartbeat O(1) in the number of live cards. The 1s
// tick DOES fire every live strip; that bounded, per-second repaint is the
// correct separate axis (parity with the imperative tickElapsed).
watch([heartbeatSource, ledgerOverride, () => props.task, () => store.nowMs], () => {
  patch.value = computeLiveStrip(props.task, heartbeatSource(), ledgerOverride(), store.nowMs);
});

const tier = computed(() => staleTier(patch.value.heartbeatAgeMs));
const dotClass = computed(() => `specorator-agent-board-card-live-strip--dot specorator-stale-${tier.value}`);
const dotGlyph = computed(() => staleGlyph(tier.value));
const dotAria = computed(() => staleAriaLabel(tier.value, patch.value.heartbeatAgeMs));
const caption = computed(() =>
  t('tasks.board.card.liveStrip.attempt', {
    elapsed: formatElapsed(patch.value.elapsedMs),
    attempt: patch.value.attemptNumber,
  }),
);
const ledgerText = computed(() => patch.value.lastLedger ?? t('tasks.board.card.liveStrip.starting'));
</script>

<template>
  <div class="specorator-agent-board-card-live-strip">
    <div class="specorator-agent-board-card-live-strip--meta">
      <span
        :class="dotClass"
        :aria-label="dotAria"
      >{{ dotGlyph }}</span>
      <span class="specorator-agent-board-card-live-strip--caption">{{ caption }}</span>
    </div>
    <div class="specorator-agent-board-card-live-strip--ledger">
      {{ ledgerText }}
    </div>
  </div>
</template>
