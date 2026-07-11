<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { t } from '../../../../../i18n/i18n';
import { CALLBACKS_KEY } from '../chatShellKeys';
import { mountIcon } from '../mountIcon';

const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('HeaderActions mounted without CALLBACKS_KEY');

const historyHost = ref<HTMLElement | null>(null);
const workOrderHost = ref<HTMLElement | null>(null);
onMounted(() => {
  if (historyHost.value) cb.mountHistoryHost(historyHost.value);
  if (workOrderHost.value) cb.mountWorkOrderHost(workOrderHost.value);
});

function icon(name: string) {
  return (el: unknown) => mountIcon(el, name);
}

// Mirrors SpecoratorView.wireHeaderButton: click + Enter/Space both activate,
// so each specorator-header-btn is keyboard-operable.
function onKeydown(e: KeyboardEvent, fn: () => void): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
}
</script>

<template>
  <div class="specorator-header-actions">
    <div
      ref="workOrderHost"
      class="specorator-work-order-activity-slot"
    />

    <div
      :ref="icon('zap')"
      class="specorator-header-btn"
      role="button"
      tabindex="0"
      :aria-label="t('quickActions.toolbar.ariaLabel')"
      :title="t('quickActions.toolbar.title')"
      @click="cb.onQuickActions()"
      @keydown="onKeydown($event, cb.onQuickActions)"
    />

    <div
      :ref="icon('square-plus')"
      class="specorator-header-btn specorator-new-tab-btn"
      role="button"
      tabindex="0"
      aria-label="New tab"
      @click="cb.onNewTab()"
      @keydown="onKeydown($event, cb.onNewTab)"
    />

    <div
      :ref="icon('square-pen')"
      class="specorator-header-btn"
      role="button"
      tabindex="0"
      aria-label="New conversation"
      @click="cb.onNewConversation()"
      @keydown="onKeydown($event, cb.onNewConversation)"
    />

    <div class="specorator-history-container">
      <div
        :ref="icon('history')"
        class="specorator-header-btn"
        role="button"
        tabindex="0"
        aria-label="Chat history"
        aria-haspopup="true"
        aria-expanded="false"
        @click.stop="cb.onOpenHistory()"
        @keydown="onKeydown($event, cb.onOpenHistory)"
      />
      <div
        ref="historyHost"
        class="specorator-history-menu"
      />
    </div>
  </div>
</template>
