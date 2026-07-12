<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';

import { t } from '../../../../../i18n/i18n';
import { CALLBACKS_KEY } from '../chatShellKeys';
import { mountIcon } from '../mountIcon';
import { useChatShellStore } from '../stores/chatShellStore';

const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('HeaderActions mounted without CALLBACKS_KEY');

const store = useChatShellStore();
// Gates the new-tab (+) button at the tab cap (mirrors the old
// updateNewTabButtonVisibility: hidden + aria-disabled/aria-hidden when false).
const canCreateTab = computed(() => store.header.canCreateTab);

const historyHost = ref<HTMLElement | null>(null);
const workOrderHost = ref<HTMLElement | null>(null);
onMounted(() => {
  if (historyHost.value) cb.mountHistoryHost(historyHost.value);
  if (workOrderHost.value) cb.mountWorkOrderHost(workOrderHost.value);
});

// Stable named host functions per button (consistent with TabBadge.vue /
// BoundAgentChip.vue) so each `:ref` is not a fresh closure per render.
function quickActionsHost(el: unknown): void { mountIcon(el, 'zap'); }
function newTabHost(el: unknown): void { mountIcon(el, 'square-plus'); }
function newConversationHost(el: unknown): void { mountIcon(el, 'square-pen'); }
function historyHostIcon(el: unknown): void { mountIcon(el, 'history'); }

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
      :ref="quickActionsHost"
      class="specorator-header-btn"
      role="button"
      tabindex="0"
      :aria-label="t('quickActions.toolbar.ariaLabel')"
      :title="t('quickActions.toolbar.title')"
      @mouseenter="cb.onQuickActionsHover()"
      @click="cb.onQuickActions()"
      @keydown="onKeydown($event, cb.onQuickActions)"
    />

    <div
      :ref="newTabHost"
      class="specorator-header-btn specorator-new-tab-btn"
      :class="{ 'specorator-hidden': !canCreateTab }"
      role="button"
      tabindex="0"
      aria-label="New tab"
      :aria-disabled="!canCreateTab ? 'true' : undefined"
      :aria-hidden="!canCreateTab ? 'true' : undefined"
      @click="cb.onNewTab()"
      @keydown="onKeydown($event, cb.onNewTab)"
    />

    <div
      :ref="newConversationHost"
      class="specorator-header-btn"
      role="button"
      tabindex="0"
      aria-label="New conversation"
      @click="cb.onNewConversation()"
      @keydown="onKeydown($event, cb.onNewConversation)"
    />

    <div class="specorator-history-container">
      <div
        :ref="historyHostIcon"
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
