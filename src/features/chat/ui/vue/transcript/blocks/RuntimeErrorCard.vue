<script setup lang="ts">
import { Notice } from 'obsidian';
import { computed, inject, ref, watchEffect } from 'vue';

import { t } from '../../../../../../i18n/i18n';
import type { TranslationKey } from '../../../../../../i18n/types';
import type { RuntimeErrorKind } from '../../../../controllers/runtimeErrorClassification';
import { mountIcon } from '../../mountIcon';
import IconSpan from '../IconSpan.vue';
import { CALLBACKS_KEY } from '../transcriptKeys';

/**
 * Reproduces `rendering/InlineRuntimeError.ts`'s `renderInlineRuntimeError`
 * DOM contract. `onOpenSettings`/`onRetry` are resolved from the injected
 * callbacks seam rather than accepted as props — both legacy call sites
 * (`assistantMessageContent.ts`'s stored-render path,
 * `StreamController.ts`'s live-stream path) always wire `onOpenSettings`
 * through `openProviderSettings`, so the settings button shows whenever
 * callbacks are reachable and the kind is actionable; the retry button
 * additionally requires `onRetryLastTurn` to be non-null (the seam already
 * encodes "no turn available to retry" as `null`, matching the legacy
 * `onRetry: undefined` omission) AND `suppressRetry` to be falsy — an
 * auto-triggered (background) turn sets `suppressRetry`, since retrying would
 * re-send the user's last normal prompt rather than the failed background turn
 * (matching the legacy `StreamController.renderingAutoTurn` omission).
 */
const props = defineProps<{ kind: RuntimeErrorKind; content: string; suppressRetry?: boolean }>();

const callbacks = inject(CALLBACKS_KEY, undefined);

const LOGIN_HINT_KEYS: Record<string, TranslationKey> = {
  claude: 'chat.runtimeError.unauthenticated.claudeHint',
  codex: 'chat.runtimeError.unauthenticated.codexHint',
  cursor: 'chat.runtimeError.unauthenticated.cursorHint',
  opencode: 'chat.runtimeError.unauthenticated.opencodeHint',
};

function titleKey(kind: RuntimeErrorKind): TranslationKey {
  switch (kind) {
    case 'cli-not-found':
      return 'chat.runtimeError.cliNotFound.title';
    case 'unauthenticated':
      return 'chat.runtimeError.unauthenticated.title';
    case 'context-too-large':
      return 'chat.runtimeError.contextTooLarge.title';
    case 'generic':
      return 'chat.runtimeError.generic.title';
  }
}

function bodyKey(kind: RuntimeErrorKind): TranslationKey | null {
  switch (kind) {
    case 'cli-not-found':
      return 'chat.runtimeError.cliNotFound.body';
    case 'unauthenticated':
      return 'chat.runtimeError.unauthenticated.body';
    case 'context-too-large':
      return 'chat.runtimeError.contextTooLarge.body';
    case 'generic':
      // Generic falls back to showing the raw message as its body.
      return null;
  }
}

const resolvedBodyKey = computed(() => bodyKey(props.kind));
const bodyText = computed(() => {
  const key = resolvedBodyKey.value;
  if (key) return t(key);
  return props.content || '';
});
const showBody = computed(() => !!resolvedBodyKey.value || !!props.content);

const providerId = computed(() => callbacks?.getProviderId() ?? '');
const loginHintCommand = computed(() => {
  const key = LOGIN_HINT_KEYS[providerId.value] ?? 'chat.runtimeError.unauthenticated.genericHint';
  return t(key);
});

const showDetails = computed(() => !!resolvedBodyKey.value && !!props.content);

const canOpenSettings = computed(
  () => !!callbacks && (props.kind === 'cli-not-found' || props.kind === 'unauthenticated')
);
const settingsLabelKey = computed<TranslationKey>(() =>
  props.kind === 'cli-not-found'
    ? 'chat.runtimeError.cliNotFound.openSettings'
    : 'chat.runtimeError.unauthenticated.openSettings'
);
const canRetry = computed(() => !!callbacks?.onRetryLastTurn && !props.suppressRetry);

function onOpenSettings(): void {
  if (!callbacks) return;
  callbacks.openProviderSettings(providerId.value);
}

function onRetry(): void {
  callbacks?.onRetryLastTurn?.();
}

function onCopyHint(): void {
  void navigator.clipboard?.writeText(loginHintCommand.value).then(() => {
    new Notice(t('chat.runtimeError.unauthenticated.copied'));
  });
}

const copyBtnEl = ref<HTMLElement | null>(null);
watchEffect(() => {
  const el = copyBtnEl.value;
  if (!el || el.nodeType !== 1) return;
  el.textContent = '';
  mountIcon(el, 'copy');
});
</script>

<template>
  <div :class="`specorator-runtime-error-card specorator-runtime-error-${kind}`">
    <div class="specorator-runtime-error-header">
      <IconSpan
        icon="alert-triangle"
        css-class="specorator-runtime-error-icon"
      />
      <span class="specorator-runtime-error-title">{{ t(titleKey(kind)) }}</span>
    </div>

    <div
      v-if="showBody"
      class="specorator-runtime-error-body"
    >
      {{ bodyText }}
    </div>

    <div
      v-if="kind === 'unauthenticated'"
      class="specorator-runtime-error-hint"
    >
      <div class="specorator-runtime-error-hint-label">
        {{ t('chat.runtimeError.unauthenticated.hintLabel') }}
      </div>
      <div class="specorator-runtime-error-hint-row">
        <code class="specorator-runtime-error-hint-command">{{ loginHintCommand }}</code>
        <button
          ref="copyBtnEl"
          class="specorator-runtime-error-hint-copy"
          :aria-label="t('chat.runtimeError.unauthenticated.copyHint')"
          @click="onCopyHint"
        />
      </div>
    </div>

    <details
      v-if="showDetails"
      class="specorator-runtime-error-details"
    >
      <summary class="specorator-runtime-error-details-summary">
        {{ t('chat.runtimeError.detailsLabel') }}
      </summary>
      <pre class="specorator-runtime-error-details-text">{{ content }}</pre>
    </details>

    <div class="specorator-runtime-error-actions">
      <button
        v-if="canOpenSettings"
        class="specorator-runtime-error-button"
        @click="onOpenSettings"
      >
        {{ t(settingsLabelKey) }}
      </button>
      <button
        v-if="canRetry"
        class="specorator-runtime-error-button specorator-runtime-error-button-primary"
        @click="onRetry"
      >
        {{ t('chat.runtimeError.retry') }}
      </button>
    </div>
  </div>
</template>
