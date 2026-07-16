<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';

import { t } from '../../../../../../i18n/i18n';
import { mountIcon } from '../../mountIcon';
import { CALLBACKS_KEY, COMPONENT_KEY } from '../composerKeys';
import { useComposerStore } from '../stores/composerStore';

// Reactive reproduction of the imperative EditedFilesView: a single-line badge
// (kind-split count) above the composer that toggles a floating popover listing
// every agent-created/edited file. Self-hides when `store.editedFiles` is empty.
const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const component = inject(COMPONENT_KEY);
const open = ref(false);
const entries = computed(() => store.editedFiles);
const createdCount = computed(() => entries.value.filter((e) => e.changeKind === 'created').length);
const editedCount = computed(() => entries.value.filter((e) => e.changeKind === 'edited').length);
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

// Match the imperative reset: an emptied list closes the popover so it never
// re-opens stale when new entries arrive.
watch(() => entries.value.length, (count) => { if (count === 0) open.value = false; });

// Reproduce EditedFilesView's outside-click / Escape dismissal. Registered
// through the injected Obsidian Component's `registerDomEvent` so it is
// auto-cleaned on unmount (no raw document listener leak). The handlers no-op
// while closed, matching the imperative attach-only-when-open behaviour.
onMounted(() => {
  const doc = rowEl.value?.ownerDocument ?? document;
  component?.registerDomEvent(doc, 'mousedown', (event: MouseEvent) => {
    if (!open.value) return;
    const target = event.target as Node | null;
    if (rootEl.value && target && rootEl.value.contains(target)) return;
    open.value = false;
  });
  component?.registerDomEvent(doc, 'keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') open.value = false;
  });
});
</script>

<template>
  <div
    ref="rowEl"
    class="specorator-edited-files-row"
    :class="{ 'specorator-visible-flex': entries.length > 0, 'specorator-hidden': entries.length === 0 }"
  >
    <div
      v-if="entries.length > 0"
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
          v-for="entry in entries"
          :key="entry.path"
          class="specorator-edited-files-item"
          :class="`specorator-edited-files-item--${entry.changeKind}`"
          role="menuitem"
          tabindex="0"
          :aria-label="entry.path"
          @click="open = false; cb?.onOpenEditedFile(entry.path)"
          @keydown.enter.prevent="open = false; cb?.onOpenEditedFile(entry.path)"
          @keydown.space.prevent="open = false; cb?.onOpenEditedFile(entry.path)"
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
