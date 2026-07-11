<script setup lang="ts">
import { Notice } from 'obsidian';
import { computed, inject, onMounted, ref } from 'vue';

import { asSettingsBag } from '../../../../core/types/settings';
import { t } from '../../../../i18n/i18n';
import {
  buildTemplatePayload,
  createInitialForm,
  loadAgentOptions,
  loadLoopOptions,
  modelOptionList,
  PRIORITY_OPTIONS,
  providerOptionList,
  type TemplateEditorOption,
} from '../workOrderTemplateEditorForm';
import LucideIconField from './components/LucideIconField.vue';
import TemplateEditorRow from './components/TemplateEditorRow.vue';
import {
  TEMPLATE_EDITOR_CLOSE_KEY,
  TEMPLATE_EDITOR_EXISTING_KEY,
  TEMPLATE_EDITOR_PLUGIN_KEY,
  TEMPLATE_EDITOR_SAVE_KEY,
} from './templateEditorKeys';

// Vue port of the imperative `WorkOrderTemplateEditorModal.onOpen`: the whole
// create/edit form (name/description/icon/provider/model/priority/loop/agent/
// body) plus the save flow. The modal shell keeps the ctor + `.open()` and only
// provides `plugin`/`existing`/`onSave`/`close` through the inject keys.
const plugin = inject(TEMPLATE_EDITOR_PLUGIN_KEY);
const existing = inject(TEMPLATE_EDITOR_EXISTING_KEY, null);
const onSave = inject(TEMPLATE_EDITOR_SAVE_KEY);
const close = inject(TEMPLATE_EDITOR_CLOSE_KEY);
if (!plugin || !onSave || !close) {
  throw new Error('WorkOrderTemplateEditorRoot mounted without its inject keys');
}
const pluginRef = plugin;
const save = onSave;
const closeModal = close;

const isEdit = computed(() => existing !== null);
const settings = asSettingsBag(pluginRef.settings);

// One ref per field, seeded from the existing template (blank defaults for new).
const form = createInitialForm(existing);
const name = ref(form.name);
const description = ref(form.description);
const icon = ref(form.icon);
const provider = ref(form.provider);
const model = ref(form.model);
const priority = ref(form.priority);
const loop = ref(form.loop);
const agent = ref(form.agent);
const body = ref(form.body);

const providerOptions = providerOptionList(settings);
// Model options track the selected provider; a provider change resets the model.
const modelOptions = computed(() => modelOptionList(provider.value, settings));

function priorityLabel(option: (typeof PRIORITY_OPTIONS)[number]): string {
  return option.label ?? t('tasks.templateEditor.useDefault');
}

// Loop + agent options come from vault I/O / the roster, so they populate after
// mount; the fields stay seeded from `existing` until then (a save that never
// touches the select preserves the stored value).
const loopOptions = ref<TemplateEditorOption[]>([]);
const agentOptions = ref<TemplateEditorOption[]>([]);
onMounted(() => {
  // Swallow vault I/O / roster rejections (leaving the select at its empty
  // option) so a failed listing never escapes as an unhandled promise.
  void loadLoopOptions(pluginRef).then((options) => { loopOptions.value = options; }).catch(() => {});
  void loadAgentOptions(pluginRef, agent.value).then((options) => { agentOptions.value = options; }).catch(() => {});
});

function onProviderChange(value: string): void {
  provider.value = value;
  // Provider change resets the model to the provider default (parity: `model=''`).
  model.value = '';
}

async function submit(): Promise<void> {
  if (!name.value.trim()) {
    new Notice(t('tasks.template.nameRequired'));
    return;
  }
  if (!body.value.trim()) {
    new Notice(t('tasks.template.bodyRequired'));
    return;
  }
  const payload = buildTemplatePayload(
    {
      name: name.value,
      description: description.value,
      icon: icon.value,
      provider: provider.value,
      model: model.value,
      priority: priority.value,
      loop: loop.value,
      agent: agent.value,
      body: body.value,
    },
    existing?.path,
  );
  try {
    await save(payload);
    closeModal();
  } catch (error) {
    new Notice(t('tasks.template.saveFailed', { error: error instanceof Error ? error.message : String(error) }));
  }
}
</script>

<template>
  <TemplateEditorRow
    :name="t('tasks.templateEditor.nameName')"
    :desc="t('tasks.templateEditor.nameDesc')"
  >
    <input
      v-model="name"
      type="text"
      data-field="name"
      :disabled="isEdit"
    >
  </TemplateEditorRow>

  <TemplateEditorRow
    :name="t('tasks.templateEditor.descriptionName')"
    :desc="t('tasks.templateEditor.descriptionDesc')"
  >
    <input
      v-model="description"
      type="text"
      data-field="description"
    >
  </TemplateEditorRow>

  <TemplateEditorRow
    :name="t('tasks.templateEditor.iconName')"
    :desc="t('tasks.templateEditor.iconDesc')"
    extra-class="specorator-icon-picker-setting"
  >
    <LucideIconField
      :value="icon"
      @change="icon = $event"
    />
  </TemplateEditorRow>

  <TemplateEditorRow
    :name="t('tasks.templateEditor.providerName')"
    :desc="t('tasks.templateEditor.providerDesc')"
  >
    <select
      class="dropdown"
      data-field="provider"
      :value="provider"
      @change="onProviderChange(($event.target as HTMLSelectElement).value)"
    >
      <option
        v-for="option in providerOptions"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
  </TemplateEditorRow>

  <TemplateEditorRow
    :name="t('tasks.templateEditor.modelName')"
    :desc="t('tasks.templateEditor.modelDesc')"
  >
    <select
      v-model="model"
      class="dropdown"
      data-field="model"
    >
      <option
        v-for="option in modelOptions"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
  </TemplateEditorRow>

  <TemplateEditorRow
    :name="t('tasks.templateEditor.priorityName')"
    :desc="t('tasks.templateEditor.priorityDesc')"
  >
    <select
      v-model="priority"
      class="dropdown"
      data-field="priority"
    >
      <option
        v-for="option in PRIORITY_OPTIONS"
        :key="option.value"
        :value="option.value"
      >
        {{ priorityLabel(option) }}
      </option>
    </select>
  </TemplateEditorRow>

  <TemplateEditorRow
    :name="t('tasks.templateEditor.loopName')"
    :desc="t('tasks.templateEditor.loopDesc')"
  >
    <select
      v-model="loop"
      class="dropdown"
      data-field="loop"
    >
      <option value="">
        {{ t('tasks.templateEditor.loopNone') }}
      </option>
      <option
        v-for="option in loopOptions"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
  </TemplateEditorRow>

  <TemplateEditorRow
    :name="t('tasks.templateEditor.agentName')"
    :desc="t('tasks.templateEditor.agentDesc')"
  >
    <select
      v-model="agent"
      class="dropdown"
      data-field="agent"
    >
      <option value="">
        {{ t('tasks.templateEditor.useDefault') }}
      </option>
      <option
        v-for="option in agentOptions"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
  </TemplateEditorRow>

  <TemplateEditorRow
    :name="t('tasks.templateEditor.bodyName')"
    :desc="t('tasks.templateEditor.bodyDesc')"
    extra-class="specorator-wo-template-body-setting"
  >
    <textarea
      v-model="body"
      class="specorator-wo-template-body-input"
      data-field="body"
      :rows="12"
    />
  </TemplateEditorRow>

  <div class="setting-item">
    <div class="setting-item-info" />
    <div class="setting-item-control">
      <button
        class="mod-cta"
        data-action="save"
        @click="submit"
      >
        {{ t('tasks.templateEditor.save') }}
      </button>
      <button
        data-action="cancel"
        @click="closeModal"
      >
        {{ t('tasks.templateEditor.cancel') }}
      </button>
    </div>
  </div>
</template>
