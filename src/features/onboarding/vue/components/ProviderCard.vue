<script setup lang="ts">
import { computed, ref } from 'vue';

import type { ProviderCliInstall, ProviderCliInstallMethod } from '@/core/providers/types';
import { t } from '@/i18n/i18n';

import type { ProviderCliDetection } from '../../providerDetection';
import type { InstallRunState } from '../stores/onboardingStore';
import InstallPanel from './InstallPanel.vue';

const props = defineProps<{
  detection: ProviderCliDetection;
  install: ProviderCliInstall;
  run: InstallRunState;
}>();

const emit = defineEmits<{
  toggle: [boolean];
  install: [ProviderCliInstallMethod];
  cancelInstall: [];
  setPath: [string];
}>();

const manualPath = ref('');
const showManualPath = ref(false);

const statusLabel = computed(() => {
  switch (props.detection.status) {
    case 'found': return t('onboarding.providers.detected');
    case 'missing': return t('onboarding.providers.notDetected');
    default: return t('onboarding.providers.unknown');
  }
});

const isFound = computed(() => props.detection.status === 'found');
/**
 * An install is only offered for a CONFIRMED absence. `unknown` means nothing
 * authoritative could look, so a global install would have the user reinstall a
 * package they may already have — and the re-probe afterwards would still say
 * `unknown`, leaving the same button offered again.
 */
const isMissing = computed(() => props.detection.status === 'missing');

/**
 * The one explanatory line a not-found card shows, resolved here rather than as
 * nested template conditionals: four cases (unusable file, plain absence, and the
 * two unknown reasons) each need their own words, and the template stays one
 * `v-else`.
 */
const statusLine = computed<{ state: string; text: string } | null>(() => {
  const { status, unusablePath, unknownReason, cliCommand } = props.detection;
  if (status === 'found') {
    return null;
  }
  if (unusablePath) {
    return {
      state: 'not-executable',
      text: t('onboarding.providers.notExecutable', { path: unusablePath }),
    };
  }
  if (status === 'missing') {
    return { state: 'missing', text: t('onboarding.providers.needsCli', { command: cliCommand }) };
  }
  return {
    state: 'unknown',
    text: unknownReason === 'external-target'
      ? t('onboarding.providers.unknownExternal', { command: cliCommand })
      : t('onboarding.providers.unknownNoResolver'),
  };
});

const useLabel = computed(() => (
  props.detection.enabled
    ? t('onboarding.providers.enabled')
    : t('onboarding.providers.use', { name: props.detection.displayName })
));

const manualPathLabel = computed(() => (
  props.detection.pinnedPath
    ? t('onboarding.install.manualPathEdit')
    : t('onboarding.install.manualPath')
));

/** Opens the editor seeded with the current pin, so it can be corrected or cleared. */
function openManualPath(): void {
  manualPath.value = props.detection.pinnedPath ?? '';
  showManualPath.value = true;
}

function submitPath(): void {
  emit('setPath', manualPath.value);
  showManualPath.value = false;
}
</script>

<template>
  <section
    class="specorator-onboarding-provider"
    :class="{ 'is-found': isFound, 'is-enabled': detection.enabled }"
    :data-provider="detection.providerId"
    :data-status="detection.status"
  >
    <header class="specorator-onboarding-provider-head">
      <div>
        <h3 class="specorator-onboarding-provider-name">
          {{ detection.displayName }}
        </h3>
        <p class="specorator-onboarding-provider-blurb">
          {{ detection.blurb }}
        </p>
      </div>
      <span
        class="specorator-onboarding-provider-status"
        :data-status="detection.status"
      >
        {{ statusLabel }}
      </span>
    </header>

    <p
      v-if="isFound"
      class="specorator-onboarding-provider-path"
    >
      {{ t('onboarding.providers.foundAt') }}
      <code>{{ detection.cliPath }}</code>
    </p>
    <p
      v-else-if="statusLine"
      class="specorator-onboarding-provider-path"
      :data-state="statusLine.state"
    >
      {{ statusLine.text }}
    </p>

    <label class="specorator-onboarding-provider-use">
      <input
        type="checkbox"
        :checked="detection.enabled"
        :aria-label="t('onboarding.providers.use', { name: detection.displayName })"
        @change="emit('toggle', ($event.target as HTMLInputElement).checked)"
      >
      <span>{{ useLabel }}</span>
    </label>

    <p
      v-if="isFound"
      class="specorator-onboarding-provider-auth"
    >
      {{ t('onboarding.providers.authHint', { command: install.authCommand }) }}
    </p>

    <InstallPanel
      v-if="isMissing"
      :provider-id="detection.providerId"
      :display-name="detection.displayName"
      :install="install"
      :run="run"
      @run="emit('install', $event)"
      @cancel="emit('cancelInstall')"
    />

    <!-- Escape hatch for a binary in a place no PATH scan reaches — including a
         target this host cannot stat at all (Codex in WSL reads its command from
         the same setting). Offered in EVERY state, unlike the installer: it names
         a path rather than assuming one is absent, and hiding it once something
         resolves would strip the only control that can correct or clear a wrong
         pin (blank restores auto-detection) without leaving Setup. Writes the
         host-scoped path, so a synced vault can't push it to another machine. -->
    <div class="specorator-onboarding-provider-manual">
      <button
        v-if="!showManualPath"
        type="button"
        data-action="show-manual-path"
        @click="openManualPath()"
      >
        {{ manualPathLabel }}
      </button>
      <template v-else>
        <input
          v-model="manualPath"
          type="text"
          :placeholder="t('onboarding.install.manualPathPlaceholder')"
          :aria-label="t('onboarding.install.manualPath')"
          @keydown.enter.prevent="submitPath()"
        >
        <button
          type="button"
          data-action="save-manual-path"
          @click="submitPath()"
        >
          {{ t('onboarding.install.manualPathSave') }}
        </button>
        <p class="specorator-onboarding-provider-path">
          {{ t('onboarding.install.manualPathClearHint') }}
        </p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.specorator-onboarding-provider {
  background: var(--sp-surface);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-m);
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-2xs);
  padding: var(--sp-space-m);
}

.specorator-onboarding-provider.is-found {
  border-color: var(--sp-border-focus);
}

.specorator-onboarding-provider-head {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-space-s);
  justify-content: space-between;
}

.specorator-onboarding-provider-name {
  font-size: var(--sp-font-small);
  font-weight: var(--sp-weight-semibold);
  margin: 0;
}

.specorator-onboarding-provider-blurb,
.specorator-onboarding-provider-path,
.specorator-onboarding-provider-auth {
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
  margin: 0;
}

.specorator-onboarding-provider-path code {
  font-family: var(--sp-mono);
  font-size: var(--sp-font-smaller);
  overflow-wrap: anywhere;
}

.specorator-onboarding-provider-status {
  border-radius: var(--sp-radius-s);
  color: var(--sp-text-muted);
  font-size: var(--sp-font-smaller);
  padding: var(--sp-space-3xs) var(--sp-space-2xs);
  white-space: nowrap;
}

.specorator-onboarding-provider-status[data-status="found"] {
  color: var(--sp-success);
}

.specorator-onboarding-provider-use {
  align-items: center;
  display: flex;
  gap: var(--sp-space-2xs);
  font-size: var(--sp-font-small);
  margin-top: var(--sp-space-2xs);
}

.specorator-onboarding-provider-manual {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-space-s);
}

.specorator-onboarding-provider-manual input {
  flex: 1 1 18em;
}

/* The clear hint belongs under the field, not beside it. */
.specorator-onboarding-provider-manual p {
  flex-basis: 100%;
}
</style>
