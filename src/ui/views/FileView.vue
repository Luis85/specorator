<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppButton from '../components/common/AppButton.vue'
import { useBridge } from '../composables/useBridge'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const bridge = useBridge()

const filePath = decodeURIComponent(route.params.encodedPath as string)
const content = ref<string | null>(null)
const notFound = ref(false)
const copied = ref(false)

onMounted(async () => {
  try {
    content.value = await bridge.readFile(filePath)
  } catch {
    notFound.value = true
  }
})

async function copyContent() {
  if (content.value === null) return
  await navigator.clipboard.writeText(content.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}
</script>

<template>
  <div class="sp-file-view">
    <header class="sp-file-view__header">
      <AppButton variant="ghost" size="sm" @click="router.back()">← {{ t('common.back') }}</AppButton>
      <h1 class="sp-file-view__path">{{ filePath }}</h1>
      <AppButton v-if="content !== null" variant="secondary" size="sm" @click="copyContent">
        {{ copied ? t('file.copied') : t('file.copy') }}
      </AppButton>
    </header>

    <div v-if="notFound" class="sp-file-view__not-found">
      {{ t('file.notFound') }}
    </div>

    <pre v-else-if="content !== null" class="sp-file-view__content">{{ content }}</pre>

    <p v-else class="sp-file-view__loading">{{ t('common.loading') }}</p>
  </div>
</template>

<style scoped>
.sp-file-view {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
}

.sp-file-view__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.sp-file-view__path {
  flex: 1;
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-normal);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sp-file-view__not-found {
  color: var(--text-muted);
  font-size: 0.875rem;
}

.sp-file-view__content {
  flex: 1;
  margin: 0;
  padding: 1rem;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 0.375rem;
  font-family: var(--font-monospace, monospace);
  font-size: 0.8125rem;
  line-height: 1.6;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-normal);
}

.sp-file-view__loading {
  color: var(--text-muted);
  font-size: 0.875rem;
  margin: 0;
}
</style>
