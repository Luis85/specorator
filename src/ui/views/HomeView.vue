<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import FeatureCard from '../components/feature/FeatureCard.vue'
import CreateFeatureForm from '../components/feature/CreateFeatureForm.vue'
import AppButton from '../components/common/AppButton.vue'
import { useFeatures } from '../composables/useFeatures'

const { t } = useI18n()
const router = useRouter()
const { activeItems, loading, error, loadFeatures, createFeature, activateFeature, archiveFeature } = useFeatures()
const showCreateForm = ref(false)

onMounted(loadFeatures)

async function handleCreate(title: string) {
  await createFeature(title)
  showCreateForm.value = false
}
</script>

<template>
  <div class="sp-home">
    <header class="sp-home__header">
      <div>
        <h1 class="sp-home__title">{{ t('home.title') }}</h1>
        <p class="sp-home__subtitle">{{ t('home.subtitle') }}</p>
      </div>
    </header>

    <section class="sp-home__section">
      <div class="sp-home__section-header">
        <h2 class="sp-home__section-title">{{ t('home.activeFeatures') }}</h2>
        <AppButton variant="primary" size="sm" @click="showCreateForm = !showCreateForm">
          + {{ t('feature.create') }}
        </AppButton>
      </div>

      <CreateFeatureForm
        v-if="showCreateForm"
        @submit="handleCreate"
        @cancel="showCreateForm = false"
      />

      <p v-if="loading" class="sp-home__meta">{{ t('common.loading') }}</p>
      <p v-else-if="error" class="sp-home__error">{{ error }}</p>
      <p v-else-if="activeItems.length === 0 && !showCreateForm" class="sp-home__meta">
        {{ t('home.noActiveFeatures') }}
      </p>

      <div v-else class="sp-home__cards">
        <FeatureCard
          v-for="feature in activeItems"
          :key="feature.id"
          :feature="feature"
          @activate="activateFeature"
          @archive="archiveFeature"
          @open="router.push({ name: 'features' })"
        />
      </div>
    </section>

    <div class="sp-home__nav">
      <AppButton variant="ghost" @click="router.push({ name: 'features' })">
        {{ t('nav.features') }} →
      </AppButton>
    </div>
  </div>
</template>

<style scoped>
.sp-home {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.sp-home__header { display: flex; align-items: flex-start; justify-content: space-between; }
.sp-home__title { margin: 0; font-size: 1.25rem; font-weight: 700; color: var(--text-normal); }
.sp-home__subtitle { margin: 0.25rem 0 0; font-size: 0.875rem; color: var(--text-muted); }

.sp-home__section { display: flex; flex-direction: column; gap: 0.75rem; }
.sp-home__section-header { display: flex; align-items: center; justify-content: space-between; }
.sp-home__section-title { margin: 0; font-size: 0.875rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }

.sp-home__cards { display: flex; flex-direction: column; gap: 0.625rem; }
.sp-home__meta { color: var(--text-muted); font-size: 0.875rem; margin: 0; }
.sp-home__error { color: var(--text-error); font-size: 0.875rem; margin: 0; }

.sp-home__nav { display: flex; gap: 0.5rem; }
</style>
