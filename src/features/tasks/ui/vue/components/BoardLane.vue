<script setup lang="ts">
import { type ComponentPublicInstance, computed, inject, ref } from 'vue';

import { t } from '../../../../../i18n/i18n';
import type { ResolvedLane } from '../../../config/boardConfigTypes';
import { CALLBACKS_KEY } from '../boardKeys';
import { mountLucide } from '../mountLucide';
import { useAgentBoardStore } from '../stores/agentBoardStore';
import WorkOrderCard from './WorkOrderCard.vue';

// One lane column: header + collapse toggle + DoR/DoD criteria + cards + Inbox add-row.
const props = defineProps<{ lane: ResolvedLane }>();

const callbacks = inject(CALLBACKS_KEY);
if (!callbacks) throw new Error('BoardLane mounted without CALLBACKS_KEY');
const cb = callbacks;

const store = useAgentBoardStore();

const collapsed = computed(() => props.lane.collapsible && props.lane.collapsed);
const hasCriteria = computed(
  () => props.lane.definitionOfReady.length > 0 || props.lane.definitionOfDone.length > 0,
);

// DoR/DoD start collapsed behind the header ⓘ toggle — the criteria are static
// reference text, and always-expanded they eat lane height on every board.
// Session-only state (a fresh mount starts collapsed again).
const criteriaOpen = ref(false);
const criteriaId = computed(() => `specorator-lane-criteria-${props.lane.id}`);

// Empty-lane ghost. Suppressed when the whole board is empty (the root's
// first-run hero owns that message) and on the add-row host lane (the dashed
// add affordance already fills the empty space there).
const boardHasTasks = computed(() => store.layout.lanes.some((lane) => lane.tasks.length > 0));
const showEmptyPlaceholder = computed(
  () => props.lane.tasks.length === 0 && !props.lane.hostsNewWorkOrders && boardHasTasks.value,
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
function mountInfo(el: Element | ComponentPublicInstance | null): void {
  mountLucide(el, 'info');
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
        <button
          v-if="hasCriteria"
          :ref="mountInfo"
          class="specorator-agent-board-lane-criteria-toggle"
          :class="{ 'is-open': criteriaOpen }"
          :aria-label="criteriaOpen ? t('tasks.board.laneCriteriaHide') : t('tasks.board.laneCriteriaShow')"
          :title="criteriaOpen ? t('tasks.board.laneCriteriaHide') : t('tasks.board.laneCriteriaShow')"
          :aria-expanded="criteriaOpen ? 'true' : 'false'"
          :aria-controls="criteriaId"
          @click.stop="criteriaOpen = !criteriaOpen"
        />
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
      v-if="hasCriteria && criteriaOpen"
      :id="criteriaId"
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

    <!-- The card list is its own wrapper: list semantics for the focusable
      cards (role=listitem), the TransitionGroup root for enter/leave/FLIP on
      status changes, and the positioning context leave animations need. -->
    <TransitionGroup
      tag="div"
      name="specorator-board-card"
      class="specorator-agent-board-lane-cards"
      role="list"
      :aria-label="props.lane.title"
    >
      <WorkOrderCard
        v-for="task in props.lane.tasks"
        :key="task.frontmatter.id"
        :task="task"
      />
    </TransitionGroup>

    <div
      v-if="showEmptyPlaceholder"
      class="specorator-agent-board-lane-empty"
    >
      {{ t('tasks.board.emptyLane') }}
    </div>

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
