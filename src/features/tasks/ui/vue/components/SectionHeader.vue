<script setup lang="ts">
import { mountLucide } from '../mountLucide';

// Vue port of the imperative `renderSectionHeader`: an uppercase-via-CSS label
// with a leading faint Lucide glyph and an optional right-side slot (the
// Acceptance progress ring/count). The default slot is the section body, which
// the imperative helper appended to the `.section` wrapper after the head row.
// `withRight` mirrors the imperative lazy `right()` — the `.section-right`
// wrapper is only emitted when a caller actually needs a trailing widget, so a
// plain section stays clean.
defineProps<{ icon: string; label: string; withRight?: boolean }>();
</script>

<template>
  <div class="specorator-work-order-modal-section">
    <div class="specorator-work-order-modal-section-head">
      <span class="specorator-work-order-modal-section-title">
        <span
          :ref="(el) => mountLucide(el, icon)"
          class="specorator-work-order-modal-section-icon"
          aria-hidden="true"
        />
        <span class="specorator-work-order-modal-section-label">{{ label }}</span>
      </span>
      <div
        v-if="withRight"
        class="specorator-work-order-modal-section-right"
      >
        <slot name="right" />
      </div>
    </div>
    <slot />
  </div>
</template>
