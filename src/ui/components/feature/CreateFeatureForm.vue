<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '../common/AppButton.vue'

const emit = defineEmits<{
  submit: [payload: { title: string; area?: string }]
  cancel: []
}>()

const { t } = useI18n()
const title = ref('')
const area = ref('')
const submitting = ref(false)

async function handleSubmit() {
  const trimmedTitle = title.value.trim()
  if (!trimmedTitle) return
  const trimmedArea = area.value.trim()
  submitting.value = true
  try {
    emit('submit', { title: trimmedTitle, area: trimmedArea || undefined })
    title.value = ''
    area.value = ''
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="sp-create-form" @submit.prevent="handleSubmit">
    <label class="sp-create-form__label" for="feature-title">
      {{ t('feature.title') }}
    </label>
    <input
      id="feature-title"
      v-model="title"
      class="sp-create-form__input"
      type="text"
      :placeholder="t('feature.placeholder')"
      autocomplete="off"
      required
    />
    <label class="sp-create-form__label" for="feature-area">
      {{ t('feature.area') }}
    </label>
    <input
      id="feature-area"
      v-model="area"
      class="sp-create-form__input"
      type="text"
      :placeholder="t('feature.areaPlaceholder')"
      autocomplete="off"
      maxlength="5"
    />
    <div class="sp-create-form__actions">
      <AppButton variant="primary" :loading="submitting" :disabled="!title.trim()">
        {{ t('feature.create') }}
      </AppButton>
      <AppButton variant="ghost" type="button" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </AppButton>
    </div>
  </form>
</template>

<style scoped>
.sp-create-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.875rem;
  background: var(--background-secondary);
  border: 1px solid var(--interactive-accent);
  border-radius: 8px;
}

.sp-create-form__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sp-create-form__input {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  color: var(--text-normal);
  font-size: 0.9375rem;
  padding: 0.4rem 0.75rem;
  outline: none;
  width: 100%;
}

.sp-create-form__input:focus {
  border-color: var(--interactive-accent);
}

.sp-create-form__actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
</style>
