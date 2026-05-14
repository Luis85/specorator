<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, inject } from 'vue'
import { tryAsync } from '@/domain/shared/tryAsync'
import { useChatStore } from '@/ui/stores/chatStore'
import { useClaudeCliPort } from '@/ui/composables/useClaudeCliPort'
import { usePlatform } from '@/ui/composables/usePlatform'
import { useVaultPort } from '@/ui/composables/useVaultPort'
import { useWorkspacePort } from '@/ui/composables/useWorkspacePort'
import { useSettingsPort } from '@/ui/composables/useSettingsPort'
import { useLoggerPort } from '@/ui/composables/useLoggerPort'
import { useSessionLogWriter } from '@/ui/composables/useSessionLogWriter'
import { buildPrompt } from '@/application/chat/buildPrompt'
import type { ContextFile } from '@/application/chat/buildPrompt'
import {
  assembleSystemPrompt,
  getActiveFeatureSlug,
  loadWorkflowStateSnapshot,
} from '@/application/chat/assembleSystemPrompt'
import { buildStagePromptMap } from '@/application/chat/stagePromptMap'
import { SETTINGS_VERSION_KEY } from '@/infrastructure/bridge/ports'
import type { SessionId } from '@/domain/chat/SessionId'
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import ContextFileList from './ContextFileList.vue'
import ChatInput from './ChatInput.vue'
import ChatResponse from './ChatResponse.vue'
import SubprocessStartingPill from './SubprocessStartingPill.vue'
import SessionResumeIndicator from './SessionResumeIndicator.vue'

const store = useChatStore()
const claudeCliPort = useClaudeCliPort()
const { isMobile } = usePlatform()
const vaultPort = useVaultPort()
const workspacePort = useWorkspacePort()
const settingsPort = useSettingsPort()
const loggerPort = useLoggerPort()
const sessionLogWriterFactory = useSessionLogWriter()

/**
 * Generate a UUID for new thread ids. Falls back to a timestamp-keyed value
 * when `crypto.randomUUID` is missing (older test environments). The fallback
 * is collision-resistant enough for in-memory thread maps within a session.
 */
function generateThreadId(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined
  if (c?.randomUUID !== undefined) return c.randomUUID()
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Frozen stage-prompt descriptor table. Built once per component instance and
 * passed to `assembleSystemPrompt` on every send (REQ-ASM-019 — recomputed
 * per send, but the descriptor source is referentially stable).
 */
const stagePromptMap = buildStagePromptMap()

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

/**
 * Compute the stage-aware system-prompt suffix for this send (REQ-ASM-013,
 * REQ-ASM-014, REQ-ASM-018, REQ-ASM-019). Resolves the active feature from
 * the current editor file, reads its workflow-state, and assembles a
 * one-shot stage preamble. Any failure falls back to an empty suffix so
 * the send still proceeds (REQ-ASM-015).
 */
async function computeStagePromptContext(
  specsFolder: string,
): Promise<{ slug: string | null; systemPromptSuffix: string }> {
  const activeFile = workspacePort.getActiveFile()
  const slug = getActiveFeatureSlug(activeFile?.path ?? null, specsFolder)
  const snapshot =
    slug !== null
      ? await loadWorkflowStateSnapshot(slug, vaultPort, loggerPort, specsFolder)
      : null
  const systemPromptSuffix = assembleSystemPrompt(snapshot, stagePromptMap)
  return { slug, systemPromptSuffix }
}

/**
 * Load file contents for all context files; failed reads yield empty content.
 */
async function loadContextFileBodies(): Promise<ContextFile[]> {
  return Promise.all(
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
}

/**
 * Resolve (or lazily create) the active `ChatThreadRecord`. Returns the
 * thread id and whether this turn carries a resume session id (REQ-ASM-035).
 */
function resolveActiveThread(args: {
  slug: string | null
  transport: 'api-key' | 'subscription'
}): { threadId: string; resumeSessionId: SessionId | undefined; isResumedTurn: boolean } {
  const nowIso = new Date().toISOString()
  let threadId = store.activeThreadId
  if (threadId === null || !store.chatThreads.has(threadId)) {
    threadId = threadId ?? generateThreadId()
    const fresh: ChatThreadRecord = {
      threadId,
      sessionId: null,
      feature: args.slug,
      logPath: '',
      transport: args.transport,
      createdAt: nowIso,
      lastUsedAt: nowIso,
    }
    store.upsertThread(fresh)
    store.setActiveThreadId(threadId)
  }
  const record = store.chatThreads.get(threadId)
  const resumeSessionId = record?.sessionId ?? undefined
  return { threadId, resumeSessionId, isResumedTurn: resumeSessionId !== undefined }
}

/**
 * Fire-and-forget mirror of a successful turn to the vault (REQ-ASM-040). The
 * writer drops the write silently when no `session_id` has been captured yet
 * (first-ever turn on an `'api-key'` thread). All failures are routed to
 * `loggerPort.warn` so the chat-send path completes normally.
 */
function mirrorTurnToVault(args: {
  threadId: string
  userMessage: string
  assistantResponse: string
}): void {
  const thread = store.chatThreads.get(args.threadId)
  if (thread === undefined) return
  void sessionLogWriterFactory
    .getWriter()
    .then((writer) =>
      writer.appendUserAssistant(thread, {
        user: args.userMessage,
        assistant: args.assistantResponse,
      }),
    )
    .catch((error: unknown) => {
      loggerPort.warn('SessionLogWriter.appendUserAssistant failed', {
        threadId: args.threadId,
        reason: error instanceof Error ? error.message : String(error),
      })
    })
}

/**
 * Apply success-side store mutations and schedule the vault mirror.
 */
function applySuccessfulTurn(args: {
  threadId: string
  isResumedTurn: boolean
  userMessage: string
  assistantResponse: string
  truncated: boolean
}): void {
  store.setResponse(args.assistantResponse, args.truncated)
  store.setUserText('')
  store.markThreadUsed(args.threadId)
  if (args.isResumedTurn) {
    // Flash the resume indicator for this turn only (REQ-ASM-035).
    store.setSessionResumed(true)
  }
  mirrorTurnToVault({
    threadId: args.threadId,
    userMessage: args.userMessage,
    assistantResponse: args.assistantResponse,
  })
}

// Send handler
async function handleSend(): Promise<void> {
  const text = store.userText.trim()
  if (!text) return // REQ-CCS-015: empty text guard
  if (store.status === 'loading') return
  if (!available.value) return

  // Snapshot the raw user text *before* beginRequest() so we can mirror it to
  // the session log post-turn — beginRequest does not clear userText, but the
  // success branch below does.
  const userMessage = store.userText

  store.beginRequest()

  // Stage-aware system-prompt suffix (REQ-ASM-013, REQ-ASM-014, REQ-ASM-018,
  // REQ-ASM-019). Recomputed every send — no caching. Resolves the active
  // feature from the current editor file, reads its workflow-state, and
  // assembles a one-shot stage preamble. Any failure (no active file, file
  // not under specsFolder, vault read error, malformed frontmatter, unknown
  // stage) falls back to an empty suffix so the send still proceeds.
  const settings = await settingsPort.getSettings()
  const { slug, systemPromptSuffix } = await computeStagePromptContext(settings.specsFolder)

  // ── Session-persistence wiring (T-ASM-057, REQ-ASM-031/034/035/037/040) ──
  const transport: 'api-key' | 'subscription' =
    settings.transportKind === 'subscription' ? 'subscription' : 'api-key'
  const { threadId, resumeSessionId, isResumedTurn } = resolveActiveThread({ slug, transport })
  const onSessionId = (id: SessionId): void => {
    store.captureSessionId(threadId, id)
  }

  const loadedFiles = await loadContextFileBodies()
  const { prompt, truncated } = buildPrompt(store.userText, loadedFiles)

  if (claudeCliPort === undefined) {
    store.setError('query_failed')
    return
  }

  // Cold-spawn pill (R-ASM-003). Cleared on completion or error.
  store.setCliStartingUp(true)
  const queryResult = await tryAsync(() =>
    claudeCliPort.query(prompt, {
      timeoutMs: 30_000,
      systemPromptSuffix,
      resumeSessionId,
      onSessionId,
    }),
  )
  store.setCliStartingUp(false)

  if (!queryResult.ok) {
    // `claudeCliPort.query` is contracted never to throw (returns a Result),
    // but a rogue mock or future regression could; fall back to query_failed.
    store.setError('query_failed')
    await nextTick()
    focusTextarea()
    return
  }

  const result = queryResult.value
  if (result.ok) {
    applySuccessfulTurn({
      threadId,
      isResumedTurn,
      userMessage,
      assistantResponse: result.value,
      truncated,
    })
  } else {
    store.setError(result.error.errorCode === 'TIMEOUT' ? 'timeout' : 'query_failed')
  }
  await nextTick()
  focusTextarea()
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
  // Cast to string|undefined: legacy stored settings may lack this field at runtime.
  return ((settings.anthropicApiKey as string | undefined) ?? '').trim() === ''
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
      <div class="sp-chat__header">
        <h2 class="sp-chat__title">Ask Claude.</h2>
        <SessionResumeIndicator :resumed="store.sessionResumed" />
        <SubprocessStartingPill :visible="store.cliStartingUp" />
      </div>

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

.sp-chat__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
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
