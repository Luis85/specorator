<script setup lang="ts">
import { Notice } from 'obsidian';
import { computed, ref, watch } from 'vue';

import type { ProviderCliInstall, ProviderCliInstallMethod } from '@/core/providers/types';
import { t } from '@/i18n/i18n';

import { platformInstallMethods } from '../../cliInstallRunner';
import type { InstallRunState } from '../stores/onboardingStore';
import InstallConfirm from './InstallConfirm.vue';
import InstallOutcome from './InstallOutcome.vue';

const props = defineProps<{
  providerId: string;
  displayName: string;
  install: ProviderCliInstall;
  run: InstallRunState;
  /** Display name of the provider holding the store-wide install lock, if any. */
  blockedBy?: string | null;
}>();

const emit = defineEmits<{
  run: [ProviderCliInstallMethod];
  cancel: [];
}>();

const methods = computed(() => platformInstallMethods(props.install.methods));
const selectedId = ref(methods.value[0]?.id ?? '');
const confirming = ref(false);
const copied = ref(false);

// A platform-filtered list can change identity when the catalog of methods
// changes under us; keep the selection valid rather than silently disabling Run.
watch(methods, (next) => {
  if (!next.some((method) => method.id === selectedId.value)) {
    selectedId.value = next[0]?.id ?? '';
  }
});

const selected = computed<ProviderCliInstallMethod | null>(
  () => methods.value.find((method) => method.id === selectedId.value) ?? null,
);
const isRunning = computed(() => props.run.phase === 'running');
const canSpawn = computed(() => selected.value?.argv !== null && selected.value !== undefined);
const isBlocked = computed(() => Boolean(props.blockedBy));
// Resolved here rather than as template conditionals: the running card already
// says "Installing…", so the waiting note belongs only on the others.
const blockedNote = computed(() => (
  isBlocked.value && !isRunning.value
    ? t('onboarding.install.otherRunning', { name: props.blockedBy ?? '' })
    : null
));
const showRunButton = computed(() => canSpawn.value && !isRunning.value && !confirming.value);
const displayCommand = computed(() => selected.value?.displayCommand ?? '');
const copyLabel = computed(() => (
  copied.value ? t('onboarding.install.copied') : t('onboarding.install.copy')
));

// The catalog is provider-contributed, but a docs link still only gets rendered
// as a real href when it is https — never a `javascript:` URL.
const docsHref = computed(() => (
  props.install.docsUrl.startsWith('https://') ? props.install.docsUrl : null
));

function requestRun(): void {
  if (!selected.value?.argv) return;
  confirming.value = true;
}

function confirmRun(): void {
  const method = selected.value;
  confirming.value = false;
  if (!method?.argv) return;
  emit('run', method);
}

async function copyCommand(): Promise<void> {
  const command = displayCommand.value;
  if (!command) return;
  try {
    await navigator.clipboard.writeText(command);
    copied.value = true;
    window.setTimeout(() => { copied.value = false; }, 1500);
  } catch {
    new Notice(command);
  }
}
</script>

<template>
  <div
    class="specorator-onboarding-install"
    :data-provider="providerId"
  >
    <h4 class="specorator-onboarding-install-heading">
      {{ t('onboarding.install.heading') }}
    </h4>

    <div class="specorator-onboarding-install-row">
      <label
        class="specorator-onboarding-install-label"
        :for="`install-method-${providerId}`"
      >
        {{ t('onboarding.install.method') }}
      </label>
      <select
        :id="`install-method-${providerId}`"
        v-model="selectedId"
        class="dropdown"
        :disabled="isRunning"
      >
        <option
          v-for="method in methods"
          :key="`${method.id}-${method.displayCommand}`"
          :value="method.id"
        >
          {{ method.label }}
        </option>
      </select>
    </div>

    <div class="specorator-onboarding-install-command">
      <code>{{ displayCommand }}</code>
      <button
        type="button"
        data-action="copy"
        @click="copyCommand()"
      >
        {{ copyLabel }}
      </button>
    </div>

    <p
      v-if="!canSpawn"
      class="specorator-onboarding-install-manual"
    >
      {{ t('onboarding.install.manualOnly') }}
    </p>

    <div class="specorator-onboarding-install-actions">
      <button
        v-if="showRunButton"
        type="button"
        class="mod-cta"
        data-action="install"
        :disabled="isBlocked"
        @click="requestRun()"
      >
        {{ t('onboarding.install.run') }}
      </button>
      <!-- Installs are serialized store-wide: three of the four providers install
           through a global `npm install -g`, and two package managers mutating one
           prefix at once can clobber each other's result. -->
      <span
        v-if="blockedNote"
        class="specorator-onboarding-install-status"
        data-state="blocked"
      >
        {{ blockedNote }}
      </span>
      <button
        v-if="isRunning"
        type="button"
        data-action="cancel-install"
        @click="emit('cancel')"
      >
        {{ t('onboarding.install.cancel') }}
      </button>
      <span
        v-if="isRunning"
        class="specorator-onboarding-install-status"
      >
        {{ t('onboarding.install.running') }}
      </span>
      <a
        v-if="docsHref"
        :href="docsHref"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('onboarding.providers.docs') }}
      </a>
    </div>

    <!-- Explicit confirm before the first spawn: this runs a real package
         manager on the user's machine, so it is never a single stray click. -->
    <InstallConfirm
      v-if="confirming"
      :command="displayCommand"
      @confirm="confirmRun()"
      @cancel="confirming = false"
    />

    <InstallOutcome
      :display-name="displayName"
      :run="run"
    />
  </div>
</template>

<style scoped>
.specorator-onboarding-install {
  border-top: 1px solid var(--sp-border);
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-s);
  margin-top: var(--sp-space-s);
  padding-top: var(--sp-space-s);
}

.specorator-onboarding-install-heading {
  font-size: var(--sp-font-small);
  font-weight: var(--sp-weight-semibold);
  margin: 0;
}

.specorator-onboarding-install-row,
.specorator-onboarding-install-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-space-s);
}

.specorator-onboarding-install-label {
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
}

.specorator-onboarding-install-command {
  align-items: center;
  background: var(--sp-surface-raised);
  border-radius: var(--sp-radius-s);
  display: flex;
  gap: var(--sp-space-s);
  justify-content: space-between;
  padding: var(--sp-space-2xs) var(--sp-space-s);
}

.specorator-onboarding-install-command code {
  font-family: var(--sp-mono);
  font-size: var(--sp-font-smaller);
  overflow-x: auto;
  white-space: pre;
}

.specorator-onboarding-install-manual,
.specorator-onboarding-install-status {
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
  margin: 0;
}

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
