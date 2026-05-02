<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../components/common/AppButton.vue'
import { useSettings } from '../composables/useSettings'
import { SUPPORTED_LOCALES } from '../i18n'
import type { PluginSettings } from '@/infrastructure/bridge/IBridge'

const { t } = useI18n()
const { settings, loadSettings, saveSettings } = useSettings()
const saved = ref(false)
const saving = ref(false)

onMounted(loadSettings)

async function handleSave() {
  saving.value = true
  try {
    await saveSettings({ ...settings.value })
    saved.value = true
    setTimeout(() => { saved.value = false }, 2500)
  } finally {
    saving.value = false
  }
}

function update<K extends keyof PluginSettings>(key: K, value: PluginSettings[K]) {
  settings.value = { ...settings.value, [key]: value }
}
</script>

<template>
  <div class="sp-settings">
    <h1 class="sp-settings__title">{{ t('settings.title') }}</h1>

    <div class="sp-settings__fields">
      <div class="sp-settings__field">
        <label class="sp-settings__label" for="locale">{{ t('settings.language') }}</label>
        <select
          id="locale"
          class="sp-settings__select"
          :value="settings.locale"
          @change="(e) => update('locale', (e.target as HTMLSelectElement).value)"
        >
          <option v-for="l in SUPPORTED_LOCALES" :key="l" :value="l">
            {{ l.toUpperCase() }}
          </option>
        </select>
      </div>

      <div class="sp-settings__field">
        <label class="sp-settings__label" for="featuresFolder">{{ t('settings.featuresFolder') }}</label>
        <input
          id="featuresFolder"
          class="sp-settings__input"
          type="text"
          :value="settings.featuresFolder"
          @input="(e) => update('featuresFolder', (e.target as HTMLInputElement).value)"
        />
      </div>

      <div class="sp-settings__field">
        <label class="sp-settings__label" for="archiveFolder">{{ t('settings.archiveFolder') }}</label>
        <input
          id="archiveFolder"
          class="sp-settings__input"
          type="text"
          :value="settings.archiveFolder"
          @input="(e) => update('archiveFolder', (e.target as HTMLInputElement).value)"
        />
      </div>

      <div class="sp-settings__field">
        <label class="sp-settings__label" for="gateStrictness">{{ t('settings.gateStrictness') }}</label>
        <select
          id="gateStrictness"
          class="sp-settings__select"
          :value="settings.gateStrictness"
          @change="(e) => update('gateStrictness', (e.target as HTMLSelectElement).value as 'strict' | 'lenient')"
        >
          <option value="strict">{{ t('settings.strict') }}</option>
          <option value="lenient">{{ t('settings.lenient') }}</option>
        </select>
      </div>

      <div class="sp-settings__field sp-settings__field--inline">
        <label class="sp-settings__label" for="teamMode">{{ t('settings.teamMode') }}</label>
        <input
          id="teamMode"
          type="checkbox"
          :checked="settings.teamMode"
          @change="(e) => update('teamMode', (e.target as HTMLInputElement).checked)"
        />
      </div>
    </div>

    <div class="sp-settings__footer">
      <AppButton variant="primary" :loading="saving" @click="handleSave">
        {{ t('settings.save') }}
      </AppButton>
      <span v-if="saved" class="sp-settings__saved">{{ t('settings.saved') }}</span>
    </div>
  </div>
</template>

<style scoped>
.sp-settings {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.sp-settings__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-normal);
}

.sp-settings__fields {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.sp-settings__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.sp-settings__field--inline {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}

.sp-settings__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.sp-settings__input,
.sp-settings__select {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  color: var(--text-normal);
  font-size: 0.875rem;
  padding: 0.375rem 0.625rem;
  outline: none;
}

.sp-settings__input:focus,
.sp-settings__select:focus {
  border-color: var(--interactive-accent);
}

.sp-settings__footer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.sp-settings__saved {
  font-size: 0.875rem;
  color: #4ade80;
}
</style>
