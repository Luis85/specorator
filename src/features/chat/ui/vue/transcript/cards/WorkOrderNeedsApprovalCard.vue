<script setup lang="ts">
import type { NeedsApprovalData } from '../../../../rendering/WorkOrderProtocolDisplay';
import IconSpan from '../IconSpan.vue';

/**
 * Reproduces `rendering/WorkOrderNeedsApprovalCard.ts`'s
 * `renderWorkOrderNeedsApprovalCard` DOM contract: the reversible chip is a
 * header-level sibling of `.main` (appended after `main` is built, same as
 * the legacy `header.createSpan` call), and the "Risk: " row follows the
 * same label-span + sibling-text pattern as the needs-input card.
 */
defineProps<{ needsApproval: NeedsApprovalData }>();
</script>

<template>
  <!-- eslint-disable vue/multiline-html-element-content-newline, vue/singleline-html-element-content-newline -- exact textContent parity with the legacy DOM contract (no surrounding whitespace) -->
  <div class="specorator-work-order-needs-approval-card">
    <div class="specorator-work-order-needs-approval-card-header">
      <IconSpan
        icon="shield-alert"
        css-class="specorator-work-order-needs-approval-card-icon"
      />
      <div class="specorator-work-order-needs-approval-card-main">
        <div class="specorator-work-order-needs-approval-card-title">Approval required</div>
        <div class="specorator-work-order-needs-approval-card-action">{{ needsApproval.action }}</div>
      </div>
      <span
        v-if="needsApproval.reversible !== undefined"
        class="specorator-work-order-needs-approval-card-reversible-chip"
        :class="{ 'is-irreversible': !needsApproval.reversible }"
      >{{ needsApproval.reversible ? 'Reversible' : 'Irreversible' }}</span>
    </div>
    <div
      v-if="needsApproval.risk !== undefined"
      class="specorator-work-order-needs-approval-card-risk"
    ><span class="specorator-work-order-needs-approval-card-label">Risk: </span>{{ needsApproval.risk }}</div>
  </div>
  <!-- eslint-enable vue/multiline-html-element-content-newline, vue/singleline-html-element-content-newline -->
</template>
