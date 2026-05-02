<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, RouterLink, useRouter } from 'vue-router'
import AppToast from './components/common/AppToast.vue'
import { useNotificationStore } from './stores/notificationStore'

const { t } = useI18n()
const router = useRouter()
const notificationStore = useNotificationStore()

function onNotice(e: Event) {
  const { message, durationMs } = (e as CustomEvent<{ message: string; durationMs: number }>).detail
  notificationStore.addNotice(message, durationMs)
}

function onOpenFile(e: Event) {
  const { path } = (e as CustomEvent<{ path: string }>).detail
  router.push({ name: 'file', params: { filePath: path } })
}

onMounted(() => {
  window.addEventListener('sp:notice', onNotice)
  window.addEventListener('sp:open-file', onOpenFile)
})

onUnmounted(() => {
  window.removeEventListener('sp:notice', onNotice)
  window.removeEventListener('sp:open-file', onOpenFile)
})
</script>

<template>
  <div class="sp-app">
    <nav class="sp-nav">
      <RouterLink class="sp-nav__link" to="/" active-class="sp-nav__link--active" exact>
        {{ t('nav.home') }}
      </RouterLink>
      <RouterLink class="sp-nav__link" to="/features" active-class="sp-nav__link--active">
        {{ t('nav.features') }}
      </RouterLink>
      <RouterLink class="sp-nav__link" to="/settings" active-class="sp-nav__link--active">
        {{ t('nav.settings') }}
      </RouterLink>
    </nav>
    <main class="sp-main">
      <RouterView />
    </main>
    <AppToast />
  </div>
</template>

<style>
/* Global reset — safe in both Obsidian and standalone mode. */
* { box-sizing: border-box; }
</style>

<!-- Standalone-only styles injected by main.ts via a <style> tag on #app.
     In Obsidian, the theme provides these variables; we must NOT set them
     on :root or body as that would override the entire Obsidian UI. -->

<style scoped>
.sp-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.sp-nav {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--background-modifier-border);
  background: var(--background-secondary);
  padding: 0 0.5rem;
  flex-shrink: 0;
}

.sp-nav__link {
  padding: 0.5rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-muted);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}

.sp-nav__link:hover {
  color: var(--text-normal);
}

.sp-nav__link--active {
  color: var(--text-normal);
  border-bottom-color: var(--interactive-accent);
}

.sp-main {
  flex: 1;
  overflow-y: auto;
}
</style>
