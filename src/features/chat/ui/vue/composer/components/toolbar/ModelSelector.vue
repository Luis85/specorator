<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from 'vue';

import type { ProviderIconSvg } from '../../../../../../../core/providers/types';
// Verify relative depth reaches src/shared/icons and src/core/providers/types.
import { createProviderIconSvg } from '../../../../../../../shared/icons';
import { onActivationKey } from '../../../activationKeys';
import { CALLBACKS_KEY } from '../../composerKeys';
import type { ComposerModelOption } from '../../stores/composerStore';
import { useComposerStore } from '../../stores/composerStore';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const triggerEl = ref<HTMLElement | null>(null);

function isSelected(opt: ComposerModelOption): boolean {
  return opt.value === store.toolbar.modelLabel || opt.label === store.toolbar.modelLabel;
}
function toggle(): void {
  open.value = !open.value;
}
function close(): void {
  open.value = false;
}
// Escape and keyboard selection unmount the focused node (the option) or dismiss
// the popup, so hand focus back to the trigger — otherwise it falls to <body>
// and a keyboard user loses their place. Pointer click-away (onDocClick) must
// NOT refocus: it would yank focus back if the user clicked into another field.
function closeAndRefocus(): void {
  open.value = false;
  triggerEl.value?.focus();
}
function pick(value: string): void {
  open.value = false;
  cb?.onSetModel(value);
}
function onOptionKeydown(e: KeyboardEvent, value: string): void {
  onActivationKey(e, () => {
    pick(value);
    triggerEl.value?.focus();
  });
}
// providerIcon is a ProviderIconSvg DESCRIPTOR (not a string). Render it as a REAL
// SVG element built by createProviderIconSvg (the same helper the imperative
// ModelSelector used) — NO v-html / innerHTML (repo no-innerHTML rule). A function
// ref appends the SVG node into the host span on mount/patch.
function renderProviderIcon(el: HTMLElement | null, icon: ProviderIconSvg | undefined): void {
  if (!el) return;
  el.replaceChildren();
  if (icon) el.appendChild(createProviderIconSvg(icon, { width: 14, height: 14 }));
}

// Popout-safe click-away (mirrors ConversationHistoryDropdown): resolve the owner
// document when the menu OPENS, so it lands on the right document even after
// Obsidian moves the leaf into a popout window mid-life; detach always targets
// the document the listener was added to.
function onDocClick(e: MouseEvent): void {
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) close();
}
let listenerDoc: Document | null = null;
function detachDocClick(): void {
  listenerDoc?.removeEventListener('click', onDocClick);
  listenerDoc = null;
}
watch(open, (isOpen) => {
  detachDocClick();
  if (isOpen) {
    listenerDoc = rootEl.value?.ownerDocument ?? document;
    listenerDoc.addEventListener('click', onDocClick);
  }
});
onBeforeUnmount(detachDocClick);
</script>

<template>
  <div
    ref="rootEl"
    class="specorator-model-selector"
    @keydown.esc="closeAndRefocus"
  >
    <!-- A plain <div>, NOT a <button>: inside a Vue island a raw <button>
         inherits Obsidian's native button chrome (background/border/box-shadow),
         which makes the model name read as a prominent button. The imperative
         ModelSelector rendered this as a div, and the sibling toolbar widgets
         (ModeSelector, ThinkingBudgetSelector) are plain divs/spans too. Native
         BUTTON SEMANTICS are restored on the div — role/tabindex/aria-expanded +
         Enter/Space via onActivationKey — so keyboard and assistive-tech users
         keep full access. The :focus-visible ring (Vue reset) shows only on
         keyboard focus, never at rest, so the plain-text look is preserved. -->
    <div
      ref="triggerEl"
      class="specorator-model-btn"
      role="button"
      tabindex="0"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click.stop="toggle"
      @keydown="onActivationKey($event, toggle)"
    >
      <span class="specorator-model-label">{{ store.toolbar.modelLabel }}</span>
    </div>
    <div
      v-if="open"
      class="specorator-model-dropdown"
      role="listbox"
    >
      <template
        v-for="(group, gi) in store.toolbar.modelGroups"
        :key="gi"
      >
        <div
          v-if="group.label"
          class="specorator-model-group"
        >
          {{ group.label }}
        </div>
        <div
          v-for="opt in group.options"
          :key="opt.value"
          class="specorator-model-option"
          :class="{ selected: isSelected(opt) }"
          role="option"
          tabindex="0"
          :aria-selected="isSelected(opt)"
          @click.stop="pick(opt.value)"
          @keydown="onOptionKeydown($event, opt.value)"
        >
          <span
            v-if="opt.providerIcon"
            :ref="(el) => renderProviderIcon(el as HTMLElement, opt.providerIcon)"
            class="specorator-model-provider-icon"
          />
          <span>{{ opt.label }}</span>
        </div>
      </template>
    </div>
  </div>
</template>
