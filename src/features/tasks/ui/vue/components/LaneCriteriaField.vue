<script setup lang="ts">
import { ref } from 'vue';

import SettingRow from './SettingRow.vue';

// Definition-of-ready / definition-of-done textarea for one lane. The draft is
// LOCAL and seeded once from the incoming lines: binding the textarea directly
// to the split/trim/filtered array would erase a blank line the instant the user
// typed it (the array round-trip drops empties), so the raw text stays local and
// only the cleaned line list is emitted upward — mirroring the imperative editor,
// which seeded the textarea once and never re-bound it mid-keystroke.
const props = defineProps<{ label: string; lines: string[] }>();
const emit = defineEmits<{ (event: 'commit', lines: string[]): void }>();

const draft = ref(props.lines.join('\n'));

function onInput(event: Event): void {
  draft.value = (event.target as HTMLTextAreaElement).value;
  emit(
    'commit',
    draft.value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );
}
</script>

<template>
  <SettingRow :name="label">
    <textarea
      :value="draft"
      @input="onInput"
    />
  </SettingRow>
</template>
