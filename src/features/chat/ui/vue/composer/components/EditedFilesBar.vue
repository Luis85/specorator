<script setup lang="ts">
import { computed, inject } from 'vue';

import EditedFilesStrip from '../../../../../teamChat/ui/vue/components/EditedFilesStrip.vue';
import { CALLBACKS_KEY } from '../composerKeys';
import { useComposerStore } from '../stores/composerStore';

// Composer binding for the shared edited-files affordance: the presentational
// badge + popover lives in `EditedFilesStrip` (reused by the Team Chat top bar);
// this wrapper keeps the composer's `ComposerCallbacks`/store coupling — entries
// project from `store.editedFiles`, and opening a row routes through
// `onOpenEditedFile`. Behaviour is unchanged (locked by editedFilesBar.test.ts).
const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const entries = computed(() => store.editedFiles);

function openEditedFile(path: string): void {
  cb?.onOpenEditedFile(path);
}
</script>

<template>
  <EditedFilesStrip
    :entries="entries"
    :on-open="openEditedFile"
  />
</template>
