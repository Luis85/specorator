<script setup lang="ts">
import { ref, watch } from 'vue';

import SettingRow from './SettingRow.vue';

// Definition-of-ready / definition-of-done textarea for one lane. The draft is
// LOCAL: binding the textarea directly to the split/trim/filtered array would
// erase a blank line the instant the user typed it (the array round-trip drops
// empties), so the raw text stays local and only the cleaned line list is
// emitted upward — mirroring the imperative editor, which never re-bound the
// textarea mid-keystroke.
const props = defineProps<{ label: string; lines: string[] }>();
const emit = defineEmits<{ (event: 'commit', lines: string[]): void }>();

const draft = ref(props.lines.join('\n'));

function parsed(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}

function onInput(event: Event): void {
  draft.value = (event.target as HTMLTextAreaElement).value;
  emit('commit', parsed(draft.value));
}

// Re-seed the draft when the PARENT replaces the lines — e.g. "Reset to
// defaults" reuses lane ids, so this field is not remounted and would otherwise
// keep showing the pre-reset criteria (the next edit would then persist those
// stale lines, undoing the reset). Skip the echo of the user's own edit: when
// `lines` already equals the draft's parsed output, re-seeding would clobber a
// blank line the user is mid-keystroke on.
watch(
  () => props.lines,
  (lines) => {
    const current = parsed(draft.value);
    if (lines.length !== current.length || lines.some((line, i) => line !== current[i])) {
      draft.value = lines.join('\n');
    }
  },
);
</script>

<template>
  <SettingRow :name="label">
    <textarea
      :value="draft"
      @input="onInput"
    />
  </SettingRow>
</template>
