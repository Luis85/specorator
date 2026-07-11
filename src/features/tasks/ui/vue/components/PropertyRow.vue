<script setup lang="ts">
import { mountLucide } from '../mountLucide';

// Vue port of the imperative `addPropertyRow`: one labelled sidebar row keyed by
// a stable `data-prop` (the ordered-row assertion anchor), with a leading faint
// Lucide glyph + label text and a value slot. Extracted so the ~10 properties
// rows don't repeat the same wrapper markup.
defineProps<{ propKey: string; icon: string; label: string }>();
</script>

<template>
  <div
    class="specorator-work-order-modal-prop-row"
    :data-prop="propKey"
  >
    <span class="specorator-work-order-modal-prop-label">
      <span
        :ref="(el) => mountLucide(el, icon)"
        class="specorator-work-order-modal-prop-icon"
      />
      <span class="specorator-work-order-modal-prop-label-text">{{ label }}</span>
    </span>
    <span class="specorator-work-order-modal-prop-value">
      <slot />
    </span>
  </div>
</template>
