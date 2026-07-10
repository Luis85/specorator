<script setup lang="ts">
import { computed, inject, ref } from 'vue';

import { t } from '../../../../../i18n/i18n';
import { formatDateTime } from '../../../../../utils/date';
import { resolvePersona } from '../../../../agents/personaRegistry';
import type { TaskPriority, TaskSpec, TaskStatus } from '../../../model/taskTypes';
import { DETAIL_CALLBACKS_KEY } from '../detailKeys';
import { mountLucide } from '../mountLucide';
import AgentAvatar from './AgentAvatar.vue';
import EditableChip from './EditableChip.vue';
import PropertyRow from './PropertyRow.vue';

// Parity target: `renderWorkOrderProperties` — the right-pane properties sidebar
// (status pill + editable agent/provider/model/loop/priority chips +
// created/updated/attempts + conversation link). Local refs mirror the
// imperative "update the chip in place" flow: a change persists through
// `onSaveFields`/`onPickLoop` AND updates the visible value without a reload.
const props = defineProps<{ task: TaskSpec }>();

const callbacks = inject(DETAIL_CALLBACKS_KEY);
if (!callbacks) throw new Error('WorkOrderProperties mounted without DETAIL_CALLBACKS_KEY');
const cb = callbacks;

const PRIORITY_OPTIONS: TaskPriority[] = ['0 - urgent', '1 - high', '2 - normal', '3 - low'];
// Editable-status sets mirror the imperative panel: Agent + Loop lock past the
// pre-run states; Provider / Model / Priority stay editable until the run starts.
const EDITABLE_ASSIGN_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>(['inbox', 'ready', 'needs_fix']);
// Avatar diameter (px) for the modal Agent property value.
const AGENT_AVATAR_SIZE = 18;
// Numeric level (`--0..3`) + filled-bar counts for the read-only priority meter.
const PRIORITY_LEVEL: Record<TaskPriority, number> = {
  '0 - urgent': 0,
  '1 - high': 1,
  '2 - normal': 2,
  '3 - low': 3,
};
const PRIORITY_FILLED_BARS: Record<TaskPriority, number> = {
  '0 - urgent': 3,
  '1 - high': 3,
  '2 - normal': 2,
  '3 - low': 1,
};

const fm = computed(() => props.task.frontmatter);
const status = computed(() => fm.value.status);
// Provider / Model / Priority + Conversation edit-gate: anything but a live run.
const editable = computed(() => status.value !== 'running');
const assignEditable = computed(() => EDITABLE_ASSIGN_STATUSES.has(status.value));

// --- Agent ------------------------------------------------------------------
const resolve = (id?: string) => (cb.resolvePersona ?? resolvePersona)(id);
const agentOptions = computed(() => cb.getAgentOptions());
// Prefer the raw agent id when it exists in the options (covers roster ids like
// "roster:foo"); otherwise fall back to the resolved persona id.
const initialAgentValue = (): string => {
  const agentId = fm.value.agent;
  return agentOptions.value.some((o) => o.value === agentId) ? (agentId ?? resolve(agentId).id) : resolve(agentId).id;
};
const selectedAgent = ref(initialAgentValue());
const chipPersona = computed(() => resolve(selectedAgent.value));
function onAgentChange(value: string): void {
  selectedAgent.value = value;
  void cb.onSaveFields?.(props.task, { agent: value });
}
// Static (non-editable) presentation.
const staticPersona = computed(() => resolve(fm.value.agent));
const staticAgentName = computed(() => {
  const agentId = fm.value.agent;
  if (agentId?.startsWith('roster:')) {
    return agentOptions.value.find((o) => o.value === agentId)?.label ?? staticPersona.value.name;
  }
  return staticPersona.value.name;
});

// --- Provider / Model -------------------------------------------------------
const selectedProvider = ref(fm.value.provider ?? '');
const selectedModel = ref(fm.value.model ?? '');
const providerOptions = computed(() => cb.getProviderOptions());
const modelOptions = computed(() => cb.getModelOptions(selectedProvider.value));
const modelEmptyOption = { value: '', label: 'Provider default' };
function onProviderChange(value: string): void {
  selectedProvider.value = value;
  // Provider change resets Model to the provider default (parity: `{ model: '' }`).
  selectedModel.value = '';
  void cb.onSaveFields?.(props.task, { provider: value, model: '' });
}
function onModelChange(value: string): void {
  selectedModel.value = value;
  void cb.onSaveFields?.(props.task, { model: value });
}

// --- Loop -------------------------------------------------------------------
const loopSlug = ref<string | undefined>(fm.value.loop);
const loopLabel = computed(() => cb.getLoopName?.(loopSlug.value) ?? t('tasks.workOrderModal.loopNone'));
function pickLoop(): void {
  void (async () => {
    const picked = await cb.onPickLoop?.(props.task);
    if (picked === undefined) return;
    // Reflect the picked slug back into the note snapshot + the chip label (the
    // custom chip is not a native select, so it needs an explicit update). The
    // task is the modal's live in-memory snapshot (shared by reference with the
    // callbacks), so a re-pick this session reads the current loop — parity with
    // the imperative panel's `task.frontmatter.loop = picked` sync.
    // eslint-disable-next-line vue/no-mutating-props -- intentional shared-snapshot sync (see above)
    props.task.frontmatter.loop = picked || undefined;
    loopSlug.value = picked || undefined;
  })();
}
function onLoopKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') {
    if (event.key === ' ') event.preventDefault();
    pickLoop();
  }
}

// --- Priority ---------------------------------------------------------------
const selectedPriority = ref<TaskPriority>(fm.value.priority);
const priorityOptions = computed(() => PRIORITY_OPTIONS.map((p) => ({ value: p, label: p })));
function onPriorityChange(value: string): void {
  selectedPriority.value = value as TaskPriority;
  void cb.onSaveFields?.(props.task, { priority: value as TaskPriority });
}
const priorityBars = computed(() => {
  const filled = PRIORITY_FILLED_BARS[fm.value.priority];
  return [0, 1, 2].map((i) => i < filled);
});

// --- Meta + Conversation ----------------------------------------------------
const conversationVisible = computed(
  () =>
    Boolean(fm.value.conversation_id) &&
    Boolean(cb.onOpenConversation) &&
    (cb.canOpenConversation?.(props.task) ?? true),
);
function openConversation(): void {
  cb.onOpenConversation?.(props.task);
}
</script>

<template>
  <div class="specorator-work-order-modal-properties">
    <div class="specorator-work-order-modal-properties-head">
      {{ t('tasks.workOrderModal.properties') }}
    </div>

    <PropertyRow
      prop-key="status"
      icon="circle-dot"
      :label="t('tasks.workOrderModal.fieldStatus')"
    >
      <span
        class="specorator-work-order-modal-status-pill"
        :class="`specorator-work-order-modal-status-pill--${status}`"
        :title="status"
      >
        <span class="specorator-work-order-modal-status-dot" />
        <span class="specorator-work-order-modal-status-label">{{ status }}</span>
      </span>
    </PropertyRow>

    <PropertyRow
      prop-key="agent"
      icon="user"
      :label="t('tasks.workOrderModal.fieldAgent')"
    >
      <EditableChip
        v-if="assignEditable"
        class="specorator-work-order-modal-chip--agent"
        :model-value="selectedAgent"
        :options="agentOptions"
        @change="onAgentChange"
      >
        <template #lead>
          <AgentAvatar
            :persona="chipPersona"
            :size="AGENT_AVATAR_SIZE"
          />
        </template>
      </EditableChip>
      <span
        v-else
        class="specorator-work-order-modal-agent"
      >
        <AgentAvatar
          :persona="staticPersona"
          :size="AGENT_AVATAR_SIZE"
        />
        <span class="specorator-work-order-modal-agent-name">{{ staticAgentName }}</span>
      </span>
    </PropertyRow>

    <PropertyRow
      prop-key="provider"
      icon="cpu"
      :label="t('tasks.workOrderModal.fieldProvider')"
    >
      <EditableChip
        v-if="editable"
        :model-value="selectedProvider"
        :options="providerOptions"
        @change="onProviderChange"
      />
      <span
        v-else
        class="specorator-work-order-modal-prop-inner specorator-work-order-modal-mono"
      >{{ fm.provider ?? '—' }}</span>
    </PropertyRow>

    <PropertyRow
      prop-key="model"
      icon="sparkles"
      :label="t('tasks.workOrderModal.fieldModel')"
    >
      <EditableChip
        v-if="editable"
        :model-value="selectedModel"
        :options="modelOptions"
        :empty-option="modelEmptyOption"
        @change="onModelChange"
      />
      <span
        v-else
        class="specorator-work-order-modal-prop-inner"
      >{{ fm.model ?? '—' }}</span>
    </PropertyRow>

    <PropertyRow
      prop-key="loop"
      icon="repeat"
      :label="t('tasks.workOrderModal.fieldLoop')"
    >
      <span
        v-if="assignEditable"
        class="specorator-work-order-modal-chip specorator-work-order-modal-chip--loop"
        role="button"
        tabindex="0"
        @click="pickLoop"
        @keydown="onLoopKeydown"
      >
        <span class="specorator-work-order-modal-chip-value">{{ loopLabel }}</span>
        <span
          :ref="(el) => mountLucide(el, 'chevron-down')"
          class="specorator-work-order-modal-chip-caret"
        />
      </span>
      <span
        v-else
        class="specorator-work-order-modal-loop"
      >{{ loopLabel }}</span>
    </PropertyRow>

    <PropertyRow
      prop-key="priority"
      icon="signal"
      :label="t('tasks.workOrderModal.fieldPriority')"
    >
      <EditableChip
        v-if="editable"
        :model-value="selectedPriority"
        :options="priorityOptions"
        @change="onPriorityChange"
      />
      <span
        v-else
        class="specorator-work-order-modal-prop-inner specorator-work-order-modal-priority"
        :class="`specorator-work-order-modal-priority--${PRIORITY_LEVEL[fm.priority]}`"
      >
        <span
          class="specorator-work-order-modal-priority-bars"
          aria-hidden="true"
        >
          <i
            v-for="(barFilled, index) in priorityBars"
            :key="index"
            :class="{ 'is-filled': barFilled }"
          />
        </span>
        <span class="specorator-work-order-modal-priority-label">{{ fm.priority }}</span>
      </span>
    </PropertyRow>

    <div class="specorator-work-order-modal-properties-divider" />

    <PropertyRow
      prop-key="created"
      icon="calendar"
      :label="t('tasks.workOrderModal.fieldCreated')"
    >
      <span class="specorator-work-order-modal-prop-inner specorator-work-order-modal-prop-num">
        {{ formatDateTime(fm.created) }}
      </span>
    </PropertyRow>

    <PropertyRow
      prop-key="updated"
      icon="clock"
      :label="t('tasks.workOrderModal.fieldUpdated')"
    >
      <span class="specorator-work-order-modal-prop-inner specorator-work-order-modal-prop-num">
        {{ formatDateTime(fm.updated) }}
      </span>
    </PropertyRow>

    <PropertyRow
      prop-key="attempts"
      icon="repeat"
      :label="t('tasks.workOrderModal.fieldAttempts')"
    >
      <span class="specorator-work-order-modal-prop-inner specorator-work-order-modal-prop-num">
        {{ String(fm.attempts) }}
      </span>
    </PropertyRow>

    <PropertyRow
      v-if="conversationVisible"
      prop-key="conversation"
      icon="message-square"
      :label="t('tasks.workOrderModal.fieldConversation')"
    >
      <a
        class="specorator-work-order-modal-prop-link"
        href="#"
        @click.prevent="openConversation"
      >{{ fm.conversation_id }}</a>
    </PropertyRow>
  </div>
</template>
