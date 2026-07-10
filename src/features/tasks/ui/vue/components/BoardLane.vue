<script setup lang="ts">
import { type ComponentPublicInstance, computed, inject } from 'vue';

import { t } from '../../../../../i18n/i18n';
import type { ResolvedLane } from '../../../config/boardConfigTypes';
import { CALLBACKS_KEY } from '../boardKeys';
import { mountLucide } from '../mountLucide';
import WorkOrderCard from './WorkOrderCard.vue';

// Parity target: AgentBoardRenderer.renderLane / renderCollapsedLane / renderCriteria.
const props = defineProps<{ lane: ResolvedLane }>();

const callbacks = inject(CALLBACKS_KEY);
if (!callbacks) throw new Error('BoardLane mounted without CALLBACKS_KEY');
const cb = callbacks;

const collapsed = computed(() => props.lane.collapsible && props.lane.collapsed);
const hasCriteria = computed(
  () => props.lane.definitionOfReady.length > 0 || props.lane.definitionOfDone.length > 0,
);

function toggle(): void {
  cb.onToggleLaneCollapse(props.lane.id);
}

// Enter / Space activate the collapsed strip's toggle (native role="button"
// semantics), mirroring the imperative keydown handler.
function onCollapsedKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggle();
  }
}

function mountChevronRight(el: Element | ComponentPublicInstance | null): void {
  mountLucide(el, 'chevron-right');
}
function mountChevronDown(el: Element | ComponentPublicInstance | null): void {
  mountLucide(el, 'chevron-down');
}
</script>

<template>
  <div
    v-if="collapsed"
    class="specorator-agent-board-lane specorator-agent-board-lane--collapsed"
    role="button"
    tabindex="0"
    :aria-label="t('tasks.board.expandLane', { title: props.lane.title })"
    aria-expanded="false"
    @click="toggle"
    @keydown="onCollapsedKeydown"
  >
    <span
      :ref="mountChevronRight"
      class="specorator-agent-board-lane-collapsed-chevron"
      aria-hidden="true"
    />
    <span class="specorator-agent-board-lane-title-vertical">{{ props.lane.title }}</span>
    <span class="specorator-agent-board-lane-count">{{ props.lane.tasks.length }}</span>
  </div>

  <div
    v-else
    class="specorator-agent-board-lane"
  >
    <div class="specorator-agent-board-lane-header">
      <span class="specorator-agent-board-lane-title">{{ props.lane.title }}</span>
      <div class="specorator-agent-board-lane-header-meta">
        <span class="specorator-agent-board-lane-count">{{ props.lane.tasks.length }}</span>
        <button
          v-if="props.lane.collapsible"
          :ref="mountChevronDown"
          class="specorator-agent-board-lane-collapse-toggle"
          :aria-label="t('tasks.board.collapseLane')"
          aria-expanded="true"
          @click.stop="toggle"
        />
      </div>
    </div>

    <div
      v-if="hasCriteria"
      class="specorator-agent-board-lane-criteria"
    >
      <template v-if="props.lane.definitionOfReady.length > 0">
        <div class="specorator-agent-board-lane-criteria-label">
          {{ t('tasks.board.readyWhen') }}
        </div>
        <ul>
          <li
            v-for="(item, index) in props.lane.definitionOfReady"
            :key="`dor-${index}`"
          >
            {{ item }}
          </li>
        </ul>
      </template>
      <template v-if="props.lane.definitionOfDone.length > 0">
        <div class="specorator-agent-board-lane-criteria-label">
          {{ t('tasks.board.doneWhen') }}
        </div>
        <ul>
          <li
            v-for="(item, index) in props.lane.definitionOfDone"
            :key="`dod-${index}`"
          >
            {{ item }}
          </li>
        </ul>
      </template>
    </div>

    <WorkOrderCard
      v-for="task in props.lane.tasks"
      :key="task.frontmatter.id"
      :task="task"
    />

    <!-- The dashed add row belongs only to the single lane the resolver flags as
      hosting new (inbox-status) work orders. -->
    <button
      v-if="props.lane.hostsNewWorkOrders"
      class="specorator-agent-board-lane-add"
      @click.stop="cb.onAddWorkOrder()"
    >
      {{ t('tasks.board.addWorkOrder') }}
    </button>
  </div>
</template>
