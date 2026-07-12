<script setup lang="ts">
import { computed } from 'vue';

import type { ParsedHandoffForDisplay } from '../../../../rendering/WorkOrderProtocolDisplay';
import { useCollapsible } from '../collapsible';
import IconSpan from '../IconSpan.vue';
import MarkdownHost from '../MarkdownHost.vue';

/**
 * Reproduces `rendering/WorkOrderHandoffCard.ts`'s `renderWorkOrderHandoffCard`
 * DOM contract: a collapsible wrapper (header/chips/details siblings, in that
 * order — matching the legacy `wrapper.createDiv` call order) whose four
 * `-section`s render their markdown body via the shared `MarkdownHost`
 * (mirrors `renderMarkdown` being passed through from `MessageRenderer`).
 * The toggle label text ("Expand"/"Collapse") mirrors the legacy
 * `setupCollapsible` `onToggle` callback that sets `expandLabel`'s text.
 */
const props = defineProps<{ handoff: ParsedHandoffForDisplay; preview: string }>();

const { expanded, toggle, onKeydown, ariaLabel } = useCollapsible({ baseAriaLabel: 'Work order handoff' });

const sections = computed(() => [
  { title: 'Summary', body: props.handoff.summary },
  { title: 'Verification', body: props.handoff.verification },
  { title: 'Risks', body: props.handoff.risks },
  { title: 'Next Action', body: props.handoff.nextAction },
]);
</script>

<template>
  <!-- eslint-disable vue/singleline-html-element-content-newline -- exact textContent parity with the legacy DOM contract (no surrounding whitespace) -->
  <div
    class="specorator-work-order-handoff-card"
    :class="{ expanded }"
  >
    <div
      class="specorator-work-order-handoff-card-header"
      role="button"
      tabindex="0"
      :aria-expanded="expanded ? 'true' : 'false'"
      :aria-label="ariaLabel"
      @click="toggle"
      @keydown="onKeydown"
    >
      <IconSpan
        icon="clipboard-check"
        css-class="specorator-work-order-handoff-card-icon"
      />
      <div class="specorator-work-order-handoff-card-main">
        <div class="specorator-work-order-handoff-card-title">Work order handoff</div>
        <div class="specorator-work-order-handoff-card-preview">{{ preview }}</div>
      </div>
      <span class="specorator-work-order-handoff-card-toggle">{{ expanded ? 'Collapse' : 'Expand' }}</span>
    </div>
    <div class="specorator-work-order-handoff-card-chips">
      <span class="specorator-work-order-handoff-card-chip">Verification</span>
      <span class="specorator-work-order-handoff-card-chip">Risks</span>
      <span class="specorator-work-order-handoff-card-chip">Next Action</span>
    </div>
    <div
      class="specorator-work-order-handoff-card-details"
      :class="{ 'specorator-hidden': !expanded }"
    >
      <div
        v-for="section in sections"
        :key="section.title"
        class="specorator-work-order-handoff-card-section"
      >
        <div class="specorator-work-order-handoff-card-section-title">{{ section.title }}</div>
        <div class="specorator-work-order-handoff-card-section-body">
          <MarkdownHost :markdown="section.body" />
        </div>
      </div>
    </div>
  </div>
  <!-- eslint-enable vue/singleline-html-element-content-newline -->
</template>
