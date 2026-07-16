<script setup lang="ts">
import { inject, ref } from 'vue';

import type { ProviderIconSvg } from '../../../../../../../core/providers/types';
// Verify relative depth reaches src/shared/icons and src/core/providers/types.
import { createProviderIconSvg } from '../../../../../../../shared/icons';
import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const open = ref(false);
function pick(value: string): void {
  open.value = false;
  cb?.onSetModel(value);
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
</script>

<template>
  <div class="specorator-model-selector">
    <button
      class="specorator-model-btn"
      type="button"
      @click="open = !open"
    >
      <span class="specorator-model-label">{{ store.toolbar.modelLabel }}</span>
    </button>
    <div
      v-if="open"
      class="specorator-model-dropdown"
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
          :class="{ selected: opt.value === store.toolbar.modelLabel || opt.label === store.toolbar.modelLabel }"
          @click="pick(opt.value)"
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
