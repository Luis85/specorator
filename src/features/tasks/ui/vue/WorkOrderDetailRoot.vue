<script setup lang="ts">
import { inject, ref } from 'vue';

import type { WorkOrderSectionUpdate } from '../workOrderEditForm';
import WorkOrderActivity from './components/WorkOrderActivity.vue';
import WorkOrderEditForm from './components/WorkOrderEditForm.vue';
import WorkOrderFooter from './components/WorkOrderFooter.vue';
import WorkOrderMain from './components/WorkOrderMain.vue';
import WorkOrderProperties from './components/WorkOrderProperties.vue';
import { DETAIL_CALLBACKS_KEY, DETAIL_TASK_KEY } from './detailKeys';

// Parity target: the modal's `renderMainPane` + `setEditing` + `commitSections`.
// Mounted by WorkOrderDetailModal into `contentEl` (the modal keeps its shell +
// pinned header imperative); this owns the scrolling body (main + sidebar), the
// footer, and the inline-edit toggle. Task + callbacks arrive via inject from the
// modal (the task is the same raw object the callbacks receive, so `onSaveFields`
// / `onSaveSections` identity is preserved).
const task = inject(DETAIL_TASK_KEY);
const callbacks = inject(DETAIL_CALLBACKS_KEY);
if (!task || !callbacks) throw new Error('WorkOrderDetailRoot mounted without task/callbacks');
const detailTask = task;
const cb = callbacks;

// Inline-edit state for the body sections. The sidebar properties + header title
// stay editable in both modes; this toggle only swaps the main pane between the
// rendered sections and the textarea edit form.
const editing = ref(false);
const editForm = ref<{ collect(): WorkOrderSectionUpdate } | null>(null);

/** Drop `undefined`-valued keys so a partial update merges cleanly (parity). */
function stripUndefined(value: WorkOrderSectionUpdate): WorkOrderSectionUpdate {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as WorkOrderSectionUpdate;
}

async function onSave(): Promise<void> {
  const update = editForm.value?.collect();
  if (!update) return;
  await cb.onSaveSections?.(detailTask, update);
  // Keep the in-memory snapshot current so the re-rendered view reflects the
  // saved bodies (the modal holds its own copy; the board re-index is async).
  Object.assign(detailTask.sections, stripUndefined(update));
  editing.value = false;
}
</script>

<template>
  <div class="specorator-work-order-modal-body">
    <div class="specorator-work-order-modal-main">
      <WorkOrderEditForm
        v-if="editing"
        ref="editForm"
        :task="detailTask"
      />
      <template v-else>
        <WorkOrderMain :task="detailTask" />
        <WorkOrderActivity :task="detailTask" />
      </template>
    </div>
    <div class="specorator-work-order-modal-sidebar">
      <WorkOrderProperties :task="detailTask" />
    </div>
  </div>
  <div class="specorator-work-order-modal-footer">
    <WorkOrderFooter
      :task="detailTask"
      :editing="editing"
      @edit="editing = true"
      @cancel="editing = false"
      @save="onSave"
    />
  </div>
</template>
