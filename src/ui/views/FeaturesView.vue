<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FeatureCard from '../components/feature/FeatureCard.vue'
import CreateFeatureForm from '../components/feature/CreateFeatureForm.vue'
import AppButton from '../components/common/AppButton.vue'
import { useFeatures } from '../composables/useFeatures'
import { useBridge } from '../composables/useBridge'

const { t } = useI18n()
const bridge = useBridge()
const { items, loading, error, loadFeatures, createFeature, activateFeature, archiveFeature } =
  useFeatures()
const showCreateForm = ref(false)

onMounted(loadFeatures)

async function handleCreate(title: string) {
  await createFeature(title)
  showCreateForm.value = false
}

async function handleOpen(featureId: string) {
  const feature = items.value.find((f) => f.id === featureId)
  if (!feature) return
  const settings = await bridge.getSettings()
  await bridge.openFile(`${settings.specsFolder}/${feature.slug}/workflow-state.md`)
}
</script>

<template>
  <div class="sp-features">
    <header class="sp-features__header">
      <h1 class="sp-features__title">{{ t('nav.features') }}</h1>
      <AppButton variant="primary" size="sm" @click="showCreateForm = !showCreateForm">
        + {{ t('feature.create') }}
      </AppButton>
    </header>

    <CreateFeatureForm
      v-if="showCreateForm"
      @submit="handleCreate"
      @cancel="showCreateForm = false"
    />

    <p v-if="loading" class="sp-features__meta">{{ t('common.loading') }}</p>
    <p v-else-if="error" class="sp-features__error">{{ error }}</p>

    <template v-else>
      <p v-if="items.length === 0" class="sp-features__empty">
        {{ t('feature.empty') }}
        <br />
        <span class="sp-features__empty-hint">{{ t('feature.createFirst') }}</span>
      </p>

      <div v-else class="sp-features__list">
        <FeatureCard
          v-for="feature in items"
          :key="feature.id"
          :feature="feature"
          @activate="activateFeature"
          @archive="archiveFeature"
          @open="handleOpen"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.sp-features {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sp-features__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sp-features__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-normal);
}

.sp-features__list {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.sp-features__meta,
.sp-features__empty {
  color: var(--text-muted);
  font-size: 0.875rem;
  margin: 0;
  line-height: 1.6;
}

.sp-features__empty-hint {
  font-size: 0.8125rem;
  opacity: 0.7;
}

.sp-features__error {
  color: var(--text-error);
  font-size: 0.875rem;
  margin: 0;
}
</style>
