<script setup lang="ts">
import { inject, onMounted, onUnmounted } from 'vue';

import { t } from '../../../../i18n/i18n';
import type { InvalidTaskNote } from '../../model/taskTypes';
import { PLUGIN_KEY } from './boardKeys';
import BoardLane from './components/BoardLane.vue';
import BoardToolbar from './components/BoardToolbar.vue';
import { useAgentBoardStore } from './stores/agentBoardStore';
import { useBoardEventRouting } from './useBoardEventRouting';

// Parity target: AgentBoardRenderer.render — the board shell. Lands unwired; the
// live AgentBoardView still runs the imperative renderer until the Task 5 cutover.
const plugin = inject(PLUGIN_KEY);
if (!plugin) throw new Error('AgentBoardRoot mounted without PLUGIN_KEY');

// Owns the EventBus → store routing for this leaf (its own onMounted/onUnmounted).
useBoardEventRouting(plugin);

const store = useAgentBoardStore();

// Board freshness clock: the reactive replacement for AgentBoardView's 1s
// `tickElapsed`. The root is the board-lifecycle owner (kept OUT of the pure
// event-routing composable). Live strips read `store.nowMs`, so a tick escalates
// the freshness dot and advances elapsed on a hung run with no new heartbeat. A
// tick re-renders only the (bounded) live strips — the O(1) heartbeat boundary
// is a separate axis a heartbeat never touches.
let clockId: number | null = null;
onMounted(() => {
  // Tick once now so a remount paints fresh elapsed rather than the (possibly
  // stale) singleton `nowMs` before the first interval fire.
  store.tick();
  clockId = window.setInterval(() => store.tick(), 1000);
});
onUnmounted(() => {
  if (clockId !== null) window.clearInterval(clockId);
  clockId = null;
});

// Parity with AgentBoardRenderer.truncateErrorLine: cap a long path/stack so one
// error line can't blow out the lane width; the full text stays on the title.
const ERROR_LINE_CAP = 300;
function truncateErrorLine(value: string): string {
  return value.length <= ERROR_LINE_CAP ? value : `${value.slice(0, ERROR_LINE_CAP - 1)}…`;
}

// Parity with renderErrors' skipped-notes line: `<path>: <error>`, truncated for
// display, full text on the title tooltip.
function invalidNoteLine(note: InvalidTaskNote): string {
  return `${note.path}: ${note.error}`;
}
</script>

<template>
  <div class="specorator-agent-board">
    <BoardToolbar />
    <div class="specorator-agent-board-lanes">
      <BoardLane
        v-for="lane in store.layout.lanes"
        :key="lane.id"
        :lane="lane"
      />
    </div>
    <div
      v-if="store.layout.errors.length > 0 || store.invalidNotes.length > 0"
      class="specorator-agent-board-errors"
    >
      <template v-if="store.layout.errors.length > 0">
        <h4>{{ t('tasks.board.boardNotices') }}</h4>
        <div
          v-for="(message, index) in store.layout.errors"
          :key="`err-${index}`"
          :title="message"
        >
          {{ truncateErrorLine(message) }}
        </div>
      </template>
      <template v-if="store.invalidNotes.length > 0">
        <h4>{{ t('tasks.board.skippedNotes') }}</h4>
        <div
          v-for="(note, index) in store.invalidNotes"
          :key="`skip-${index}`"
          :title="invalidNoteLine(note)"
        >
          {{ truncateErrorLine(invalidNoteLine(note)) }}
        </div>
      </template>
    </div>
  </div>
</template>
