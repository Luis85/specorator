<script setup lang="ts">
import { computed } from 'vue';

import { t } from '../../../../../i18n/i18n';
import type { TranslationKey } from '../../../../../i18n/types';
import { hasAnyHandoffSection, parseHandoffSections } from '../../../model/handoffSections';
import type { TaskSpec } from '../../../model/taskTypes';
import MarkdownHost from './MarkdownHost.vue';
import SectionHeader from './SectionHeader.vue';
import WorkOrderCollapsible from './WorkOrderCollapsible.vue';

// Parity target: `renderWorkOrderActivity` — the status-driven activity block.
// review / needs_fix (+ handoff) → structured Agent-handoff cards; needs_handoff
// → the salvage callout + transcript tail; failed (+ ledger) → the run ledger.
// Every other status renders nothing.
const props = defineProps<{ task: TaskSpec }>();

const status = computed(() => props.task.frontmatter.status);
const sourcePath = computed(() => props.task.path);

// --- Agent handoff (review / needs_fix) ------------------------------------
const showHandoff = computed(
  () =>
    (status.value === 'review' || status.value === 'needs_fix') &&
    props.task.sections.handoff.length > 0,
);
const handoffMarkdown = computed(() => props.task.sections.handoff);
const parsedHandoff = computed(() => parseHandoffSections(handoffMarkdown.value));
const hasStructuredHandoff = computed(() => hasAnyHandoffSection(parsedHandoff.value));

interface HandoffCard {
  titleKey: TranslationKey;
  icon: string;
  modifier: string;
  defaultOpen: boolean;
  body: string;
}

// Glyphs + per-section modifiers mirror the imperative handoff cards; the accent
// color the spec fixes is set in CSS off the modifier, not the glyph.
const handoffCards = computed<HandoffCard[]>(() => [
  { titleKey: 'tasks.workOrderModal.handoffSummary', icon: 'file-text', modifier: 'summary', defaultOpen: true, body: parsedHandoff.value.summary },
  { titleKey: 'tasks.workOrderModal.handoffVerification', icon: 'check-square', modifier: 'verification', defaultOpen: false, body: parsedHandoff.value.verification },
  { titleKey: 'tasks.workOrderModal.handoffRisks', icon: 'triangle', modifier: 'risks', defaultOpen: false, body: parsedHandoff.value.risks },
  { titleKey: 'tasks.workOrderModal.handoffNextAction', icon: 'signal', modifier: 'next', defaultOpen: true, body: parsedHandoff.value.nextAction },
]);

// --- needs_handoff salvage --------------------------------------------------
const showSalvage = computed(() => status.value === 'needs_handoff');
const trace = computed(() => props.task.sections.ledger.trim());
const transcriptTail = computed(() =>
  trace.value.length > 0 ? trace.value : t('tasks.workOrderModal.transcriptTailEmpty'),
);

// --- failed run ledger ------------------------------------------------------
interface LedgerEntry {
  timestamp: string;
  status: string;
  message: string;
}
const LEDGER_LINE = /^-\s+(\S+)\s+\[([^\]]+)\]\s*(.*)$/;
const showLedger = computed(() => status.value === 'failed' && props.task.sections.ledger.length > 0);
const ledgerEntries = computed<LedgerEntry[]>(() => {
  const entries: LedgerEntry[] = [];
  for (const line of props.task.sections.ledger.split('\n')) {
    const match = line.match(LEDGER_LINE);
    if (!match) continue;
    entries.push({ timestamp: match[1], status: match[2].trim(), message: match[3].trim() });
  }
  return entries;
});
</script>

<template>
  <SectionHeader
    v-if="showHandoff"
    icon="clipboard-check"
    :label="t('tasks.workOrderModal.sectionHandoff')"
  >
    <div
      v-if="!hasStructuredHandoff"
      class="specorator-work-order-modal-handoff-fallback"
    >
      <MarkdownHost
        :markdown="handoffMarkdown"
        :source-path="sourcePath"
      />
    </div>
    <div
      v-else
      class="specorator-work-order-modal-collapse-group"
    >
      <WorkOrderCollapsible
        v-for="card in handoffCards"
        :key="card.modifier"
        :title="t(card.titleKey)"
        :icon="card.icon"
        :modifier="card.modifier"
        :default-open="card.defaultOpen"
      >
        <MarkdownHost
          :markdown="card.body"
          :source-path="sourcePath"
        />
      </WorkOrderCollapsible>
    </div>
  </SectionHeader>

  <SectionHeader
    v-else-if="showSalvage"
    icon="triangle"
    :label="t('tasks.workOrderModal.salvageTitle')"
  >
    <div class="specorator-work-order-modal-salvage-callout">
      {{ t('tasks.workOrderModal.salvageCallout') }}
    </div>
    <div class="specorator-work-order-modal-collapse-group">
      <WorkOrderCollapsible
        :title="t('tasks.workOrderModal.transcriptTail')"
        icon="scroll-text"
        modifier="tail"
        :default-open="true"
      >
        <div class="specorator-work-order-modal-tail-body">
          {{ transcriptTail }}
        </div>
      </WorkOrderCollapsible>
    </div>
  </SectionHeader>

  <SectionHeader
    v-else-if="showLedger && ledgerEntries.length > 0"
    icon="scroll-text"
    :label="t('tasks.workOrderModal.sectionRunLedger')"
  >
    <ol class="specorator-work-order-modal-ledger">
      <li
        v-for="(entry, index) in ledgerEntries"
        :key="index"
        class="specorator-work-order-modal-ledger-entry"
      >
        <span
          class="specorator-work-order-modal-ledger-dot"
          :class="`specorator-work-order-modal-ledger-dot--${entry.status}`"
          aria-hidden="true"
        />
        <span class="specorator-work-order-modal-ledger-time">{{ entry.timestamp }}</span>
        <span class="specorator-work-order-modal-ledger-msg">{{ entry.message }}</span>
      </li>
    </ol>
  </SectionHeader>
</template>
