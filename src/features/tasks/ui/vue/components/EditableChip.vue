<script setup lang="ts">
import { computed } from 'vue';

import { mountLucide } from '../mountLucide';

export interface EditableChipOption {
  value: string;
  label: string;
}

// Vue port of the imperative `renderEditableValueChip`: a borderless value chip
// showing the current label + a decorative chevron, with a transparent native
// `<select>` overlaying the whole chip so the picker stays keyboard-operable.
// The `lead` slot lets the Agent row prepend a persona avatar as the first chip
// child (parity: `insertBefore(avatar, firstChild)`). Controlled by `modelValue`
// — the parent updates its own ref on `change`, which flows back as the new
// label, so a dependent field (Model after Provider) resets by the parent
// clearing the bound value.
const props = defineProps<{
  modelValue: string;
  options: EditableChipOption[];
  emptyOption?: EditableChipOption;
}>();

const emit = defineEmits<{ (event: 'change', value: string): void }>();

const label = computed(() => {
  if (props.emptyOption && props.modelValue === props.emptyOption.value) return props.emptyOption.label;
  return props.options.find((o) => o.value === props.modelValue)?.label ?? props.modelValue;
});

function onChange(event: Event): void {
  emit('change', (event.target as HTMLSelectElement).value);
}
</script>

<template>
  <div class="specorator-work-order-modal-chip">
    <slot name="lead" />
    <span class="specorator-work-order-modal-chip-label">{{ label }}</span>
    <span
      :ref="(el) => mountLucide(el, 'chevron-down')"
      class="specorator-work-order-modal-chip-chevron"
      aria-hidden="true"
    />
    <select
      class="specorator-work-order-modal-chip-select"
      :value="modelValue"
      @change="onChange"
    >
      <option
        v-if="emptyOption"
        :value="emptyOption.value"
      >
        {{ emptyOption.label }}
      </option>
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
  </div>
</template>
