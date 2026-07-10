<script setup lang="ts">
import { ref } from 'vue';

import { t } from '../../../../../i18n/i18n';
import type { TaskSpec } from '../../../model/taskTypes';
import { WORK_ORDER_EDIT_FIELDS, type WorkOrderSectionUpdate } from '../../workOrderEditForm';
import SectionHeader from './SectionHeader.vue';

// Parity target: `renderWorkOrderEditForm` — one raw-markdown textarea per
// editable body section (Objective / Acceptance / Context / Constraints), seeded
// from the task. Save / Cancel live in the footer; the footer's Save reaches
// back through the exposed `collect()` to snapshot every textarea at save time
// (a cleared field persists as an empty section).
const props = defineProps<{ task: TaskSpec }>();

// One editable textarea value per field, seeded from the current section body.
const values = ref<Record<string, string>>(
  Object.fromEntries(WORK_ORDER_EDIT_FIELDS.map((spec) => [spec.key, props.task.sections[spec.key] ?? ''])),
);

function collect(): WorkOrderSectionUpdate {
  const update: WorkOrderSectionUpdate = {};
  for (const spec of WORK_ORDER_EDIT_FIELDS) update[spec.key] = values.value[spec.key];
  return update;
}

defineExpose({ collect });
</script>

<template>
  <div class="specorator-work-order-modal-edit-form">
    <SectionHeader
      v-for="spec in WORK_ORDER_EDIT_FIELDS"
      :key="spec.key"
      :icon="spec.icon"
      :label="t(spec.labelKey)"
    >
      <textarea
        v-model="values[spec.key]"
        class="specorator-work-order-modal-edit-textarea"
        :placeholder="t(spec.placeholderKey)"
        spellcheck="false"
      />
    </SectionHeader>
  </div>
</template>
