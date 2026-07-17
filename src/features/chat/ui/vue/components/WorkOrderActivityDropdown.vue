<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';

import { t } from '../../../../../i18n/i18n';
import { onActivationKey } from '../activationKeys';
import { CALLBACKS_KEY } from '../chatShellKeys';
import { mountIcon } from '../mountIcon';
import { useChatShellStore } from '../stores/chatShellStore';

const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('WorkOrderActivityDropdown mounted without CALLBACKS_KEY');
const store = useChatShellStore();

const open = ref(false);
const summary = computed(() => store.workOrder);
const entryCount = computed(() => summary.value.items.length + summary.value.closableTabs.length);
const isEmpty = computed(() => entryCount.value === 0);
const attention = computed(() => summary.value.attentionCount > 0);

// Collapse when the summary drains to empty (parity with the imperative update(),
// which sets `this.open = false` when entryCount === 0). Without this the local
// `open` ref stays true while the empty slot is hidden, so a later item auto-reopens.
watch(isEmpty, (empty) => { if (empty) open.value = false; });

const toggleLabel = computed(() => {
  const s = summary.value;
  if (s.attentionCount > 0) {
    return t('workOrderActivity.toggleAttention', {
      count: String(s.items.length),
      attention: String(s.attentionCount),
    });
  }
  if (s.items.length === 0 && s.closableTabs.length > 0) {
    return t('workOrderActivity.toggleFinished', { count: String(s.closableTabs.length) });
  }
  return t('workOrderActivity.toggleRunning', { count: String(s.items.length) });
});

function toggleIcon(el: unknown): void { mountIcon(el, 'clipboard-list'); }
function closeIcon(el: unknown): void { mountIcon(el, 'x'); }

function onToggle(): void { if (!isEmpty.value) open.value = !open.value; }
// Arrow-function expressions (not hoisted `function` declarations): TS's
// narrowing of `cb` from the guard above only survives closures that can't
// be invoked before the narrowing runs, which excludes hoisted declarations.
const onOpenItem = (id: string): void => { open.value = false; void cb.onOpenWorkOrderItem(id); };
const onCloseTab = (tabId: string): void => { void cb.onCloseWorkOrderTab(tabId); };
// Close-tab keydown additionally stops propagation, but only for the
// matching keys (parity with the imperative widget's close.addEventListener
// keydown handler, which calls stopPropagation only inside the Enter/Space
// branch — unlike the plain @keydown.stop modifier, which would stop every key).
function onCloseTabKeydown(e: KeyboardEvent, tabId: string): void {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  e.stopPropagation();
  onCloseTab(tabId);
}
</script>

<template>
  <div
    class="specorator-work-order-activity-slot"
    :class="{ 'specorator-hidden': isEmpty }"
  >
    <div
      v-if="!isEmpty"
      class="specorator-work-order-activity"
    >
      <div
        class="specorator-header-btn specorator-work-order-activity-toggle"
        :class="{ 'specorator-work-order-activity-toggle--attention': attention }"
        role="button"
        tabindex="0"
        aria-haspopup="menu"
        :aria-expanded="open ? 'true' : 'false'"
        :aria-label="toggleLabel"
        @click.stop="onToggle()"
        @keydown="onActivationKey($event, onToggle)"
      >
        <span
          :ref="toggleIcon"
          class="specorator-work-order-activity-icon"
        />
        <span class="specorator-work-order-activity-count">{{ entryCount }}</span>
      </div>
      <div
        v-if="open"
        class="specorator-work-order-activity-menu"
        role="menu"
      >
        <div
          v-for="item in summary.items"
          :key="item.id"
          class="specorator-work-order-activity-item"
          role="menuitem"
          tabindex="0"
          @click="onOpenItem(item.id)"
          @keydown="onActivationKey($event, () => onOpenItem(item.id))"
        >
          <span class="specorator-work-order-activity-title">{{ item.title }}</span>
          <span class="specorator-work-order-activity-status">{{ t(item.labelKey) }}</span>
          <span class="specorator-work-order-activity-action">{{ t(item.actionHintKey) }}</span>
        </div>
        <div
          v-for="tab in summary.closableTabs"
          :key="tab.tabId"
          class="specorator-work-order-activity-item specorator-work-order-activity-item--finished"
          role="menuitem"
        >
          <span class="specorator-work-order-activity-title">{{ tab.title }}</span>
          <span class="specorator-work-order-activity-status">{{ t('workOrderActivity.status.finished') }}</span>
          <span
            :ref="closeIcon"
            class="specorator-work-order-activity-close"
            role="button"
            tabindex="0"
            :aria-label="t('workOrderActivity.action.close')"
            @click.stop="onCloseTab(tab.tabId)"
            @keydown="onCloseTabKeydown($event, tab.tabId)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
