<script setup lang="ts">
import { type ComponentPublicInstance, computed, inject } from 'vue';

import { t } from '../../../../../i18n/i18n';
import { isRunnableTaskStatus } from '../../../model/taskStateMachine';
import { CALLBACKS_KEY } from '../boardKeys';
import { mountLucide } from '../mountLucide';
import { useAgentBoardStore } from '../stores/agentBoardStore';

// Parity target: AgentBoardRenderer.renderBoardToolbar — but only the board
// actions this task owns. The auto-run switch + queue/slot counters (Task 5)
// need queue/slot state the store does not project yet.
const store = useAgentBoardStore();

const callbacks = inject(CALLBACKS_KEY);
if (!callbacks) throw new Error('BoardToolbar mounted without CALLBACKS_KEY');
const cb = callbacks;

// "Run next ready" shows only when a runnable card exists. Reads `store.layout`
// (not the live overlays), so a heartbeat never re-renders the toolbar.
const hasRunnable = computed(() =>
  store.layout.lanes.some((lane) => lane.tasks.some((task) => isRunnableTaskStatus(task.frontmatter.status))),
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
    </div>
    <div class="specorator-agent-board-toolbar-info">
      <!-- Task 5: autorun switch + queue/slot info -->
    </div>
  </div>
</template>
