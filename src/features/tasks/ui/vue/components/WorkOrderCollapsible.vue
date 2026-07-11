<script setup lang="ts">
import { ref } from 'vue';

import { mountLucide } from '../mountLucide';

// Vue port of the imperative `renderCollapsible`: a real `<button>` header
// (keyboard-operable, `aria-expanded` reflecting state) carrying a rotating
// chevron + a per-section colored icon + the title, over a body slot mounted on
// demand. `is-open` drives the CSS. State is local UI only (not persisted); the
// body is `v-if`-gated so it mounts on expand and unmounts on collapse — the
// reactive equivalent of the imperative build-on-open / clear-on-collapse.
const props = defineProps<{ title: string; icon: string; modifier: string; defaultOpen: boolean }>();

const open = ref(props.defaultOpen);
</script>

<template>
  <div
    class="specorator-work-order-modal-collapse"
    :class="[`specorator-work-order-modal-collapse--${modifier}`, { 'is-open': open }]"
  >
    <button
      type="button"
      class="specorator-work-order-modal-collapse-head"
      :aria-expanded="open ? 'true' : 'false'"
      @click="open = !open"
    >
      <span
        :ref="(el) => mountLucide(el, 'chevron-right')"
        class="specorator-work-order-modal-collapse-chevron"
        aria-hidden="true"
      />
      <span
        :ref="(el) => mountLucide(el, icon)"
        class="specorator-work-order-modal-collapse-icon"
        aria-hidden="true"
      />
      <span class="specorator-work-order-modal-collapse-title">{{ title }}</span>
    </button>
    <div
      v-if="open"
      class="specorator-work-order-modal-collapse-body"
    >
      <slot />
    </div>
  </div>
</template>
