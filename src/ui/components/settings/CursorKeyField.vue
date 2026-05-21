<script setup lang="ts">
/**
 * T-MPS-049 — CursorKeyField.vue (SPEC-MPS-001 §C8 / §2.7).
 *
 * Settings field for the Cursor API key. Pairs with the
 * `CursorSettingsSection.ts` integration in `SpecoratorSettingTab`.
 *
 * Satisfies REQ-MPS-011 (password input writes to SecretStorePort), REQ-MPS-012
 * (degraded notice when SecretStorePort.available === false), NFR-MPS-001
 * (key never enters PluginSettings).
 *
 * Design notes:
 *   - Two variants: `available` (password input + helper text) and
 *     `unavailable` (notice block, no input rendered).
 *   - `SecretStorePort` arrives as a prop so the component stays testable
 *     without Vue provide/inject scaffolding.
 *   - On blur, calls `port.setSecret(SECRET_ID_CURSOR, value.trim())` and
 *     emits `saved` with the trimmed value. Never writes to PluginSettings.
 *   - All visible copy avoids the forbidden-terms list (NFR-CCS-012).
 *   - No `v-html`. Tests query by `data-testid` only (ADR-009).
 */
import { ref, useId } from 'vue'
import type { SecretStorePort } from '@/domain/ports'
import { SECRET_ID_CURSOR } from '@/domain/ports'

const props = defineProps<{
  port: SecretStorePort
  initialValue?: string
}>()

const emit = defineEmits<{
  saved: [value: string]
  saveFailed: [error: unknown]
}>()

const inputEl = ref<HTMLInputElement | null>(null)
const descriptionId = useId()
const statusId = useId()
const inputValue = ref<string>(props.initialValue ?? '')

defineExpose({ inputEl })

const AVAILABLE_DESCRIPTION =
  "Required to use the Cursor provider. Stored in this device's OS keychain (not synced)."
const UNAVAILABLE_NOTICE =
  'This Obsidian build does not expose the OS keychain, so the Cursor key cannot be stored on this device. Use the Cursor command-line provider instead.'

async function handleBlur(event: FocusEvent): Promise<void> {
  const raw = (event.target as HTMLInputElement).value.trim()
  inputValue.value = raw
  try {
    await props.port.setSecret(SECRET_ID_CURSOR, raw)
    emit('saved', raw)
  } catch (error: unknown) {
    emit('saveFailed', error)
  }
}
</script>

<template>
  <div class="sp-settings-cursor-key">
    <template v-if="props.port.available">
      <div class="sp-settings-cursor-key__row">
        <input
          ref="inputEl"
          type="password"
          autocomplete="off"
          :value="inputValue"
          :aria-describedby="`${descriptionId} ${statusId}`"
          aria-label="Cursor API key"
          placeholder="cursor-…"
          data-testid="settings-cursor-key-input"
          @blur="handleBlur"
        />
      </div>
      <p
        :id="descriptionId"
        data-testid="settings-cursor-key-description"
        class="sp-settings-cursor-key__description"
      >{{ AVAILABLE_DESCRIPTION }}</p>
      <p
        :id="statusId"
        data-testid="settings-cursor-key-status"
        class="sp-settings-cursor-key__status"
        aria-live="polite"
      />
    </template>
    <template v-else>
      <div
        data-testid="settings-cursor-key-unavailable-notice"
        class="sp-settings-cursor-key__notice"
        role="status"
      >{{ UNAVAILABLE_NOTICE }}</div>
    </template>
  </div>
</template>

<style scoped>
.sp-settings-cursor-key {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.sp-settings-cursor-key__row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.sp-settings-cursor-key__row input[type='password'] {
  flex: 1;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  background: var(--background-primary);
  color: var(--text-normal);
  font-family: var(--font-text);
  font-size: 0.875rem;
}

.sp-settings-cursor-key__description,
.sp-settings-cursor-key__status,
.sp-settings-cursor-key__notice {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}
</style>
