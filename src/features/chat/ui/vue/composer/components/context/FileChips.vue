<script setup lang="ts">
import { computed, inject } from 'vue';

import { mountIcon } from '../../../mountIcon';
import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';

type Pill = { path: string; label: string; kind: 'current' | 'file' | 'folder' };

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
// One flat pill list: current note first, then attached files, then folders.
// All pills are removable; only current/file names open on click (folders are
// non-openable — matching the imperative FileChipsView, since openLinkText on a
// folder path would create a stray note). Removing 'current' clears the tracked
// current-note path (engine); files/folders detach their pill. The store slice
// already de-dupes the current note out of `files`.
const pills = computed<Pill[]>(() => {
  const out: Pill[] = [];
  const c = store.chips.currentNote;
  if (c) out.push({ path: c.path, label: c.label, kind: 'current' });
  for (const f of store.chips.files) out.push({ path: f.path, label: f.label, kind: 'file' });
  for (const d of store.chips.folders) out.push({ path: d.path, label: d.label, kind: 'folder' });
  return out;
});

// Icon ids match the imperative FileChipsView exactly: folders get `folder`,
// current + file both get `file-text`. Painted through mountIcon (nodeType
// guard) so popout leaves stay safe.
function paintIcon(el: HTMLElement | null, kind: string): void {
  mountIcon(el, kind === 'folder' ? 'folder' : 'file-text');
}
</script>

<template>
  <div
    class="specorator-file-indicator"
    :class="{ 'specorator-visible-flex': pills.length > 0, 'specorator-hidden': pills.length === 0 }"
  >
    <div
      v-for="pill in pills"
      :key="`${pill.kind}:${pill.path}`"
      class="specorator-file-chip"
      :class="`specorator-file-chip--${pill.kind}`"
    >
      <span
        :ref="(el) => paintIcon(el as HTMLElement | null, pill.kind)"
        class="specorator-file-chip-icon"
      />
      <span
        class="specorator-file-chip-name"
        :title="pill.path"
        @click="pill.kind !== 'folder' && cb?.onOpenFile(pill.path)"
      >{{ pill.label }}</span>
      <span
        class="specorator-file-chip-remove"
        aria-label="Remove"
        @click="cb?.onRemoveChip(pill.path, pill.kind)"
      >×</span>
    </div>
  </div>
</template>
