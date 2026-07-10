<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted } from 'vue';

import { t } from '../../../../i18n/i18n';
import type { InvalidTaskNote } from '../../model/taskTypes';
import { PLUGIN_KEY } from './boardKeys';
import BoardLane from './components/BoardLane.vue';
import BoardToolbar from './components/BoardToolbar.vue';
import { useAgentBoardStore } from './stores/agentBoardStore';
import { useBoardEventRouting } from './useBoardEventRouting';

// Parity target: AgentBoardRenderer.render — the board shell. Mounted live by
// AgentBoardView (Task 5b cutover); the imperative renderer was deleted.
const plugin = inject(PLUGIN_KEY);
if (!plugin) throw new Error('AgentBoardRoot mounted without PLUGIN_KEY');

// Owns the EventBus → store routing for this leaf (its own onMounted/onUnmounted).
useBoardEventRouting(plugin);

const store = useAgentBoardStore();
// Bind the plugin + wire the loader once (idempotent), mirroring how the Library
// panels init their store on mount. Safe on the shared singleton store: init()
// no-ops after the first leaf binds it.
store.init(plugin);

// Board freshness clock: the reactive replacement for AgentBoardView's 1s
// `tickElapsed`. The root is the board-lifecycle owner (kept OUT of the pure
// event-routing composable). Live strips read `store.nowMs`, so a tick escalates
// the freshness dot and advances elapsed on a hung run with no new heartbeat. A
// tick re-renders only the (bounded) live strips — the O(1) heartbeat boundary
// is a separate axis a heartbeat never touches.
let clockId: number | null = null;
onMounted(() => {
  // First paint from disk: the board is empty until load() indexes the vault.
  // Fired here (not in setup) so it runs after the routing subscriptions are
  // registered, matching the Library panels' load-on-mount contract. Fire-and-
  // forget: load() already routes index failures into store.error, so the catch
  // only guards the (production-impossible) case of a plugin singleton read
  // throwing — it must never surface as an unhandled rejection.
  void store.load().catch(() => {});
  // Tick once now so a remount paints fresh elapsed rather than the (possibly
  // stale) singleton `nowMs` before the first interval fire.
  store.tick();
  clockId = window.setInterval(() => store.tick(), 1000);
});
onUnmounted(() => {
  if (clockId !== null) window.clearInterval(clockId);
  clockId = null;
});

// "No free slots" hint (parity: AgentBoardRenderer.ts:123-129). Shown at the
// board root when the chat-tab slot count is exhausted — the same
// `free = max(0, max - used)` the toolbar's `--full` badge derives from
// `store.slots`. The toolbar owns the `--full` class; this owns the banner.
// The `max > 0` guard suppresses a one-frame flash: `store.slots` defaults to
// `{used:0, max:0}` before the async on-mount load() populates it, and `0 - 0 <= 0`
// would otherwise paint the banner on first frame. A genuinely-exhausted board
// always has `max > 0`, so this hides nothing legitimate.
const noFreeSlots = computed(
  () => store.slots.max > 0 && Math.max(0, store.slots.max - store.slots.used) <= 0,
);

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
    <div
      v-if="noFreeSlots"
      class="specorator-agent-board-hint"
    >
      {{ t('tasks.board.noFreeSlots') }}
    </div>
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
