<script setup lang="ts">
import { computed, inject } from 'vue';

import { t } from '../../../../../i18n/i18n';
import type { TaskSpec, TaskStatus } from '../../../model/taskTypes';
import { type FooterAction, footerActionsForStatus } from '../../workOrderFooterActions';
import { DETAIL_CALLBACKS_KEY, DETAIL_CLOSE_KEY } from '../detailKeys';
import { mountLucide } from '../mountLucide';

// Parity target: `renderWorkOrderFooter` — secondary (ghost) actions group left,
// the primary group (CTA / danger) right. Status actions close the modal first
// then run (close-on-click); the inline Edit / Cancel / Save affordances toggle
// in place and emit up to the root (which owns the edit form). While editing the
// status-specific right-side primary is suppressed.
const props = defineProps<{ task: TaskSpec; editing: boolean }>();
const emit = defineEmits<{ (event: 'edit' | 'cancel' | 'save'): void }>();

const callbacks = inject(DETAIL_CALLBACKS_KEY);
if (!callbacks) throw new Error('WorkOrderFooter mounted without DETAIL_CALLBACKS_KEY');
const cb = callbacks;
const close = inject(DETAIL_CLOSE_KEY) ?? (() => undefined);

// The editable statuses (inbox / ready / needs_fix) carry the inline edit
// affordances; every other status hides them (parity: `ctx.editable`).
const EDITABLE_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>(['inbox', 'ready', 'needs_fix']);
const editable = computed(() => EDITABLE_STATUSES.has(props.task.frontmatter.status));

const actions = computed(() => footerActionsForStatus(props.task, cb));
// While editing, the right-side primary is suppressed (Cancel + Save take over).
const leftActions = computed(() => actions.value.filter((a) => a.side === 'left'));
const rightActions = computed(() =>
  props.editing ? [] : actions.value.filter((a) => a.side === 'right'),
);

// Status actions close the modal, then run (close-on-click preserved).
function runStatusAction(action: FooterAction): void {
  close();
  action.run();
}
</script>

<template>
  <div class="specorator-work-order-modal-footer-group specorator-work-order-modal-footer-group--left">
    <button
      v-for="(action, index) in leftActions"
      :key="`left-${index}`"
      type="button"
      class="specorator-work-order-modal-action"
      :class="`specorator-work-order-modal-action--${action.variant}`"
      @click="runStatusAction(action)"
    >
      <span
        :ref="(el) => mountLucide(el, action.icon)"
        class="specorator-work-order-modal-action-icon"
        aria-hidden="true"
      />
      <span class="specorator-work-order-modal-action-label">{{ t(action.labelKey) }}</span>
    </button>

    <!-- Inline edit affordances sit beside Open note in the left group. -->
    <template v-if="editable && editing">
      <button
        type="button"
        class="specorator-work-order-modal-action specorator-work-order-modal-action--ghost"
        @click="emit('cancel')"
      >
        <span
          :ref="(el) => mountLucide(el, 'x')"
          class="specorator-work-order-modal-action-icon"
          aria-hidden="true"
        />
        <span class="specorator-work-order-modal-action-label">{{ t('tasks.workOrderModal.actionCancelEdit') }}</span>
      </button>
      <button
        type="button"
        class="specorator-work-order-modal-action specorator-work-order-modal-action--cta"
        @click="emit('save')"
      >
        <span
          :ref="(el) => mountLucide(el, 'check')"
          class="specorator-work-order-modal-action-icon"
          aria-hidden="true"
        />
        <span class="specorator-work-order-modal-action-label">{{ t('tasks.workOrderModal.actionSaveSections') }}</span>
      </button>
    </template>
    <button
      v-else-if="editable"
      type="button"
      class="specorator-work-order-modal-action specorator-work-order-modal-action--ghost"
      @click="emit('edit')"
    >
      <span
        :ref="(el) => mountLucide(el, 'pencil')"
        class="specorator-work-order-modal-action-icon"
        aria-hidden="true"
      />
      <span class="specorator-work-order-modal-action-label">{{ t('tasks.workOrderModal.actionEdit') }}</span>
    </button>
  </div>

  <div class="specorator-work-order-modal-footer-group specorator-work-order-modal-footer-group--right">
    <button
      v-for="(action, index) in rightActions"
      :key="`right-${index}`"
      type="button"
      class="specorator-work-order-modal-action"
      :class="`specorator-work-order-modal-action--${action.variant}`"
      @click="runStatusAction(action)"
    >
      <span
        :ref="(el) => mountLucide(el, action.icon)"
        class="specorator-work-order-modal-action-icon"
        aria-hidden="true"
      />
      <span class="specorator-work-order-modal-action-label">{{ t(action.labelKey) }}</span>
    </button>
  </div>
</template>
