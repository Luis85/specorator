<script setup lang="ts">
import { computed } from 'vue';

import { t } from '../../../../../i18n/i18n';
import { isPureAcceptanceChecklist, parseAcceptanceChecklist } from '../../../model/acceptanceChecklist';
import { parseAcceptanceProgress } from '../../../model/acceptanceProgress';
import type { TaskSpec } from '../../../model/taskTypes';
import { mountLucide } from '../mountLucide';
import MarkdownHost from './MarkdownHost.vue';
import SectionHeader from './SectionHeader.vue';

// Parity target: the modal's read-only main pane — Objective / Acceptance (with
// the progress ring + checklist card) / Context / Constraints. All prose renders
// through MarkdownHost so Wikilinks / inline code stay live; an empty section
// shows the em-dash placeholder rather than collapsing.
const props = defineProps<{ task: TaskSpec }>();

const sourcePath = computed(() => props.task.path);
const objective = computed(() => props.task.sections.objective || '—');
const context = computed(() => props.task.sections.context || '—');
const constraints = computed(() => props.task.sections.constraints || '—');

// --- Acceptance criteria ----------------------------------------------------
const acceptanceMarkdown = computed(() => props.task.sections.acceptanceCriteria);
const progress = computed(() => parseAcceptanceProgress(acceptanceMarkdown.value));
const items = computed(() => parseAcceptanceChecklist(acceptanceMarkdown.value));
const isPureChecklist = computed(() => isPureAcceptanceChecklist(acceptanceMarkdown.value));
const acceptanceEmpty = computed(() => acceptanceMarkdown.value.trim().length === 0);

// 22px progress ring geometry (mirrors the design prototype: r=9, 22×22 viewBox,
// 2.5 stroke, rotated -90° so the arc starts at top). The stroke color follows
// the status→color contract in CSS; `--complete` flips it green at 100%.
const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ringVisible = computed(() => progress.value.total > 0);
const ringComplete = computed(() => progress.value.total > 0 && progress.value.done >= progress.value.total);
const dashOffset = computed(() => {
  const ratio = progress.value.total > 0 ? progress.value.done / progress.value.total : 0;
  return CIRCUMFERENCE * (1 - ratio);
});
const ringCount = computed(() => `${progress.value.done}/${progress.value.total}`);
const status = computed(() => props.task.frontmatter.status);
</script>

<template>
  <SectionHeader
    icon="target"
    :label="t('tasks.workOrderModal.sectionObjective')"
  >
    <div class="specorator-work-order-modal-objective">
      <MarkdownHost
        :markdown="objective"
        :source-path="sourcePath"
      />
    </div>
  </SectionHeader>

  <SectionHeader
    icon="list-checks"
    :label="t('tasks.workOrderModal.sectionAcceptance')"
    :with-right="ringVisible"
  >
    <template #right>
      <div class="specorator-work-order-modal-ring-meter">
        <svg
          class="specorator-work-order-modal-ring"
          :class="[
            `specorator-work-order-modal-ring--${status}`,
            { 'specorator-work-order-modal-ring--complete': ringComplete },
          ]"
          width="22"
          height="22"
          viewBox="0 0 22 22"
          aria-hidden="true"
        >
          <circle
            class="specorator-work-order-modal-ring-track"
            cx="11"
            cy="11"
            :r="RADIUS"
            fill="none"
            stroke-width="2.5"
          />
          <circle
            class="specorator-work-order-modal-ring-arc"
            cx="11"
            cy="11"
            :r="RADIUS"
            fill="none"
            stroke-width="2.5"
            stroke-linecap="round"
            :stroke-dasharray="CIRCUMFERENCE"
            :stroke-dashoffset="dashOffset"
            transform="rotate(-90 11 11)"
          />
        </svg>
        <span class="specorator-work-order-modal-ring-count">{{ ringCount }}</span>
      </div>
    </template>

    <!-- Non-pure content (prose, mixed, nested) renders as full markdown so no
      criteria are dropped; an empty section shows the CSS em-dash placeholder. -->
    <template v-if="!isPureChecklist">
      <div
        v-if="acceptanceEmpty"
        class="specorator-work-order-modal-checklist-empty"
      />
      <div
        v-else
        class="specorator-work-order-modal-checklist-prose"
      >
        <MarkdownHost
          :markdown="acceptanceMarkdown"
          :source-path="sourcePath"
        />
      </div>
    </template>
    <div
      v-else
      class="specorator-work-order-modal-checklist"
    >
      <div
        v-for="(item, index) in items"
        :key="index"
        class="specorator-work-order-modal-checklist-item"
        :class="{ 'is-checked': item.checked }"
        role="checkbox"
        :aria-checked="item.checked ? 'true' : 'false'"
        aria-disabled="true"
      >
        <span
          class="specorator-work-order-modal-checklist-box"
          aria-hidden="true"
        >
          <span
            v-if="item.checked"
            :ref="(el) => mountLucide(el, 'check')"
            class="specorator-work-order-modal-checklist-check"
          />
        </span>
        <div class="specorator-work-order-modal-checklist-text">
          <MarkdownHost
            :markdown="item.text"
            :source-path="sourcePath"
          />
        </div>
      </div>
    </div>
  </SectionHeader>

  <SectionHeader
    icon="link"
    :label="t('tasks.workOrderModal.sectionContext')"
  >
    <div class="specorator-work-order-modal-objective">
      <MarkdownHost
        :markdown="context"
        :source-path="sourcePath"
      />
    </div>
  </SectionHeader>

  <SectionHeader
    icon="shield"
    :label="t('tasks.workOrderModal.sectionConstraints')"
  >
    <div class="specorator-work-order-modal-objective">
      <MarkdownHost
        :markdown="constraints"
        :source-path="sourcePath"
      />
    </div>
  </SectionHeader>
</template>
