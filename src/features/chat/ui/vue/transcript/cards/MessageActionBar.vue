<script setup lang="ts">
import { Menu, Notice } from 'obsidian';
import { computed, inject, ref, watchEffect } from 'vue';

import type { ProviderCapabilities } from '../../../../../../core/providers/types';
import type { ChatRewindMode } from '../../../../../../core/runtime/types';
import type { ChatMessage } from '../../../../../../core/types';
import { t } from '../../../../../../i18n/i18n';
import { mountIcon } from '../../mountIcon';
import CopyButton from '../CopyButton.vue';
import { CALLBACKS_KEY } from '../transcriptKeys';

/**
 * Reproduces `rendering/MessageActionBar.ts`'s DOM contract for the two
 * toolbars it builds:
 *  - user role: `.specorator-user-msg-actions` containing, in the legacy's
 *    final insertion order (fork/rewind are `insertBefore(toolbar.firstChild)`
 *    on top of copy+actions, and fork runs after rewind so it lands first):
 *    fork button, rewind button, copy button, then registered-action buttons.
 *  - assistant role: a self-contained `.specorator-text-actions` group of
 *    `.specorator-text-action-btn` buttons. The legacy anchors this group to
 *    the last `.specorator-text-block` (or a fallback protocol-card) inside
 *    the message element; that anchoring is `MessageBubble`'s concern
 *    (Task 10) — this component renders just the button group itself.
 *
 * Capability gating (`getCapabilities().supportsRewind`/`.supportsFork`) and
 * eligibility (`isRewindEligible` for rewind, `isForkEligible` for fork — split
 * so a Team Chat DM can disable fork while keeping rewind) come from the injected
 * `TranscriptCallbacks` seam rather than `MessageActionBarDeps`; `getMessageActions` already
 * returns the eligibility-filtered + run-bound action list (mirrors the
 * legacy `eligibleMessageActions` + `action.run(msg, conversationId)` wiring),
 * so this component just renders and dispatches.
 */
const props = defineProps<{ msg: ChatMessage; role: 'user' | 'assistant' }>();

const callbacks = inject(CALLBACKS_KEY, undefined);

const capabilities = computed<ProviderCapabilities | undefined>(() => callbacks?.getCapabilities());

const textToShow = computed(() => props.msg.displayContent ?? props.msg.content);
const showCopyAndActions = computed(() => !!textToShow.value);

const rewindEligible = computed(() => !!callbacks?.isRewindEligible(props.msg.id));
// Fork eligibility is split from rewind eligibility so a surface can disable
// fork while keeping rewind (Team Chat DMs). When the seam omits isForkEligible
// (older builders / unit fixtures) fall back to rewind eligibility — the
// pre-split behavior, so non-Team-Chat surfaces stay byte-identical.
const forkEligible = computed(() => {
  const resolve = callbacks?.isForkEligible ?? callbacks?.isRewindEligible;
  return !!resolve?.(props.msg.id);
});
const showRewind = computed(
  () => props.role === 'user' && !!capabilities.value?.supportsRewind && rewindEligible.value,
);
const showFork = computed(
  () => props.role === 'user' && !!capabilities.value?.supportsFork && forkEligible.value,
);
const showUserToolbar = computed(() => showFork.value || showRewind.value || showCopyAndActions.value);

const registeredActions = computed(() => (callbacks ? callbacks.getMessageActions(props.msg) : []));
const userActions = computed(() => (showCopyAndActions.value ? registeredActions.value : []));

const forkBtnEl = ref<HTMLElement | null>(null);
const rewindBtnEl = ref<HTMLElement | null>(null);

watchEffect(() => {
  if (showFork.value) mountIcon(forkBtnEl.value, 'git-fork');
});
watchEffect(() => {
  if (showRewind.value) mountIcon(rewindBtnEl.value, 'rotate-ccw');
});

function onActionIconRef(el: Element | null, icon: string): void {
  mountIcon(el, icon);
}

function onActionClick(action: { run: () => void }): void {
  action.run();
}

function runRewind(mode: ChatRewindMode): void {
  if (!callbacks) return;
  void callbacks.onRewind(props.msg.id, mode).catch((err: unknown) => {
    new Notice(t('chat.rewind.failed', { error: err instanceof Error ? err.message : 'Unknown error' }));
  });
}

function onRewindClick(e: MouseEvent): void {
  e.stopPropagation();
  const menu = new Menu();
  menu.addItem((item) => {
    item
      .setTitle(t('chat.rewind.menuConversationOnly'))
      .setIcon('message-square')
      .onClick(() => runRewind('conversation'));
  });
  menu.addItem((item) => {
    item
      .setTitle(t('chat.rewind.menuCodeAndConversation'))
      .setIcon('rotate-ccw')
      .onClick(() => runRewind('code-and-conversation'));
  });
  menu.showAtMouseEvent(e);
}

function onForkClick(e: MouseEvent): void {
  e.stopPropagation();
  if (!callbacks) return;
  void callbacks.onFork(props.msg.id).catch((err: unknown) => {
    new Notice(t('chat.fork.failed', { error: err instanceof Error ? err.message : 'Unknown error' }));
  });
}
</script>

<template>
  <div
    v-if="role === 'user' && showUserToolbar"
    class="specorator-user-msg-actions"
  >
    <span
      v-if="showFork"
      ref="forkBtnEl"
      class="specorator-message-fork-btn"
      :aria-label="t('chat.fork.ariaLabel')"
      @click="onForkClick"
    />
    <span
      v-if="showRewind"
      ref="rewindBtnEl"
      class="specorator-message-rewind-btn"
      :aria-label="t('chat.rewind.ariaLabel')"
      @click="onRewindClick"
    />
    <CopyButton
      v-if="showCopyAndActions"
      :text="textToShow"
      css-class="specorator-user-msg-copy-btn"
      aria-label="Copy message"
    />
    <span
      v-for="action in userActions"
      :key="action.id"
      :ref="(el) => onActionIconRef(el as Element | null, action.icon)"
      class="specorator-user-msg-action-btn"
      :aria-label="action.label"
      @click="onActionClick(action)"
    />
  </div>
  <div
    v-else-if="role === 'assistant' && registeredActions.length > 0"
    class="specorator-text-actions"
  >
    <span
      v-for="action in registeredActions"
      :key="action.id"
      :ref="(el) => onActionIconRef(el as Element | null, action.icon)"
      class="specorator-text-action-btn"
      :aria-label="action.label"
      @click="onActionClick(action)"
    />
  </div>
</template>
