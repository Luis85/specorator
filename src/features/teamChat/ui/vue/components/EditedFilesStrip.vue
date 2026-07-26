<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { t } from '../../../../../i18n/i18n';
import type { ComposerEditedFile } from '../../../../chat/ui/vue/composer/stores/composerStore';
import { mountIcon } from '../../../../chat/ui/vue/mountIcon';

// Presentational core of the composer's edited-files affordance, lifted out so
// BOTH the composer's `EditedFilesBar` (store-bound) and the Team Chat top bar
// (tab-projection-bound) render the identical badge + floating popover from
// plain props — no `inject`, no store. Callers own where `entries` come from and
// what `onOpen` does; this component owns only the render + open/dismiss UX.
const props = defineProps<{
  entries: ComposerEditedFile[];
  /** Invoked with the vault-relative path when a row is activated. */
  onOpen: (path: string) => void;
}>();

const open = ref(false);
const createdCount = computed(() => props.entries.filter((e) => e.changeKind === 'created').length);
const editedCount = computed(() => props.entries.filter((e) => e.changeKind === 'edited').length);
const countLabel = computed(() => `${createdCount.value} created · ${editedCount.value} edited`);

// Icon ids verified against the imperative EditedFilesView: badge `file-pen`,
// chevron `chevron-down`, created rows `file-plus`, edited rows `file-pen`.
// Painted through mountIcon (nodeType guard) so popout leaves stay safe.
function badgeIcon(el: HTMLElement | null): void { mountIcon(el, 'file-pen'); }
function chevron(el: HTMLElement | null): void { mountIcon(el, 'chevron-down'); }
function itemIcon(el: HTMLElement | null, kind: string): void { mountIcon(el, kind === 'created' ? 'file-plus' : 'file-pen'); }

// The popover-carrying element (`.specorator-edited-files`); outside-click checks
// containment against it, exactly like the imperative `rootEl` guard.
const rowEl = ref<HTMLElement | null>(null);
const rootEl = ref<HTMLElement | null>(null);

function activate(path: string): void {
  open.value = false;
  props.onOpen(path);
}

// Match the imperative reset: an emptied list closes the popover so it never
// re-opens stale when new entries arrive.
watch(() => props.entries.length, (count) => { if (count === 0) open.value = false; });

// Reproduce EditedFilesView's outside-click / Escape dismissal. Bound to this
// SFC's own lifecycle (add on mount / remove on unmount) and scoped to
// `rowEl.ownerDocument` so popout leaves target the right document; the handlers
// no-op while closed, matching the imperative attach-only-when-open behaviour.
let listenerDoc: Document | null = null;

function onDocMousedown(event: MouseEvent): void {
  if (!open.value) return;
  const target = event.target as Node | null;
  if (rootEl.value && target && rootEl.value.contains(target)) return;
  open.value = false;
}

function onDocKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false;
}

onMounted(() => {
  listenerDoc = rowEl.value?.ownerDocument ?? document;
  listenerDoc.addEventListener('mousedown', onDocMousedown);
  listenerDoc.addEventListener('keydown', onDocKeydown);
});

onBeforeUnmount(() => {
  listenerDoc?.removeEventListener('mousedown', onDocMousedown);
  listenerDoc?.removeEventListener('keydown', onDocKeydown);
  listenerDoc = null;
});
</script>

<template>
  <div
    ref="rowEl"
    class="specorator-edited-files-row"
    :class="{ 'specorator-visible-flex': props.entries.length > 0, 'specorator-hidden': props.entries.length === 0 }"
  >
    <div
      v-if="props.entries.length > 0"
      ref="rootEl"
      class="specorator-edited-files"
    >
      <div
        class="specorator-edited-files-badge"
        role="button"
        tabindex="0"
        aria-haspopup="menu"
        :aria-label="t('chat.editedFiles.label')"
        :aria-expanded="open"
        @click="open = !open"
        @keydown.enter.prevent="open = !open"
        @keydown.space.prevent="open = !open"
      >
        <span
          :ref="(el) => badgeIcon(el as HTMLElement | null)"
          class="specorator-edited-files-badge-icon"
        />
        <span class="specorator-edited-files-badge-count">{{ countLabel }}</span>
        <span
          :ref="(el) => chevron(el as HTMLElement | null)"
          class="specorator-edited-files-badge-chevron"
        />
      </div>
      <div
        v-if="open"
        class="specorator-edited-files-menu"
        role="menu"
      >
        <div
          v-for="entry in props.entries"
          :key="entry.path"
          class="specorator-edited-files-item"
          :class="`specorator-edited-files-item--${entry.changeKind}`"
          role="menuitem"
          tabindex="0"
          :aria-label="entry.path"
          @click="activate(entry.path)"
          @keydown.enter.prevent="activate(entry.path)"
          @keydown.space.prevent="activate(entry.path)"
        >
          <span
            :ref="(el) => itemIcon(el as HTMLElement | null, entry.changeKind)"
            class="specorator-edited-files-item-icon"
          />
          <span
            class="specorator-edited-files-item-name"
            :title="entry.path"
          >{{ entry.name }}</span>
          <span
            v-if="entry.dir"
            class="specorator-edited-files-item-dir"
          >{{ entry.dir }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
