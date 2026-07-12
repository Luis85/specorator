<script setup lang="ts">
import type { NeedsInputData } from '../../../../rendering/WorkOrderProtocolDisplay';
import IconSpan from '../IconSpan.vue';

/**
 * Reproduces `rendering/WorkOrderNeedsInputCard.ts`'s
 * `renderWorkOrderNeedsInputCard` DOM contract. The legacy renderer builds
 * the "Why: " / "Default: " rows with `createSpan` (label) followed by a
 * plain `appendText` text node — i.e. the label text is NOT wrapped by the
 * trailing value, they are siblings. The template below reproduces that by
 * placing the label `<span>` immediately followed by the interpolated value
 * with no wrapping element.
 */
defineProps<{ needsInput: NeedsInputData }>();
</script>

<template>
  <!-- eslint-disable vue/multiline-html-element-content-newline, vue/singleline-html-element-content-newline -- exact textContent parity with the legacy DOM contract (no surrounding whitespace) -->
  <div class="specorator-work-order-needs-input-card">
    <div class="specorator-work-order-needs-input-card-header">
      <IconSpan
        icon="message-circle-question"
        css-class="specorator-work-order-needs-input-card-icon"
      />
      <div class="specorator-work-order-needs-input-card-main">
        <div class="specorator-work-order-needs-input-card-title">Awaiting your input</div>
        <div class="specorator-work-order-needs-input-card-question">{{ needsInput.question }}</div>
      </div>
    </div>
    <div
      v-if="needsInput.why !== undefined"
      class="specorator-work-order-needs-input-card-why"
    ><span class="specorator-work-order-needs-input-card-label">Why: </span>{{ needsInput.why }}</div>
    <div
      v-if="needsInput.defaultValue !== undefined"
      class="specorator-work-order-needs-input-card-default"
    ><span class="specorator-work-order-needs-input-card-label">Default: </span>{{ needsInput.defaultValue }}</div>
  </div>
  <!-- eslint-enable vue/multiline-html-element-content-newline, vue/singleline-html-element-content-newline -->
</template>
