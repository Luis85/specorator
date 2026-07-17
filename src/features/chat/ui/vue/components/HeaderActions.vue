<script setup lang="ts">
import { computed, inject } from 'vue';

import { t } from '../../../../../i18n/i18n';
import { onActivationKey } from '../activationKeys';
import { CALLBACKS_KEY } from '../chatShellKeys';
import { mountIcon } from '../mountIcon';
import { useChatShellStore } from '../stores/chatShellStore';
import ConversationHistoryDropdown from './ConversationHistoryDropdown.vue';
import WorkOrderActivityDropdown from './WorkOrderActivityDropdown.vue';

const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('HeaderActions mounted without CALLBACKS_KEY');

const store = useChatShellStore();
// Gates the new-tab (+) button at the tab cap (mirrors the old
// updateNewTabButtonVisibility: hidden + aria-disabled/aria-hidden when false).
const canCreateTab = computed(() => store.header.canCreateTab);

// Stable named host functions per button (consistent with TabBadge.vue /
// BoundAgentChip.vue) so each `:ref` is not a fresh closure per render.
function quickActionsHost(el: unknown): void { mountIcon(el, 'zap'); }
function newTabHost(el: unknown): void { mountIcon(el, 'square-plus'); }
function newConversationHost(el: unknown): void { mountIcon(el, 'square-pen'); }

// Mirrors SpecoratorView.wireHeaderButton: click + Enter/Space both activate,
// so each specorator-header-btn is keyboard-operable.
</script>

<template>
  <div class="specorator-header-actions">
    <WorkOrderActivityDropdown />

    <div
      :ref="quickActionsHost"
      class="specorator-header-btn"
      role="button"
      tabindex="0"
      :aria-label="t('quickActions.toolbar.ariaLabel')"
      :title="t('quickActions.toolbar.title')"
      @mouseenter="cb.onQuickActionsHover()"
      @click="cb.onQuickActions()"
      @keydown="onActivationKey($event, cb.onQuickActions)"
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
      @keydown="onActivationKey($event, cb.onNewTab)"
    />

    <div
      :ref="newConversationHost"
      class="specorator-header-btn"
      role="button"
      tabindex="0"
      aria-label="New conversation"
      @click="cb.onNewConversation()"
      @keydown="onActivationKey($event, cb.onNewConversation)"
    />

    <ConversationHistoryDropdown />
  </div>
</template>
