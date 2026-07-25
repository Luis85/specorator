<script setup lang="ts">
import { computed } from 'vue';

import { t } from '@/i18n/i18n';

import type { InstallRunState } from '../stores/onboardingStore';

/**
 * The result line plus the installer console for one provider's install run.
 * Split out of `InstallPanel` so that component's template keeps a single
 * concern (choose a method, start/stop it) instead of also branching over four
 * terminal states — the shape the complexity gate flagged.
 */
const props = defineProps<{ displayName: string; run: InstallRunState }>();

const consoleText = computed(() => props.run.lines.join('\n'));
</script>

<template>
  <p
    v-if="run.phase === 'succeeded'"
    class="specorator-onboarding-install-result is-ok"
    data-result="succeeded"
  >
    {{ t('onboarding.install.succeeded', { name: displayName }) }}
  </p>
  <p
    v-else-if="run.phase === 'failed'"
    class="specorator-onboarding-install-result is-error"
    data-result="failed"
  >
    {{ t('onboarding.install.failed', { error: run.error ?? '' }) }}
  </p>
  <p
    v-else-if="run.phase === 'cancelled'"
    class="specorator-onboarding-install-result"
    data-result="cancelled"
  >
    {{ t('onboarding.install.cancelled') }}
  </p>

  <pre
    v-if="run.lines.length > 0"
    class="specorator-onboarding-install-console"
    :aria-label="t('onboarding.install.consoleLabel')"
  >{{ consoleText }}</pre>
</template>

<style scoped>
.specorator-onboarding-install-result {
  font-size: var(--sp-font-small);
  margin: 0;
}

.specorator-onboarding-install-result.is-ok {
  color: var(--sp-success);
}

.specorator-onboarding-install-result.is-error {
  color: var(--sp-text-error);
}

.specorator-onboarding-install-console {
  background: var(--sp-surface-raised);
  border-radius: var(--sp-radius-s);
  font-family: var(--sp-mono);
  font-size: var(--sp-font-smaller);
  line-height: var(--sp-line-tight);
  margin: 0;
  max-height: 12em;
  overflow: auto;
  padding: var(--sp-space-s);
  white-space: pre-wrap;
}
</style>
