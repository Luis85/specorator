<script setup lang="ts">
import { t } from '@/i18n/i18n';

/**
 * The explicit confirm that stands between a click and a real package-manager
 * run on the user's machine. Its own component so `InstallPanel`'s template
 * doesn't carry a nested dialog's branches, and so the prompt always names the
 * exact command that will execute.
 */
defineProps<{ command: string }>();
defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <div class="specorator-onboarding-install-confirm">
    <p>{{ t('onboarding.install.confirm', { command }) }}</p>
    <div class="specorator-onboarding-install-actions">
      <button
        type="button"
        class="mod-cta"
        data-action="confirm-install"
        @click="$emit('confirm')"
      >
        {{ t('onboarding.install.confirmRun') }}
      </button>
      <button
        type="button"
        data-action="abort-install"
        @click="$emit('cancel')"
      >
        {{ t('onboarding.close') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.specorator-onboarding-install-confirm {
  background: var(--sp-surface-raised);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-m);
  padding: var(--sp-space-s);
}

.specorator-onboarding-install-confirm p {
  margin: 0 0 var(--sp-space-s);
}
</style>
