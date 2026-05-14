<script setup lang="ts">
/**
 * T-ASM-017 — ClaudeCliPathField.vue (SPEC-ASM-001 §7.5).
 *
 * Settings field for the Claude CLI path. Pairs with §10.2 wiring in
 * `SpecoratorSettingTab.renderClaudeCliPathField()`.
 *
 * Satisfies: REQ-ASM-004 (field present), REQ-ASM-005 (autodetect surface),
 * REQ-ASM-008 (verbatim ToS disclosure copy below the input).
 *
 * Notes:
 *   - `update:modelValue` fires on blur with the trimmed value (SPEC §7.5).
 *   - `autodetect` and `test` are no-payload signals consumed by the settings
 *     tab. The component itself performs no I/O.
 *   - All visible copy avoids the forbidden-terms list (NFR-CCS-012,
 *     `tests/ui/i18n/forbidden-terms.test.ts`).
 *   - No `v-html`. No CSS-class / id selectors in tests (ADR-009).
 */
import { ref, useId } from 'vue'

defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  autodetect: []
  test: []
}>()

const inputEl = ref<HTMLInputElement | null>(null)
const descriptionId = useId()
const statusId = useId()

defineExpose({ inputEl })

const REQ_ASM_008_COPY =
  'Specorator does not handle your Claude.ai credentials. The `claude` CLI you installed manages its own login.'

function handleBlur(event: FocusEvent): void {
  const raw = (event.target as HTMLInputElement).value
  emit('update:modelValue', raw.trim())
}

function handleAutodetect(): void {
  emit('autodetect')
}

function handleTest(): void {
  emit('test')
}
</script>

<template>
  <div class="sp-settings-cli-path">
    <div class="sp-settings-cli-path__row">
      <input
        ref="inputEl"
        type="text"
        :value="modelValue"
        :aria-describedby="`${descriptionId} ${statusId}`"
        aria-label="Claude CLI path"
        placeholder="/usr/local/bin/claude"
        data-testid="settings-claude-cli-path-input"
        @blur="handleBlur"
      />
      <button
        type="button"
        aria-label="Autodetect Claude CLI path"
        data-testid="settings-claude-cli-path-autodetect"
        @click="handleAutodetect"
      >
        Autodetect
      </button>
      <button
        type="button"
        aria-label="Test Claude CLI path"
        data-testid="settings-claude-cli-path-test"
        @click="handleTest"
      >
        Test
      </button>
    </div>
    <p
      :id="descriptionId"
      data-testid="settings-claude-cli-path-description"
      class="sp-settings-cli-path__description"
    >{{ REQ_ASM_008_COPY }}</p>
    <p
      :id="statusId"
      data-testid="settings-claude-cli-path-status"
      class="sp-settings-cli-path__status"
      aria-live="polite"
    />
  </div>
</template>

<style scoped>
.sp-settings-cli-path {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.sp-settings-cli-path__row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.sp-settings-cli-path__row input[type='text'] {
  flex: 1;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  background: var(--background-primary);
  color: var(--text-normal);
  font-family: var(--font-text);
  font-size: 0.875rem;
}

.sp-settings-cli-path__description,
.sp-settings-cli-path__status {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}
</style>
