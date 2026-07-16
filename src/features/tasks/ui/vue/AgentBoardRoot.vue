<script setup lang="ts">
import { type ComponentPublicInstance, computed, inject, onMounted, onUnmounted, provide, ref } from 'vue';

import { t } from '../../../../i18n/i18n';
import { boardWorkOrderFolder } from '../../config/boardWorkOrderFolder';
import type { InvalidTaskNote } from '../../model/taskTypes';
import { CALLBACKS_KEY, FOCUS_CARD_KEY, PLUGIN_KEY } from './boardKeys';
import BoardLane from './components/BoardLane.vue';
import BoardToolbar from './components/BoardToolbar.vue';
import { mountLucide } from './mountLucide';
import { useAgentBoardStore } from './stores/agentBoardStore';
import { useBoardEventRouting } from './useBoardEventRouting';

// The board shell (toolbar + lanes + errors). Mounted by AgentBoardView; owns
// the EventBus→store routing lifecycle via useBoardEventRouting.
const plugin = inject(PLUGIN_KEY);
if (!plugin) throw new Error('AgentBoardRoot mounted without PLUGIN_KEY');

const callbacks = inject(CALLBACKS_KEY);
if (!callbacks) throw new Error('AgentBoardRoot mounted without CALLBACKS_KEY');
const cb = callbacks;

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
  for (const timer of flashTimers.values()) window.clearTimeout(timer);
  flashTimers.clear();
});

// "No free slots" hint. Shown at the board root when the chat-tab slot count is
// exhausted — the same
// `free = max(0, max - used)` the toolbar's `--full` badge derives from
// `store.slots`. The toolbar owns the `--full` class; this owns the banner.
// The `max > 0` guard suppresses a one-frame flash: `store.slots` defaults to
// `{used:0, max:0}` before the async on-mount load() populates it, and `0 - 0 <= 0`
// would otherwise paint the banner on first frame. A genuinely-exhausted board
// always has `max > 0`, so this hides nothing legitimate.
const noFreeSlots = computed(
  () => store.slots.max > 0 && Math.max(0, store.slots.max - store.slots.used) <= 0,
);

// First-run hero: a LOADED layout (lanes exist — the pre-load EMPTY_LAYOUT has
// none) with zero tasks anywhere. Suppressed while loading and on a load error
// (the red errors panel owns that story). Lanes keep rendering below so the
// pipeline stays visible.
const boardEmpty = computed(
  () =>
    !store.loading &&
    !store.error &&
    store.layout.lanes.length > 0 &&
    store.layout.lanes.every((lane) => lane.tasks.length === 0),
);

const workOrderFolder = computed(() => boardWorkOrderFolder(plugin.settings));

function mountEmptyIcon(el: Element | ComponentPublicInstance | null): void {
  mountLucide(el, 'clipboard-list');
}

// ---- attention jump (provided to the toolbar chip) --------------------------
// Scroll a card into view, focus it, and flash an accent ring. DOM-based on
// purpose: the cards live under this root, keyed by data-task-id; smooth scroll
// and the pulse honor prefers-reduced-motion (the CSS side gates the pulse, the
// scroll falls back to an instant jump).
const rootEl = ref<HTMLElement | null>(null);
const ATTENTION_FLASH_MS = 1300;
const flashTimers = new Map<HTMLElement, number>();

function focusCard(taskId: string): void {
  const host = rootEl.value;
  if (!host) return;
  const escaped = taskId.replace(/["\\]/g, '\\$&');
  const card = host.querySelector<HTMLElement>(`.specorator-agent-board-card[data-task-id="${escaped}"]`);
  if (!card) return;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  card.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
  card.focus({ preventScroll: true });
  card.classList.add('is-attention-target');
  const pending = flashTimers.get(card);
  if (pending !== undefined) window.clearTimeout(pending);
  flashTimers.set(
    card,
    window.setTimeout(() => {
      card.classList.remove('is-attention-target');
      flashTimers.delete(card);
    }, ATTENTION_FLASH_MS),
  );
}
provide(FOCUS_CARD_KEY, focusCard);

// Cap a long path/stack so one error line can't blow out the lane width; the
// full text stays on the title attribute.
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
  <div
    ref="rootEl"
    class="specorator-agent-board"
  >
    <BoardToolbar />
    <div
      v-if="noFreeSlots"
      class="specorator-agent-board-hint"
    >
      <span
        :ref="(el) => mountLucide(el, 'alert-triangle')"
        class="specorator-agent-board-hint-icon"
        aria-hidden="true"
      />
      <span>{{ t('tasks.board.noFreeSlots') }}</span>
    </div>
    <div
      v-if="boardEmpty"
      class="specorator-agent-board-empty"
    >
      <span
        :ref="mountEmptyIcon"
        class="specorator-agent-board-empty-icon"
        aria-hidden="true"
      />
      <div class="specorator-agent-board-empty-title">
        {{ t('tasks.board.emptyBoard.title') }}
      </div>
      <div class="specorator-agent-board-empty-body">
        {{ t('tasks.board.emptyBoard.body', { folder: workOrderFolder }) }}
      </div>
      <button
        type="button"
        class="specorator-agent-board-empty-cta mod-cta"
        @click="cb.onAddWorkOrder()"
      >
        {{ t('tasks.board.addWorkOrderButton') }}
      </button>
    </div>
    <div class="specorator-agent-board-lanes">
      <BoardLane
        v-for="lane in store.layout.lanes"
        :key="lane.id"
        :lane="lane"
      />
    </div>
    <div
      v-if="store.error || store.layout.errors.length > 0 || store.invalidNotes.length > 0"
      class="specorator-agent-board-errors"
    >
      <!-- A load() that caught a vault/index failure resolves with store.error set
        but no fresh layout; surface it here so the board doesn't sit silently empty
        or stale. layout.errors (parse warnings) + invalidNotes render below it. -->
      <div
        v-if="store.error"
        class="specorator-agent-board-errors-load"
        :title="store.error"
      >
        {{ t('tasks.board.loadError', { message: truncateErrorLine(store.error) }) }}
      </div>
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
