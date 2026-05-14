<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, inject } from 'vue'
import type { InjectionKey, Ref } from 'vue'
import { tryAsync } from '@/domain/shared/tryAsync'
import { useChatStore } from '@/ui/stores/chatStore'
import { useClaudeCliPort } from '@/ui/composables/useClaudeCliPort'
import { usePlatform } from '@/ui/composables/usePlatform'
import { useVaultPort } from '@/ui/composables/useVaultPort'
import { useWorkspacePort } from '@/ui/composables/useWorkspacePort'
import { useSettingsPort } from '@/ui/composables/useSettingsPort'
import { buildPrompt } from '@/application/chat/buildPrompt'
import type { ContextFile } from '@/application/chat/buildPrompt'
import ContextFileList from './ContextFileList.vue'
import ChatInput from './ChatInput.vue'
import ChatResponse from './ChatResponse.vue'

// Settings-version injection key (provided by SpecoratorView or defaulting to ref(0))
const SETTINGS_VERSION_KEY: InjectionKey<Ref<number>> = Symbol('settingsVersion')

const store = useChatStore()
const claudeCliPort = useClaudeCliPort()
const { isMobile } = usePlatform()
const vaultPort = useVaultPort()
const workspacePort = useWorkspacePort()
const settingsPort = useSettingsPort()

// Local reactive state
const available = ref(false)
const availabilityChecked = ref(false)
const containerEl = ref<HTMLElement | null>(null)
const inputRef = ref<InstanceType<typeof ChatInput> | null>(null)

// Settings-version watcher (D-CCS-003)
const settingsVersion = inject(SETTINGS_VERSION_KEY, ref(0))
watch(settingsVersion, async () => {
  if (claudeCliPort === undefined) return
  available.value = await claudeCliPort.isAvailable()
})

// Active file watcher
let unsubscribeActiveFile: (() => void) | null = null

function updateActiveFile(snapshot: { path: string; basename: string; extension: string } | null): void {
  if (snapshot !== null) {
    store.setActiveFile({
      path: snapshot.path,
      label: `${snapshot.basename}.${snapshot.extension}`,
      isAuto: true,
    })
  } else {
    store.setActiveFile(null)
  }
}

function focusTextarea(): void {
  // Access the exposed textareaEl from ChatInput via the component instance
  const ta = inputRef.value?.textareaEl as HTMLTextAreaElement | null | undefined
  ta?.focus()
}

onMounted(async () => {
  if (claudeCliPort !== undefined) {
    available.value = await claudeCliPort.isAvailable()
  }
  availabilityChecked.value = true

  // Subscribe to active file changes
  const snapshot = workspacePort.getActiveFile()
  updateActiveFile(snapshot)
  unsubscribeActiveFile = workspacePort.onActiveFileChanged(updateActiveFile)

  await nextTick()
  if (available.value && !isMobile) {
    focusTextarea()
  } else {
    // Focus degraded notice heading
    const heading = containerEl.value?.querySelector('[data-testid="chat-degraded-heading"]') as HTMLElement | null
    heading?.focus()
  }
})

onUnmounted(() => {
  unsubscribeActiveFile?.()
})

// Determine chat response state from store
type ResponseState = 'idle' | 'loading' | 'success' | 'trimmed-success' | 'timeout' | 'error'

const responseState = computed<ResponseState>(() => {
  if (store.status === 'loading') return 'loading'
  if (store.status === 'error') {
    return store.errorType === 'timeout' ? 'timeout' : 'error'
  }
  if (store.response !== null) {
    return store.truncated ? 'trimmed-success' : 'success'
  }
  return 'idle'
})

// Send handler
async function handleSend(): Promise<void> {
  const text = store.userText.trim()
  if (!text) return // REQ-CCS-015: empty text guard
  if (store.status === 'loading') return
  if (!available.value) return

  store.beginRequest()

  // Load file contents for all context files; failed reads yield empty content
  const loadedFiles: ContextFile[] = await Promise.all(
    store.contextFiles.map(async (entry) => {
      const readResult = await tryAsync(() => vaultPort.readFile(entry.path))
      return {
        path: entry.path,
        label: entry.label,
        isAuto: entry.isAuto,
        content: readResult.ok ? readResult.value : '',
      }
    }),
  )

  const { prompt, truncated } = buildPrompt(store.userText, loadedFiles)

  if (claudeCliPort === undefined) { store.setError('query_failed'); return }
  const result = await claudeCliPort.query(prompt, { timeoutMs: 30_000 })

  if (result.ok) {
    store.setResponse(result.value, truncated)
    store.setUserText('')
    await nextTick()
    focusTextarea()
  } else {
    const errorCode = result.error.errorCode
    if (errorCode === 'TIMEOUT') {
      store.setError('timeout')
    } else {
      store.setError('query_failed')
    }
    await nextTick()
    focusTextarea()
  }
}

function handleRemoveFile(event: { path: string }): void {
  store.removeContextFile(event.path)
}

function handleUserTextUpdate(text: string): void {
  store.setUserText(text)
}

// Determine if API key is missing when unavailable
async function isApiKeyMissing(): Promise<boolean> {
  const settings = await settingsPort.getSettings()
  return settings.anthropicApiKey === ''
}

const apiKeyMissing = ref(false)

onMounted(async () => {
  apiKeyMissing.value = await isApiKeyMissing()
})

watch(availabilityChecked, async () => {
  if (availabilityChecked.value && !available.value) {
    apiKeyMissing.value = await isApiKeyMissing()
  }
})

watch(available, async () => {
  if (!available.value) {
    apiKeyMissing.value = await isApiKeyMissing()
  }
})
</script>

<template>
  <div ref="containerEl" class="sp-chat-sidebar" data-testid="chat-sidebar">
    <!-- Mobile degradation (REQ-CCS-020) -->
    <div v-if="isMobile" class="sp-chat__degraded">
      <h3
        class="sp-chat__degraded-heading"
        tabindex="-1"
        data-testid="chat-degraded-heading"
      >
        Chat is available on desktop only.
      </h3>
      <p class="sp-chat__degraded-body">
        Open Obsidian on your Mac, Windows, or Linux computer to use the AI assistant.
      </p>
    </div>

    <!-- Not yet checked (avoid flash of wrong state) -->
    <template v-else-if="!availabilityChecked" />

    <!-- API key missing degraded state (REQ-CCS-018) -->
    <div v-else-if="!available && apiKeyMissing" class="sp-chat__degraded">
      <h3
        class="sp-chat__degraded-heading"
        tabindex="-1"
        data-testid="chat-degraded-heading"
      >
        Chat is not set up yet.
      </h3>
      <p class="sp-chat__degraded-body">
        To use this feature, add your Anthropic key in Settings. Your key is stored privately on this device and is never shared.
      </p>
      <RouterLink
        class="sp-btn sp-btn--secondary sp-btn--md"
        to="/settings"
        data-testid="chat-degraded-settings-link"
      >
        Open settings
      </RouterLink>
    </div>

    <!-- SDK unavailable degraded state (REQ-CCS-019) -->
    <div v-else-if="!available && !apiKeyMissing" class="sp-chat__degraded">
      <h3
        class="sp-chat__degraded-heading"
        tabindex="-1"
        data-testid="chat-degraded-heading"
      >
        AI assistant is not available right now.
      </h3>
      <p class="sp-chat__degraded-body">
        The AI assistant could not start. This may be a temporary issue. If the problem continues, try restarting Obsidian.
      </p>
    </div>

    <!-- Ready state -->
    <template v-else>
      <h2 class="sp-chat__title">Ask Claude.</h2>

      <ContextFileList
        :files="store.contextFiles"
        :disabled="store.status === 'loading'"
        @remove="handleRemoveFile"
      />

      <hr class="sp-chat__divider" />

      <ChatInput
        ref="inputRef"
        :model-value="store.userText"
        :disabled="store.status === 'loading'"
        :loading="store.status === 'loading'"
        @update:model-value="handleUserTextUpdate"
        @send="handleSend"
      />

      <hr class="sp-chat__divider" />

      <ChatResponse
        :state="responseState"
        :text="store.response ?? undefined"
      />
    </template>
  </div>
</template>

<style scoped>
.sp-chat-sidebar {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  height: 100%;
  box-sizing: border-box;
}

.sp-chat__title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-normal);
}

.sp-chat__divider {
  margin: 0;
  border: none;
  border-top: 1px solid var(--background-modifier-border);
}

.sp-chat__degraded {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sp-chat__degraded-heading {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-normal);
}

.sp-chat__degraded-body {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-muted);
}
</style>
