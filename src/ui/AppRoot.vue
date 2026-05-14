<script setup lang="ts">
import { computed, onMounted, onUnmounted, type Component } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import AppToast from './components/common/AppToast.vue'
import MainLayout from './layouts/MainLayout.vue'
import { useNotificationStore } from './stores/notificationStore'
import { useSettingsPort } from './composables/useSettingsPort'

const route = useRoute()
const router = useRouter()
const notificationStore = useNotificationStore()
const settingsPort = useSettingsPort()

const layout = computed<Component>(() => route.meta.layout ?? MainLayout)

function onNotice(e: Event) {
  const { message, durationMs } = (e as CustomEvent<{
    severity: 'error' | 'warning' | 'success' | 'info'
    message: string
    durationMs: number
  }>).detail
  notificationStore.addNotice(message, durationMs)
}

function onOpenFile(e: Event) {
  const { path } = (e as CustomEvent<{ path: string }>).detail
  void router.push({ name: 'file', params: { filePath: path } })
}

function onNavigate(e: Event) {
  const { path } = (e as CustomEvent<{ path: string }>).detail
  void router.push(path)
}

onMounted(async () => {
  window.addEventListener('sp:notice', onNotice)
  window.addEventListener('sp:open-file', onOpenFile)
  window.addEventListener('sp:navigate', onNavigate)
  const s = await settingsPort.getSettings()
  if (!s.onboardingComplete) {
    void router.push('/onboarding')
  }
})

onUnmounted(() => {
  window.removeEventListener('sp:notice', onNotice)
  window.removeEventListener('sp:open-file', onOpenFile)
  window.removeEventListener('sp:navigate', onNavigate)
})
</script>

<template>
  <div class="sp-app" data-testid="app-root">
    <component :is="layout">
      <RouterView />
    </component>
    <AppToast />
  </div>
</template>

<style>
/* Scope shared reset to the plugin mount root so Obsidian host UI is untouched. */
.specorator-root,
.specorator-root *,
.specorator-root *::before,
.specorator-root *::after {
  box-sizing: border-box;
}

/* Global utility: visually-hidden but screen-reader-readable. Kept here in
   AppRoot's unscoped <style> block so the SFC-driven build pipeline tracks
   the rule and emits it into styles.css on every regeneration. Previously
   lived as plain CSS in styles.css and got pruned on every build:web run
   (recurring Codex P2). Consumed by ContextFileChip.vue and any other
   component that surfaces accessible labels without visible text. */
.specorator-root .sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>

<!-- Standalone-only variables are imported by main.ts and scoped to .specorator-root.
     In Obsidian, the theme provides these variables; we must NOT set them
     on :root or body as that would override the entire Obsidian UI. -->

<style scoped>
.sp-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
</style>
