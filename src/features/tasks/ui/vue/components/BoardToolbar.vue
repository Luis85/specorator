<script setup lang="ts">
import { type ComponentPublicInstance, computed, inject } from 'vue';

import { t } from '../../../../../i18n/i18n';
import { isRunnableTaskStatus } from '../../../model/taskStateMachine';
import { CALLBACKS_KEY } from '../boardKeys';
import { mountLucide } from '../mountLucide';
import { useAgentBoardStore } from '../stores/agentBoardStore';

// Parity target: AgentBoardRenderer.renderBoardToolbar — the board actions plus
// the auto-run switch + queue/slot counters. Reads the store's toolbar-state
// projection (slots / queueState); the imperative view sources the same values
// from plugin.getTabSlotUsage() + the shared queue control/slot tracker.
const store = useAgentBoardStore();

const callbacks = inject(CALLBACKS_KEY);
if (!callbacks) throw new Error('BoardToolbar mounted without CALLBACKS_KEY');
const cb = callbacks;

// "Run next ready" shows only when a runnable card exists. Reads `store.layout`
// (not the live overlays), so a heartbeat never re-renders the toolbar.
const hasRunnable = computed(() =>
  store.layout.lanes.some((lane) => lane.tasks.some((task) => isRunnableTaskStatus(task.frontmatter.status))),
);

// The whole auto-run/divider/counter block gates on a queue projection, exactly
// as the imperative `if (state.queue)` guards it (null before the first load).
const queue = computed(() => store.queueState);

// ON ⇒ watcher running; a pause OR a halt forces OFF (the watcher cannot
// auto-run while halted), mirroring `renderAutoRunSwitch`'s `!paused && !halted`.
const autoRunOn = computed(() => {
  const q = queue.value;
  return q ? !q.paused && !q.halted : false;
});

const activeCountText = computed(() => {
  const q = queue.value;
  return q ? t('tasks.board.activeCount', { n: q.slotOccupied, m: q.slotCapacity }) : '';
});

// A halt (with reason) takes precedence over the failure streak and suppresses
// it — `renderQueueInfo` returns after the halt caption. Both surface through the
// single `--queue-failure-count` span, so at most one renders.
const failureLabel = computed<string | null>(() => {
  const q = queue.value;
  if (!q) return null;
  if (q.halted && q.haltReason) return t('tasks.board.queueHalted', { reason: q.haltReason });
  if (q.consecutiveFailures > 0) {
    return q.consecutiveFailures === 1
      ? t('tasks.board.failureOne', { n: q.consecutiveFailures })
      : t('tasks.board.failureMany', { n: q.consecutiveFailures });
  }
  return null;
});

const freeSlots = computed(() => Math.max(0, store.slots.max - store.slots.used));
const slotsFull = computed(() => freeSlots.value <= 0);
const tabCountText = computed(() =>
  t('tasks.board.tabCount', { n: store.slots.used, m: store.slots.max, k: freeSlots.value }),
);

function mountPlay(el: Element | ComponentPublicInstance | null): void {
  mountLucide(el, 'play');
}
</script>

<template>
  <div class="specorator-agent-board-toolbar">
    <div class="specorator-agent-board-toolbar-actions">
      <button
        class="specorator-agent-board-toolbar-btn mod-cta"
        @click="cb.onAddWorkOrder()"
      >
        {{ t('tasks.board.addWorkOrderButton') }}
      </button>
      <button
        v-if="hasRunnable"
        class="specorator-agent-board-toolbar-btn specorator-agent-board-toolbar-btn--tool"
        @click="cb.onRunNextReady()"
      >
        <span
          :ref="mountPlay"
          class="specorator-agent-board-toolbar-btn-icon"
          aria-hidden="true"
        />
        <span>{{ t('tasks.board.runNextReady') }}</span>
      </button>
      <template v-if="queue">
        <!-- Divider separates the board actions from the Auto-run switch. -->
        <div class="specorator-agent-board-toolbar-divider" />
        <!-- Native <button role="switch"> activates on click AND Enter/Space (the
             browser synthesizes the click), so one handler covers keyboard use. -->
        <button
          type="button"
          role="switch"
          :class="[
            'specorator-agent-board-toolbar-autorun',
            autoRunOn ? 'specorator-agent-board-toolbar-autorun--on' : 'specorator-agent-board-toolbar-autorun--off',
          ]"
          :aria-checked="autoRunOn ? 'true' : 'false'"
          :title="t('tasks.board.autoRun.tooltip')"
          :aria-label="t('tasks.board.autoRun.tooltip')"
          @click="cb.onToggleAutoRun?.()"
        >
          <span class="specorator-agent-board-toolbar-autorun-track">
            <span
              :class="[
                'specorator-agent-board-toolbar-autorun-thumb',
                { 'specorator-agent-board-toolbar-autorun-thumb--on': autoRunOn },
              ]"
            />
          </span>
          <span class="specorator-agent-board-toolbar-autorun-label">{{ t('tasks.board.autoRun.label') }}</span>
        </button>
      </template>
    </div>
    <div class="specorator-agent-board-toolbar-info">
      <template v-if="queue">
        <span class="specorator-agent-board-toolbar--queue-active-count">
          <!-- Soft-ring dot precedes the accessible "N/M active" caption. -->
          <span
            class="specorator-agent-board-toolbar-active-dot"
            aria-hidden="true"
          />
          <span>{{ activeCountText }}</span>
        </span>
        <span
          v-if="failureLabel"
          class="specorator-agent-board-toolbar--queue-failure-count"
        >{{ failureLabel }}</span>
      </template>
      <span
        :class="['specorator-agent-board-slots', { 'specorator-agent-board-slots--full': slotsFull }]"
      >{{ tabCountText }}</span>
    </div>
  </div>
</template>
